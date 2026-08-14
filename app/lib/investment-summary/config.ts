/**
 * Loads Master_Config.csv (from Postgres — see readCurrentConfigFile below)
 * and config/system_tags.yaml (still a plain repo file, out of scope for
 * the DB migration). See docs/investment-summary-migration/ARCHITECTURE.md
 * ("config.ts") and docs/investment-summary-config-db-migration-plan.md.
 *
 * CSV parsing reuses `exceljs` (already a project dependency) rather than
 * adding csv-parse; system_tags.yaml is a flat `key: "value"` file
 * (confirmed in doc 02), so it's parsed with the same minimal line-parser
 * approach already used by `validateFlatYaml` in sync-utils.ts, rather than
 * adding js-yaml.
 */
import path from "path";
import ExcelJS from "exceljs";
import { Readable } from "stream";
import { promises as fs } from "fs";
import { prisma } from "@/lib/prisma";
import type { BaseSystemTags, ClientStrategyConfigRow } from "./types";

export const INVESTMENT_SUMMARY_CONFIG_DIR =
  process.env.INVESTMENT_SUMMARY_CONFIG_DIR ||
  path.join(process.cwd(), "config");

const MASTER_CONFIG_FILENAME = "Master_Config.csv";
const SYSTEM_TAGS_FILENAME = "system_tags.yaml";

/**
 * Fetches the current (latest-uploaded) content of an admin-uploaded config
 * file from Postgres. "Current" = the row with the latest uploadedAt for
 * that filename — every upload is an INSERT, never an UPDATE, so this also
 * gives free version history (see investment_summary_config_files in
 * schema.prisma). Throws if the file has never been uploaded, matching the
 * old fs.readFile behavior of failing loudly rather than silently
 * defaulting to empty.
 */
export async function readCurrentConfigFile(filename: string): Promise<string> {
  const row = await prisma.investment_summary_config_files.findFirst({
    where: { filename },
    orderBy: { uploadedAt: "desc" },
  });
  if (!row) {
    throw new Error(`${filename} has never been uploaded`);
  }
  return row.content;
}

const MASTER_CONFIG_COLUMNS = {
  icode: "icode",
  qcode: "qcode",
  clientName: "Client",
  strategy: "Strategy",
  effectiveFrom: "Effective From",
  effectiveTo: "Effective To",
  status: "Status",
  forProfitTag: "For Profit Tag",
  forExposureTag: "For Exposure Tag",
} as const;

function ddmmyyyyToIso(value: string): string {
  const [d, m, y] = value.trim().split("-");
  return `${y}-${m}-${d}`;
}

async function readCsvRows(content: string): Promise<Record<string, string>[]> {
  const workbook = new ExcelJS.Workbook();
  // dateFormats: [] disables exceljs's auto date-detection — without it,
  // DD-MM-YYYY cells like "08-04-2026" get silently parsed into JS Date
  // objects for some rows but not others, corrupting ddmmyyyyToIso() below.
  // Every column here should stay a raw string; date parsing is explicit.
  const worksheet = await workbook.csv.read(Readable.from(content), { dateFormats: [] });

  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? "").trim();
  });

  const rows: Record<string, string>[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const record: Record<string, string> = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const header = headers[colNumber];
      if (header) record[header] = String(cell.value ?? "").trim();
    });
    rows.push(record);
  });

  return rows;
}

async function loadMasterConfig(): Promise<ClientStrategyConfigRow[]> {
  const content = await readCurrentConfigFile(MASTER_CONFIG_FILENAME);
  const records = await readCsvRows(content);

  return records
    .filter((row) => row[MASTER_CONFIG_COLUMNS.clientName])
    .map((row) => ({
      icode: row[MASTER_CONFIG_COLUMNS.icode],
      qcode: row[MASTER_CONFIG_COLUMNS.qcode],
      clientName: row[MASTER_CONFIG_COLUMNS.clientName],
      strategy: row[MASTER_CONFIG_COLUMNS.strategy],
      effectiveFrom: ddmmyyyyToIso(row[MASTER_CONFIG_COLUMNS.effectiveFrom]),
      effectiveTo: row[MASTER_CONFIG_COLUMNS.effectiveTo]
        ? ddmmyyyyToIso(row[MASTER_CONFIG_COLUMNS.effectiveTo])
        : null,
      status: row[MASTER_CONFIG_COLUMNS.status] === "Active" ? "Active" : "Inactive",
      forProfitTag: row[MASTER_CONFIG_COLUMNS.forProfitTag],
      forExposureTag: row[MASTER_CONFIG_COLUMNS.forExposureTag] || null,
    }));
}

/** All strategy rows (active + inactive) for a given client icode. */
export async function getClientConfig(icode: string): Promise<ClientStrategyConfigRow[]> {
  const rows = await loadMasterConfig();
  return rows.filter((r) => r.icode === icode);
}

export async function getAllClientConfigs(): Promise<ClientStrategyConfigRow[]> {
  return loadMasterConfig();
}

/**
 * Minimal flat `key: "value"` parser, matching sync-utils.ts's
 * validateFlatYaml — system_tags.yaml has no nesting/lists/anchors (doc 02),
 * so a full YAML library isn't needed.
 */
function parseFlatYaml(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

export async function getBaseTags(): Promise<BaseSystemTags> {
  const filePath = path.join(INVESTMENT_SUMMARY_CONFIG_DIR, SYSTEM_TAGS_FILENAME);
  const raw = await fs.readFile(filePath, "utf-8");
  const parsed = parseFlatYaml(raw);

  return {
    zerodhaTotalPortfolio: parsed.zerodha_total_portfolio,
    equityStockHoldings: parsed.equity_stock_holdings,
    mutualFunds: parsed.mutual_funds,
    liquidcaseStockHoldings: parsed.liquidcase_stock_holdings,
    bondStockHoldings: parsed.bond_stock_holdings,
    liquidbees: parsed.liquidbees,
    equityOtherDebitsCredits: parsed.equity_other_debits_credits,
    equityHoldingsTax: parsed.equity_holdings_tax,
    miscellaneousPnl: parsed.miscellaneous_pnl,
    totalPortfolioValue: parsed.total_portfolio_value,
  };
}
