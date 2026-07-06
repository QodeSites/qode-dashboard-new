/**
 * Reads an Investment Summary .xlsx workbook and returns structured data.
 * Uses the `xlsx` package (SheetJS) which is already a project dependency.
 *
 * Sheet structure (row 1 = title, row 2 = headers, row 3+ = data):
 *   Investment Summary         – 2-col: label | amount
 *   Overview Cash Summary      – 2-col with Adjustments section
 *   Cash Investment Summary    – 2-col: label | amount
 *   Holdings Investment Summary– 2-col: label | amount
 *   Current Account Summary    – 3-col: label | amount | %
 *   Profit Redeployment        – 3-col: strategy | profits | note
 *   Current / Historical MF/Equity Holdings – 3-col: name | type | amount
 *   MF / Equity / Cash Transactions        – 3-4 col tables
 *   Validation Summary         – excluded (internal only)
 */

import * as XLSX from "xlsx";

export interface InvestmentSummaryData {
  clientName: string;
  generatedDate: string;
  dataAsOfDate: string;

  // Investment Summary sheet
  amountInvested: { holdings: number; cash: number; total: number };

  // Overview Cash Summary sheet (may be absent)
  overviewCashSummary: {
    rows: Array<{ label: string; amount: number }>;
    adjustments: Array<{ label: string; amount: number }>;
  } | null;

  // Current Account Summary sheet
  currentAccountSummary: Array<{
    particulars: string;
    amount: number;
    percent: number;
  }>;

  // Holdings Bifurcation sheet
  holdingsBifurcation: Array<{
    type: string;
    amount: number;
    percent: number;
  }>;

  // Cash / Holdings Investment Summary sheets
  cashInvestmentSummary: {
    totalCashAdded: number;
    profitsAndCapitalWithdrawn: number;
    netCashBalance: number;
  };
  holdingsInvestmentSummary: {
    totalHoldingsAdded: number;
    totalHoldingsWithdrawn: number;
    netHoldingBalance: number;
  };

  // Profit Redeployment sheet
  profitRedeployment: Array<{
    strategy: string;
    profits: number;
    note: string;
    isHeader?: boolean;
  }>;

  // Holdings sheets
  currentEquityHoldings: Array<{
    name: string;
    type: string;
    broker: string;
    exchange: string;
    strategy: string;
    amount: number;
  }>;
  currentMfHoldings: Array<{
    name: string;
    type: string;
    broker: string;
    strategy: string;
    amount: number;
  }>;
  historicalEquityHoldings: Array<{
    name: string;
    type: string;
    strategy: string;
    amount: number;
  }>;
  historicalMfHoldings: Array<{
    name: string;
    type: string;
    strategy: string;
    amount: number;
  }>;

  // Transaction sheets
  equityTransactions: Array<{
    name: string;
    capitalFlow: string;
    date: string;
    strategy: string;
    amount: number;
  }>;
  cashTransactions: Array<{
    date: string;
    transactionType: string;
    strategy: string;
    amount: number;
  }>;
  mfTransactions: Array<{
    name: string;
    capitalFlow: string;
    date: string;
    strategy: string;
    amount: number;
  }>;
}

export interface StrategyInvestmentData {
  amountInvested: InvestmentSummaryData["amountInvested"];
  overviewCashSummary: InvestmentSummaryData["overviewCashSummary"];
  cashInvestmentSummary: InvestmentSummaryData["cashInvestmentSummary"];
  holdingsInvestmentSummary: InvestmentSummaryData["holdingsInvestmentSummary"];
  currentAccountSummary: InvestmentSummaryData["currentAccountSummary"];
  holdingsBifurcation: InvestmentSummaryData["holdingsBifurcation"];
}

export interface MultiStrategyInvestmentData extends InvestmentSummaryData {
  strategies: string[];
  perStrategy: Record<string, StrategyInvestmentData>;
}

// ---------------------------------------------------------------------------
// Number helpers
// ---------------------------------------------------------------------------

function parseAmount(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  const s = String(raw).trim().replace(/,/g, "");
  if (s.startsWith("(") && s.endsWith(")"))
    return -(parseFloat(s.slice(1, -1)) || 0);
  return parseFloat(s) || 0;
}

function parsePercent(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  return parseFloat(String(raw).replace("%", "").trim()) || 0;
}

