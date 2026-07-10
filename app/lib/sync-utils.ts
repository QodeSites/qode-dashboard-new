/**
 * sync-utils.ts
 * -------------
 * Shared helpers for the investment-summary sync system:
 * job locking, file whitelist, upload content validation, and path config.
 *
 * All DB access here is limited to the sync_jobs table (job tracking) —
 * client data tables are never written.
 */
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import * as XLSX from "xlsx";

// ---------------------------------------------------------------------------
// Path configuration (overridable via env for the server deployment)
// ---------------------------------------------------------------------------

export const SCRIPTS_BASE_DIR =
  process.env.SCRIPTS_BASE_DIR || "/opt/investment-summary";
export const STAGING_DIR =
  process.env.STAGING_DIR || path.join(process.cwd(), "data", "reports_staging");
export const LIVE_DIR =
  process.env.LIVE_DIR || path.join(process.cwd(), "data", "reports");
export const BACKUP_DIR =
  process.env.BACKUP_DIR || path.join(process.cwd(), "data", "reports_backup");
export const CONFIG_UPLOAD_DIR =
  process.env.CONFIG_UPLOAD_DIR ||
  path.join(SCRIPTS_BASE_DIR, "investment-summary-excel", "config");
export const INPUTS_UPLOAD_DIR =
  process.env.INPUTS_UPLOAD_DIR ||
  path.join(SCRIPTS_BASE_DIR, "investment-summary-excel", "inputs");

// Jobs older than this and still 'running' are considered dead.
export const JOB_TIMEOUT_MINUTES = 30;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

// ---------------------------------------------------------------------------
// Staging vs live resolution
// ---------------------------------------------------------------------------

/**
 * Admins always review from staging (that's the point of the staging step);
 * clients only ever see live. After a publish both directories are identical,
 * so the admin view stays seamless.
 *
 * Ordered list: the first dir containing the requested file wins. Staging may
 * be empty on a fresh setup — falling back to live keeps the admin view from
 * breaking before the first generation.
 */
export function reportsDirsForAccess(isAdmin: boolean): string[] {
  return isAdmin ? [STAGING_DIR, LIVE_DIR] : [LIVE_DIR];
}

export interface StagingManifest {
  job_id: number | null;
  report_date?: string;
  finished?: string;
  generated_by?: string;
}

/**
 * Reads staging/manifest.json written by run_sync.sh (server jobs) or
 * run_local_reports.ps1 (local manual runs, job_id = null).
 */
