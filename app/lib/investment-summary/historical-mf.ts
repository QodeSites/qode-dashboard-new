/**
 * Loads historical_mf_transactions.csv from Postgres (see config.ts's
 * readCurrentConfigFile) — manually-maintained, pre-Server-Drive MF
 * transaction history for old/legacy accounts (e.g. Sarla Performance
 * Fibers) whose earliest MF trades predate the Server Drive Tradebook and
 * were recorded independently. Ported from the real, currently-deployed
 * pipeline's `data_loader.load_historical_mf_transactions` / `main.py`'s
 * merge step (confirmed against /opt/investment-summary on 2026-08-12 —
 * the Desktop dev checkout of this pipeline was stale and didn't have this
 * feature yet; the live WSL source did).
 *
 * Python concatenates these rows onto the freshly-fetched MF Tradebook
 * BEFORE any calculation runs, so they flow through calc_mf_transactions
 * and calc_holdings_investment_summary via the exact same code path as
 * ordinary tradebook rows — no separate display/calc logic. tradebook.ts
 * mirrors that by merging at the same two call sites
 * (calcMfTransactions, calcHoldingsInvestmentSummary), not by adding a
 * third parallel code path.
 *
 * No caching — every call re-fetches fresh from Postgres so an admin
 * upload takes effect immediately. Returns an empty array if the file has
 * never been uploaded — a safe no-op for every client without an entry,
 * same as Python's absent-file behavior.
 */
import ExcelJS from "exceljs";
import { Readable } from "stream";
import { readCurrentConfigFile } from "./config";

const HISTORICAL_MF_FILENAME = "historical_mf_transactions.csv";

const COLUMNS = {
  clientName: "Client Name",
  fundName: "Fund Name",
  tradeType: "Trade Type",
  date: "Date",
  strategy: "Strategy",
  amount: "Amount",
} as const;

/** Shaped to merge directly into mutual_funds_tradebook rows in tradebook.ts. */
export interface HistoricalMfRow {
  date: Date;
  trade_type: "Buy" | "Sell";
  symbol: string;
  quantity: { toNumber(): number };
  price: { toNumber(): number };
  strategy: string | null;
  sub_category: string | null;
}

/** "Buy"/"Sell" or "Capital Inflow"/"Capital Outflow" — normalised like the Python loader. */
function normaliseTradeType(raw: string): "Buy" | "Sell" {
  const v = raw.trim().toLowerCase();
  if (v === "sell" || v === "capital outflow" || v === "transfer out") return "Sell";
  return "Buy";
}

/** Wraps a plain number so it matches Prisma's Decimal-like `{toNumber()}` shape tradebook.ts expects. */
function decimalLike(value: number): { toNumber(): number } {
  return { toNumber: () => value };
}

async function readCsvRows(content: string): Promise<Record<string, string>[]> {
  const workbook = new ExcelJS.Workbook();
  // dateFormats: [] — same reasoning as config.ts/cash-inputs.ts: without
  // it, exceljs's auto date-detection silently corrupts some rows but not
  // others. This file's dates are YYYY-MM-DD (unlike the DD-MM-YYYY used
  // elsewhere in config/) — parsed explicitly below via `new Date(...)`.
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

/** Loads historical_mf_transactions.csv fresh on every call, filtered to one client. */
export async function loadHistoricalMfTransactions(clientName: string): Promise<HistoricalMfRow[]> {
  let records: Record<string, string>[];
  try {
    const content = await readCurrentConfigFile(HISTORICAL_MF_FILENAME);
    records = await readCsvRows(content);
  } catch {
    return []; // never uploaded — safe no-op, matches Python's absent-file behavior
  }

  return records
    .filter((row) => row[COLUMNS.clientName]?.trim() === clientName)
    .map((row) => ({
      date: new Date(row[COLUMNS.date]?.trim()),
      trade_type: normaliseTradeType(row[COLUMNS.tradeType] ?? ""),
      symbol: (row[COLUMNS.fundName] ?? "").trim(),
      quantity: decimalLike(1),
      price: decimalLike(Math.abs(Number(row[COLUMNS.amount]) || 0)),
      strategy: row[COLUMNS.strategy]?.trim() || null,
      sub_category: null, // never Liquidcase — genuine historical fund positions (Python comment)
    }))
    .filter((r) => !Number.isNaN(r.date.getTime()));
}
