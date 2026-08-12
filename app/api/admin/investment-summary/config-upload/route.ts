import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { requireAdmin } from "@/app/lib/admin-utils";
import { INVESTMENT_SUMMARY_CONFIG_DIR } from "@/app/lib/investment-summary/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * The hand-maintained CSVs the Postgres-native calculator
 * (app/lib/investment-summary/) reads from INVESTMENT_SUMMARY_CONFIG_DIR.
 * This is a fully separate system from the legacy Python pipeline's own
 * config files (clients.csv, system_tags.yaml, Strategy_Config.csv,
 * Managed_Accounts_Config.xlsx, plus its own copies of
 * cash_transactions.csv/miscellaneous.csv) — that legacy admin upload UI
 * and its backing routes were removed entirely 2026-08-12 (doc 04/05),
 * since every client's numbers now read live from this calculator. Even
 * where filenames match (cash_transactions.csv, miscellaneous.csv), these
 * are different files in a different directory — never merge the two.
 */
const CALC_CONFIG_FILE_RULES: Record<string, { requiredColumns: string[] }> = {
  "Master_Config.csv": {
    requiredColumns: [
      "icode",
      "qcode",
      "Client",
      "Strategy",
      "Effective From",
      "Effective To",
      "Status",
      "For Profit Tag",
      "For Exposure Tag",
    ],
  },
  "cash_transactions.csv": {
    requiredColumns: ["Client Name", "Date", "Amount", "Type", "Strategy"],
  },
  "miscellaneous.csv": {
    requiredColumns: ["Client Name", "Date", "Amount", "Type", "Strategy", "Description"],
  },
  "historical_mf_transactions.csv": {
    requiredColumns: ["Client Name", "Fund Name", "Trade Type", "Date", "Strategy", "Amount"],
  },
};

// Excel treats a cell starting with one of these as a formula/DDE trigger
// (CSV injection — e.g. =HYPERLINK(...), @SUM(...), a DDE payload) rather
// than literal text, if the file is later opened in Excel. "-" is exempted
// when what follows is a plain negative number, since these files hold real
// negative amounts (e.g. "-79,02,420.87" for a withdrawal).
const FORMULA_TRIGGER_CHARS = new Set(["=", "+", "@"]);
const NEGATIVE_NUMBER_RE = /^-[\d,]*\.?\d*$/;

function looksLikeFormulaInjection(raw: string): boolean {
  const value = raw.trim();
  if (!value) return false;
  const first = value[0];
  if (FORMULA_TRIGGER_CHARS.has(first)) return true;
  if (first === "-") return !NEGATIVE_NUMBER_RE.test(value);
  return false;
}

function validateCsv(buffer: Buffer, requiredColumns: string[]): { valid: boolean; error?: string } {
  let rows: string[][];
  try {
    const wb = XLSX.read(buffer, { type: "buffer", raw: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" });
  } catch (e) {
    return { valid: false, error: `File could not be parsed as CSV: ${e instanceof Error ? e.message : e}` };
  }

  const headers = ((rows[0] as unknown[]) || []).map((h) => String(h ?? "").trim());
  const missing = requiredColumns.filter((c) => !headers.includes(c));
  if (missing.length > 0) {
    return {
      valid: false,
      error: `Missing required column(s): ${missing.map((m) => `'${m}'`).join(", ")}. Found columns: ${headers.join(", ") || "(none)"}`,
    };
  }

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] ?? "");
      if (looksLikeFormulaInjection(cell)) {
        return {
          valid: false,
          error: `Row ${r + 1}, column '${headers[c] || c + 1}' ("${cell.slice(0, 40)}") starts with a character Excel would treat as a formula (=, +, @, or a non-numeric -). Remove it and re-upload.`,
        };
      }
    }
  }

  return { valid: true };
}

export async function POST(req: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Filename is checked against the whitelist, never used to build a path directly.
    const filename = file.name;
    const rule = CALC_CONFIG_FILE_RULES[filename];
    if (!rule) {
      return NextResponse.json(
        {
          error: `File '${filename}' is not an accepted investment-summary config file`,
          accepted: Object.keys(CALC_CONFIG_FILE_RULES),
        },
        { status: 400 },
      );
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File exceeds ${MAX_UPLOAD_BYTES / 1024 / 1024}MB limit` },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const validation = validateCsv(buffer, rule.requiredColumns);
    if (!validation.valid) {
      return NextResponse.json(
        { error: `Validation failed for ${filename}`, details: validation.error },
        { status: 400 },
      );
    }

    await fs.mkdir(INVESTMENT_SUMMARY_CONFIG_DIR, { recursive: true });
    await fs.writeFile(path.join(INVESTMENT_SUMMARY_CONFIG_DIR, filename), buffer);

    return NextResponse.json({ filename, uploadedAt: new Date().toISOString() });
  } catch (err) {
    console.error("investment-summary/config-upload error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** GET — returns presence + last-modified for each whitelisted file, for the admin page's file list. */
export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const files = await Promise.all(
      Object.keys(CALC_CONFIG_FILE_RULES).map(async (filename) => {
        const full = path.join(INVESTMENT_SUMMARY_CONFIG_DIR, filename);
        try {
          const st = await fs.stat(full);
          return { filename, exists: true, modifiedAt: st.mtime };
        } catch {
          return { filename, exists: false, modifiedAt: null };
        }
      }),
    );

    return NextResponse.json(
      { files },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("investment-summary/config-upload GET error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