export async function readStagingManifest(): Promise<StagingManifest | null> {
  const { promises: fs } = await import("fs");
  try {
    const raw = await fs.readFile(path.join(STAGING_DIR, "manifest.json"), "utf-8");
    const parsed = JSON.parse(raw);
    return {
      job_id: typeof parsed.job_id === "number" ? parsed.job_id : null,
      report_date: parsed.report_date,
      finished: parsed.finished,
      generated_by: parsed.generated_by,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// File whitelist + validation rules
// ---------------------------------------------------------------------------

export type UploadDestination = "config" | "inputs";

interface FileRule {
  destination: UploadDestination;
  /** How to validate content: csv header check, yaml key check, or xlsx sheet check */
  kind: "csv" | "yaml" | "xlsx";
  /** Required CSV column headers (exact, trimmed) */
  requiredColumns?: string[];
  /** Required top-level YAML keys */
  requiredKeys?: string[];
  /** Required sheet name for xlsx */
  requiredSheet?: string;
}

export const FILE_RULES: Record<string, FileRule> = {
  "clients.csv": {
    destination: "config",
    kind: "csv",
    requiredColumns: [
      "client_name",
      "client_code",
      "account_name",
      "strategy",
      "status",
      "folder_key",
      "base_folder",
      "filename_prefix",
      "output_file_name",
    ],
  },
  "system_tags.yaml": {
    destination: "config",
    kind: "yaml",
    requiredKeys: [
      "zerodha_total_portfolio",
      "total_portfolio_value",
      "equity_stock_holdings",
      "mutual_funds",
      "liquidcase_stock_holdings",
    ],
  },
  "Strategy_Config.csv": {
    destination: "config",
    kind: "csv",
    requiredColumns: ["Client Name", "Strategy", "Effective From", "Effective To"],
  },
  "Managed_Accounts_Config.xlsx": {
    destination: "config",
    kind: "xlsx",
    requiredSheet: "in",
  },
  "cash_transactions.csv": {
    destination: "inputs",
    kind: "csv",
    requiredColumns: ["Client Name", "Date", "Amount", "Type", "Strategy"],
  },
  "miscellaneous.csv": {
    destination: "inputs",
    kind: "csv",
    requiredColumns: ["Client Name", "Date", "Amount", "Type", "Strategy", "Description"],
  },
};

export function getUploadDir(destination: UploadDestination): string {
  return destination === "config" ? CONFIG_UPLOAD_DIR : INPUTS_UPLOAD_DIR;
}

// ---------------------------------------------------------------------------
// Content validation
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

function validateCsv(buffer: Buffer, requiredColumns: string[]): ValidationResult {
  let headers: string[];
  try {
    const wb = XLSX.read(buffer, { type: "buffer", raw: true, sheetRows: 2 });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    headers = ((rows[0] as unknown[]) || []).map((h) => String(h ?? "").trim());
  } catch (e) {
    return { valid: false, error: `File could not be parsed as CSV: ${e instanceof Error ? e.message : e}` };
  }
  const missing = requiredColumns.filter((c) => !headers.includes(c));
  if (missing.length > 0) {
    return {
      valid: false,
      error: `Missing required column(s): ${missing.map((m) => `'${m}'`).join(", ")}. Found columns: ${headers.join(", ") || "(none)"}`,
    };
  }
  return { valid: true };
}

/**
 * system_tags.yaml is a flat `key: "value"` mapping — a minimal line parser
 * avoids adding a YAML dependency. Full YAML parsing still happens in Python.
 */
function validateFlatYaml(buffer: Buffer, requiredKeys: string[]): ValidationResult {
  const text = buffer.toString("utf-8");
  const keys = new Set<string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx <= 0) {
      return { valid: false, error: `Invalid YAML line (expected 'key: value'): "${line.slice(0, 80)}"` };
    }
    keys.add(line.slice(0, idx).trim());
  }
  const missing = requiredKeys.filter((k) => !keys.has(k));
  if (missing.length > 0) {
    return {
      valid: false,
      error: `Missing required key(s): ${missing.join(", ")}. Found keys: ${[...keys].join(", ") || "(none)"}`,
    };
  }
  return { valid: true };
}

function validateXlsx(buffer: Buffer, requiredSheet: string): ValidationResult {
  try {
    const wb = XLSX.read(buffer, { type: "buffer", sheetRows: 2 });
    if (!wb.SheetNames.includes(requiredSheet)) {
      return {
        valid: false,
        error: `Missing required sheet '${requiredSheet}'. Found sheets: ${wb.SheetNames.join(", ")}`,
      };
    }
    return { valid: true };
  } catch (e) {
    return { valid: false, error: `File could not be parsed as Excel: ${e instanceof Error ? e.message : e}` };
  }
}

export function validateUploadContent(filename: string, buffer: Buffer): ValidationResult {
  const rule = FILE_RULES[filename];
  if (!rule) return { valid: false, error: `Unknown file: ${filename}` };
  if (rule.kind === "csv") return validateCsv(buffer, rule.requiredColumns || []);
  if (rule.kind === "yaml") return validateFlatYaml(buffer, rule.requiredKeys || []);
  return validateXlsx(buffer, rule.requiredSheet || "");
}

// ---------------------------------------------------------------------------
// Job locking
// ---------------------------------------------------------------------------

/**
 * Returns the currently running job, expiring any that exceeded the timeout.
 * Call this before any state-changing operation (upload / generate / publish).
 */
export async function getRunningJob() {
  const cutoff = new Date(Date.now() - JOB_TIMEOUT_MINUTES * 60 * 1000);

  // Expire dead jobs first so a crash never locks the system permanently
  await prisma.sync_jobs.updateMany({
    where: { status: "running", started_at: { lt: cutoff } },
    data: {
      status: "failed",
      finished_at: new Date(),
      error_message: `Timed out — no completion after ${JOB_TIMEOUT_MINUTES} minutes`,
    },
  });

  return prisma.sync_jobs.findFirst({
    where: { status: "running" },
    orderBy: { started_at: "desc" },
  });
}

// ---------------------------------------------------------------------------
// Internal (machine-to-machine) auth for cron / run_sync.sh
// ---------------------------------------------------------------------------

/**
 * cron_generate.sh and run_sync.sh have no NextAuth session, so they
 * authenticate with a shared secret instead (SYNC_INTERNAL_TOKEN, read from
 * the same .env as DATABASE_URL). This replaces raw psycopg2 connections
 * from Python — libpq couldn't parse Prisma's DATABASE_URL (?schema=public
 * plus an unescaped '@' in the password), so job creation/updates now go
 * through this app's own Prisma connection instead.
 */
export function verifyInternalToken(req: NextRequest): NextResponse | null {
  const expected = process.env.SYNC_INTERNAL_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "SYNC_INTERNAL_TOKEN not configured on server" },
      { status: 500 },
    );
  }
  const provided = req.headers.get("x-internal-token");
  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Publish: copy staging -> live (atomic swap with backup)