// ---------------------------------------------------------------------------
// Sheet helpers
// ---------------------------------------------------------------------------

function sheetRows(wb: XLSX.WorkBook, name: string): string[][] {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" });
}

/** Read rows 3+ (skip title row 1 and header row 2) */
function dataRows(rows: string[][]): string[][] {
  return rows.slice(2).filter((r) => r.some((c) => String(c).trim() !== ""));
}

// ---------------------------------------------------------------------------
// Individual sheet parsers
// ---------------------------------------------------------------------------

function parseInvestmentSummarySheet(
  wb: XLSX.WorkBook,
  sheetName = "Investment Summary",
): InvestmentSummaryData["amountInvested"] {
  const result = { holdings: 0, cash: 0, total: 0 };
  for (const row of dataRows(sheetRows(wb, sheetName))) {
    const key = String(row[0] || "").toLowerCase();
    const val = parseAmount(row[1]);
    if (key === "holdings") result.holdings = val;
    else if (key === "cash") result.cash = val;
    else if (key === "total") result.total = val;
  }
  return result;
}

function parseOverviewCashSummary(
  wb: XLSX.WorkBook,
  sheetName = "Overview Cash Summary",
): InvestmentSummaryData["overviewCashSummary"] {
  const rows = sheetRows(wb, sheetName);
  if (!rows.length) return null;

  const top: Array<{ label: string; amount: number }> = [];
  const adj: Array<{ label: string; amount: number }> = [];
  let inAdj = false;

  for (const row of dataRows(rows)) {
    const label = String(row[0] || "").trim();
    if (!label) continue;
    if (label.toLowerCase() === "adjustments") {
      inAdj = true;
      continue;
    }
    const entry = { label, amount: parseAmount(row[1]) };
    if (inAdj) adj.push(entry);
    else top.push(entry);
  }

  return { rows: top, adjustments: adj };
}

function parseCashInvestmentSummary(
  wb: XLSX.WorkBook,
  sheetName = "Cash Investment Summary",
): InvestmentSummaryData["cashInvestmentSummary"] {
  const result = {
    totalCashAdded: 0,
    profitsAndCapitalWithdrawn: 0,
    netCashBalance: 0,
  };
  for (const row of dataRows(sheetRows(wb, sheetName))) {
    const key = String(row[0] || "").toLowerCase();
    const val = parseAmount(row[1]);
    if (key.includes("total cash added")) result.totalCashAdded = val;
    else if (key.includes("profits and capital withdrawn"))
      result.profitsAndCapitalWithdrawn = val;
    else if (key.includes("net cash balance")) result.netCashBalance = val;
  }
  return result;
}

function parseHoldingsInvestmentSummary(
  wb: XLSX.WorkBook,
  sheetName = "Holdings Investment Summary",
): InvestmentSummaryData["holdingsInvestmentSummary"] {
  const result = {
    totalHoldingsAdded: 0,
    totalHoldingsWithdrawn: 0,
    netHoldingBalance: 0,
  };
  for (const row of dataRows(sheetRows(wb, sheetName))) {
    const key = String(row[0] || "").toLowerCase();
    const val = parseAmount(row[1]);
    if (key.includes("total holdings added")) result.totalHoldingsAdded = val;
    else if (key.includes("total holdings withdrawn"))
      result.totalHoldingsWithdrawn = val;
    else if (key.includes("net holding balance"))
      result.netHoldingBalance = val;
  }
  return result;
}

function parseAccountSummary(
  wb: XLSX.WorkBook,
  sheetName = "Current Account Summary",
): InvestmentSummaryData["currentAccountSummary"] {
  return dataRows(sheetRows(wb, sheetName))
    .filter((row) => String(row[0] || "").trim())
    .map((row) => ({
      particulars: String(row[0]).trim(),
      amount: parseAmount(row[1]),
      percent: parsePercent(row[2]),
    }));
}

function parseHoldingsBifurcation(
  wb: XLSX.WorkBook,
  sheetName = "Current Account Summary",
): InvestmentSummaryData["holdingsBifurcation"] {
  return dataRows(sheetRows(wb, sheetName))
    .filter((row) => {
      const label = String(row[0] || "").trim().toLowerCase();
      return label && label !== "total";
    })
    .map((row) => ({
      type: String(row[0]).trim(),
      amount: parseAmount(row[1]),
      percent: parsePercent(row[2]),
    }));
}

