/**
 * Loads config/cash_transactions.csv and config/miscellaneous.csv, file-based
 * (no DB access). Mirrors config.ts's CSV-loading + in-memory-cache pattern.
 * Ports of `calc_cash_investment_summary`/`calc_eq_purchase_sold` — see
 * docs/investment-summary-migration/ARCHITECTURE.md ("cash-inputs.ts").
 *
 * Keyed off `clientName` (a hand-maintained display name, e.g. "Ashwin
 * Agarwal"), not icode/qcode — these CSVs are human-maintained, unlike the
 * Postgres tables. Callers must map icode -> clientName themselves (e.g. via
 * config.ts's getClientConfig()/getAllClientConfigs(), which expose
 * `clientName`).
 */
import path from "path";
import ExcelJS from "exceljs";
import { INVESTMENT_SUMMARY_CONFIG_DIR } from "./config";

const CASH_TRANSACTIONS_FILENAME = "cash_transactions.csv";
const MISCELLANEOUS_FILENAME = "miscellaneous.csv";

const CASH_TRANSACTIONS_COLUMNS = {
  clientName: "Client Name",
  date: "Date",
  amount: "Amount",
  type: "Type",
  strategy: "Strategy",
} as const;

const MISCELLANEOUS_COLUMNS = {
  clientName: "Client Name",
  date: "Date",
  amount: "Amount",
  type: "Type",
  strategy: "Strategy",
  description: "Description",
} as const;

const INTERNAL_TRANSFER_PREFIX = "Internal Transfer";
const EQUITY_PURCHASE_AND_SOLD_TYPE = "Equity Purchase and Sold";

export interface CashTransactionRow {
  clientName: string;
  date: string; // ISO date (YYYY-MM-DD)
  amount: number;
  type: string;
  strategy: string;
}

export interface MiscellaneousRow {
  clientName: string;
  date: string; // ISO date (YYYY-MM-DD)
  amount: number;
  type: string;
  strategy: string;
  description: string;
}

export interface CashInvestmentSummary {
  totalCashAdded: number;
  profitsAndCapitalWithdrawn: number;
  netCashBalance: number;
}

function ddmmyyyyToIso(value: string): string {
  const [d, m, y] = value.trim().split("-");
  return `${y}-${m}-${d}`;
}

function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function readCsvRows(filePath: string): Promise<Record<string, string>[]> {
  const workbook = new ExcelJS.Workbook();
  // dateFormats: [] disables exceljs's auto date-detection — without it,
  // DD-MM-YYYY cells like "08-04-2026" get silently parsed into JS Date
  // objects for some rows but not others, corrupting ddmmyyyyToIso() below.
  // Every column here should stay a raw string; date/number parsing is explicit.
  const worksheet = await workbook.csv.readFile(filePath, { dateFormats: [] });

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

/** Loads config/cash_transactions.csv fresh on every call (no caching — admin uploads should take effect immediately). */
export async function loadCashTransactions(): Promise<CashTransactionRow[]> {
  const filePath = path.join(INVESTMENT_SUMMARY_CONFIG_DIR, CASH_TRANSACTIONS_FILENAME);
  const records = await readCsvRows(filePath);

  return records
    .filter((row) => row[CASH_TRANSACTIONS_COLUMNS.clientName])
    .map((row) => ({
      clientName: row[CASH_TRANSACTIONS_COLUMNS.clientName],
      date: ddmmyyyyToIso(row[CASH_TRANSACTIONS_COLUMNS.date]),
      amount: toNumber(row[CASH_TRANSACTIONS_COLUMNS.amount]),
      type: row[CASH_TRANSACTIONS_COLUMNS.type],
      strategy: row[CASH_TRANSACTIONS_COLUMNS.strategy],
    }));
}

/** Loads config/miscellaneous.csv fresh on every call (no caching — admin uploads should take effect immediately). */
export async function loadMiscellaneous(): Promise<MiscellaneousRow[]> {
  const filePath = path.join(INVESTMENT_SUMMARY_CONFIG_DIR, MISCELLANEOUS_FILENAME);
  const records = await readCsvRows(filePath);

  return records
    .filter((row) => row[MISCELLANEOUS_COLUMNS.clientName])
    .map((row) => ({
      clientName: row[MISCELLANEOUS_COLUMNS.clientName],
      date: ddmmyyyyToIso(row[MISCELLANEOUS_COLUMNS.date]),
      amount: toNumber(row[MISCELLANEOUS_COLUMNS.amount]),
      type: row[MISCELLANEOUS_COLUMNS.type],
      strategy: row[MISCELLANEOUS_COLUMNS.strategy],
      description: row[MISCELLANEOUS_COLUMNS.description],
    }));
}

/**
 * Port of Python's calc_cash_investment_summary(cash_df, strategy=None,
 * exclude_internal=False). Filters cash_transactions.csv rows by
 * `clientName` (exact match), then by `strategy` if given, then drops rows
 * whose `type` starts with "Internal Transfer" when `excludeInternal` is
 * true (those rows are inter-strategy rollovers, not real cash movement).
 */
export async function calcCashInvestmentSummary(
  clientName: string,
  strategy?: string,
  excludeInternal?: boolean
): Promise<CashInvestmentSummary> {
  const rows = await loadCashTransactions();

  const filtered = rows.filter((row) => {
    if (row.clientName !== clientName) return false;
    if (strategy && row.strategy !== strategy) return false;
    if (excludeInternal && row.type.startsWith(INTERNAL_TRANSFER_PREFIX)) return false;
    return true;
  });

  let totalCashAdded = 0;
  let profitsAndCapitalWithdrawn = 0;
  for (const row of filtered) {
    if (row.amount > 0) totalCashAdded += row.amount;
    else if (row.amount < 0) profitsAndCapitalWithdrawn += row.amount;
  }

  return {
    totalCashAdded,
    profitsAndCapitalWithdrawn,
    netCashBalance: totalCashAdded + profitsAndCapitalWithdrawn,
  };
}

/**
 * Port of Python's calc_eq_purchase_sold(misc_df, strategy=None). Sums
 * miscellaneous.csv rows for `clientName` (optionally filtered by
 * `strategy`) where `type` exactly equals "Equity Purchase and Sold".
 */
export async function calcEquityPurchaseSold(
  clientName: string,
  strategy?: string
): Promise<number> {
  const rows = await loadMiscellaneous();

  return rows
    .filter((row) => {
      if (row.clientName !== clientName) return false;
      if (strategy && row.strategy !== strategy) return false;
      return row.type === EQUITY_PURCHASE_AND_SOLD_TYPE;
    })
    .reduce((sum, row) => sum + row.amount, 0);
}