// ---------------------------------------------------------------------------

export class PublishError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Shared by the admin "Publish" button and cron's auto-publish step
 * (POST /api/cron/sync-jobs/publish, fired by cron_generate.sh right after
 * a successful weekly generate). Same manifest/staleness checks and
 * copy-then-swap logic either way -- only `triggeredBy` differs, which ends
 * up in the sync_jobs audit row.
 */
export async function publishStagingToLive(triggeredBy: string) {
  const { promises: fs } = await import("fs");

  const running = await getRunningJob();
  if (running) {
    throw new PublishError("A job is already running", 409);
  }

  let entries: string[];
  try {
    entries = (await fs.readdir(STAGING_DIR)).filter(
      (n) => !n.startsWith(".") && n !== "manifest.json",
    );
  } catch {
    entries = [];
  }
  if (entries.length === 0) {
    throw new PublishError("Staging directory is empty", 400);
  }

  const manifest = await readStagingManifest();
  if (!manifest) {
    throw new PublishError(
      "Staging has no manifest.json — regenerate before publishing (unverifiable staging sets can't go live)",
      409,
    );
  }

  if (manifest.job_id !== null) {
    const lastGenerate = await prisma.sync_jobs.findFirst({
      where: { job_type: "generate" },
      orderBy: { started_at: "desc" },
    });
    if (!lastGenerate || lastGenerate.status !== "success") {
      throw new PublishError(
        "Last generation did not succeed — run Generate & Validate first",
        400,
      );
    }
    if (manifest.job_id !== lastGenerate.id) {
      throw new PublishError(
        "Staging files don't match the last successful generation — re-run Generate first",
        409,
      );
    }
  }

  const job = await prisma.sync_jobs.create({
    data: {
      job_type: "publish",
      status: "running",
      triggered_by: triggeredBy,
      report_date: manifest.report_date ?? null,
    },
  });

  try {
    // Copy-then-swap: staging is KEPT so the admin view (which reads
    // staging) stays intact and both dirs end up identical after publish.
    const tempDir = LIVE_DIR + "_publishing";
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.cp(STAGING_DIR, tempDir, { recursive: true });

    await fs.rm(BACKUP_DIR, { recursive: true, force: true });
    try {
      await fs.rename(LIVE_DIR, BACKUP_DIR);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; // first publish: no live dir yet
    }
    await fs.rename(tempDir, LIVE_DIR);

    const result = {
      publishedFiles: entries.length,
      fromGenerateJob: manifest.job_id,
      reportDate: manifest.report_date ?? null,
    };

    await prisma.sync_jobs.update({
      where: { id: job.id },
      data: { status: "success", finished_at: new Date(), result_json: result },
    });

    return result;
  } catch (swapErr) {
    await prisma.sync_jobs.update({
      where: { id: job.id },
      data: {
        status: "failed",
        finished_at: new Date(),
        error_message: `Publish failed: ${swapErr instanceof Error ? swapErr.message : swapErr}`,
      },
    });
    throw swapErr;
  }
}