function parseProfitRedeployment(
  wb: XLSX.WorkBook,
): InvestmentSummaryData["profitRedeployment"] {
  return dataRows(sheetRows(wb, "Profit Redeployment"))
    .filter((row) => {
      const s = String(row[0] || "")
        .trim()
        .toLowerCase();
      return s && s !== "total profits";
    })
    .map((row) => {
      const label = String(row[0]).trim();
      const lower = label.toLowerCase();
      if (lower === "active strategies" || lower === "inactive strategies") {
        return { strategy: label, profits: 0, note: "", isHeader: true };
      }
      return {
        strategy: label,
        profits: parseAmount(row[1]),
        note: String(row[2] || "").trim(),
      };
    });
}

function parseEquityHoldingsSheet(
  wb: XLSX.WorkBook,
): Array<{ name: string; type: string; broker: string; exchange: string; strategy: string; amount: number }> {
  return dataRows(sheetRows(wb, "Current Equity Holdings"))
    .filter((row) => {
      const n = String(row[0] || "").trim().toLowerCase();
      return n && n !== "net" && !n.startsWith("no ") && n !== "stock name";
    })
    .map((row) => ({
      name: String(row[0]).trim(),
      type: String(row[1] || "").trim(),
      broker: String(row[2] || "").trim(),
      exchange: String(row[3] || "").trim(),
      strategy: String(row[4] || "").trim(),
      amount: parseAmount(row[5]),
    }));
}

function parseMfHoldingsSheet(
  wb: XLSX.WorkBook,
): Array<{ name: string; type: string; broker: string; strategy: string; amount: number }> {
  return dataRows(sheetRows(wb, "Current MF Holdings"))
    .filter((row) => {
      const n = String(row[0] || "").trim().toLowerCase();
      return n && n !== "net" && !n.startsWith("no ") && n !== "fund name";
    })
    .map((row) => ({
      name: String(row[0]).trim(),
      type: String(row[1] || "").trim(),
      broker: String(row[2] || "").trim(),
      strategy: String(row[3] || "").trim(),
      amount: parseAmount(row[4]),
    }));
}

function parseHoldingsSheet(
  wb: XLSX.WorkBook,
  sheetName: string,
): Array<{ name: string; type: string; strategy: string; amount: number }> {
  return dataRows(sheetRows(wb, sheetName))
    .filter((row) => {
      const n = String(row[0] || "")
        .trim()
        .toLowerCase();
      return (
        n &&
        n !== "net" &&
        !n.startsWith("no ") &&
        n !== "stock name" &&
        n !== "fund name"
      );
    })
    .map((row) => ({
      name: String(row[0]).trim(),
      type: String(row[1] || "").trim(),
      strategy: String(row[2] || "").trim(),
      amount: parseAmount(row[3]),
    }));
}

function parseEquityTransactions(
  wb: XLSX.WorkBook,
): InvestmentSummaryData["equityTransactions"] {
  return dataRows(sheetRows(wb, "Equity Transactions"))
    .filter((row) => {
      const p = String(row[0] || "")
        .trim()
        .toLowerCase();
      return p && p !== "name" && p !== "net";
    })
    .map((row) => ({
      name: String(row[0]).trim(),
      capitalFlow: String(row[1] || "").trim(),
      date: String(row[2] || "").trim(),
      strategy: String(row[3] || "").trim(),
      amount: parseAmount(row[4]),
    }));
}

function parseCashTransactions(
  wb: XLSX.WorkBook,
): InvestmentSummaryData["cashTransactions"] {
  return dataRows(sheetRows(wb, "Cash Transactions"))
    .filter((row) => {
      const d = String(row[0] || "")
        .trim()
        .toLowerCase();
      return d && d !== "date" && d !== "net";
    })
    .map((row) => ({
      date: String(row[0]).trim(),
      transactionType: String(row[1] || "").trim(),
      strategy: String(row[2] || "").trim(),
      amount: parseAmount(row[3]),
    }));
}

function parseMfTransactions(
  wb: XLSX.WorkBook,
): InvestmentSummaryData["mfTransactions"] {
  return dataRows(sheetRows(wb, "MF Transactions"))
    .filter((row) => {
      const p = String(row[0] || "")
        .trim()
        .toLowerCase();
      return p && p !== "name" && p !== "net";
    })
    .map((row) => ({
      name: String(row[0]).trim(),
      capitalFlow: String(row[1] || "").trim(),
      date: String(row[2] || "").trim(),
      strategy: String(row[3] || "").trim(),
      amount: parseAmount(row[4]),
    }));
}

function parseValidationMeta(wb: XLSX.WorkBook): {
  clientName: string;
  dataAsOfDate: string;
} {
  const rows = sheetRows(wb, "Validation Summary");
  let clientName = "";
  let dataAsOfDate = "";

  // Row 1 col 1: "Validation Summary — <Client Name>"
  if (rows[0]?.[0]) {
    const title = String(rows[0][0]);
    const sep = title.includes("—") ? "—" : title.includes("—") ? "—" : null;
    if (sep) clientName = title.split(sep, 2)[1]?.trim() ?? "";
  }

  // Find "Data as of: YYYY-MM-DD" row
  for (const row of rows) {
    const cell = String(row[0] || "");
    if (cell.startsWith("Data as of:")) {
      dataAsOfDate = cell.replace("Data as of:", "").trim();
      break;
    }
  }

  return { clientName, dataAsOfDate };
}

// ---------------------------------------------------------------------------
// Multi-strategy helpers
// ---------------------------------------------------------------------------

const STRATEGY_SHEET_PREFIXES = [
  "Inv Summary ",
  "Overview Cash ",
  "Cash Inv ",
  "Holdings Inv ",
  "Acct Summary ",
];

function detectStrategies(wb: XLSX.WorkBook): string[] {
  const counts = new Map<string, number>();
  for (const name of wb.SheetNames) {
    for (const prefix of STRATEGY_SHEET_PREFIXES) {
      if (name.startsWith(prefix)) {
        const s = name.slice(prefix.length);
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([s]) => s)
    .sort();
}

function parsePerStrategyData(
  wb: XLSX.WorkBook,
  strategies: string[],
): Record<string, StrategyInvestmentData> {
  const result: Record<string, StrategyInvestmentData> = {};
  for (const s of strategies) {
    result[s] = {
      amountInvested: parseInvestmentSummarySheet(wb, `Inv Summary ${s}`),
      overviewCashSummary: parseOverviewCashSummary(wb, `Overview Cash ${s}`),
      cashInvestmentSummary: parseCashInvestmentSummary(wb, `Cash Inv ${s}`),
      holdingsInvestmentSummary: parseHoldingsInvestmentSummary(wb, `Holdings Inv ${s}`),
      currentAccountSummary: parseAccountSummary(wb, `Acct Summary ${s}`),
      holdingsBifurcation: parseHoldingsBifurcation(wb, `Acct Summary ${s}`),
    };
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function parseInvestmentXlsx(fileBuffer: Buffer): MultiStrategyInvestmentData {
  const wb = XLSX.read(fileBuffer, { type: "buffer", cellStyles: false });

  const { clientName, dataAsOfDate } = parseValidationMeta(wb);
  const strategies = detectStrategies(wb);

  return {
    clientName,
    generatedDate: new Date().toLocaleDateString("en-GB"),
    dataAsOfDate,
    strategies,
    perStrategy: parsePerStrategyData(wb, strategies),
    amountInvested: parseInvestmentSummarySheet(wb),
    overviewCashSummary: parseOverviewCashSummary(wb),
    currentAccountSummary: parseAccountSummary(wb),
    holdingsBifurcation: parseHoldingsBifurcation(wb),
    cashInvestmentSummary: parseCashInvestmentSummary(wb),
    holdingsInvestmentSummary: parseHoldingsInvestmentSummary(wb),
    profitRedeployment: parseProfitRedeployment(wb),
    currentEquityHoldings: parseEquityHoldingsSheet(wb),
    currentMfHoldings: parseMfHoldingsSheet(wb),
    historicalEquityHoldings: parseHoldingsSheet(
      wb,
      "Historical Equity Holdings",
    ),
    historicalMfHoldings: parseHoldingsSheet(wb, "Historical MF Holdings"),
    equityTransactions: parseEquityTransactions(wb),
    cashTransactions: parseCashTransactions(wb),
    mfTransactions: parseMfTransactions(wb),
  };
}
