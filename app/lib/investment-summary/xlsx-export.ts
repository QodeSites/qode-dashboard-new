/**
 * Builds an .xlsx workbook from computeInvestmentSummary()'s output,
 * matching the real Python pipeline's report_builder.py sheet-by-sheet:
 * same sheet names, same column layout, same title/header/total styling
 * (colors/fonts/borders lifted from styles.py). Admin-only download —
 * see app/api/admin/investment-summary/download/route.ts.
 *
 * One deliberate deviation: report_builder.py pre-formats every amount as
 * an Indian-grouped STRING ("1,23,45,678.90") and writes it as text, "for
 * cleaner PDF output" (its own comment). That makes the numbers
 * un-summable in Excel. Here amounts are written as real numeric cells
 * with a standard `#,##0.00` format instead — visually equivalent, but
 * usable as numbers. Everything else (sheet names, row/column order,
 * section structure, colors) matches exactly.
 */
import ExcelJS from "exceljs";
import type {
  MultiStrategyInvestmentData,
  StrategyInvestmentData,
} from "@/app/lib/parse-investment-pdf";

const COLOR_TITLE = "FF004C2F";
const COLOR_HEADER = "FFD9C12E";
const COLOR_TOTAL = "FFEEEBD2";
const COLOR_WHITE = "FFFFFFFF";
const COLOR_BLACK = "FF000000";
const MONEY_FMT = "#,##0.00;(#,##0.00)";

function fill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

const borderAll: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: COLOR_BLACK } },
  left: { style: "thin", color: { argb: COLOR_BLACK } },
  bottom: { style: "thin", color: { argb: COLOR_BLACK } },
  right: { style: "thin", color: { argb: COLOR_BLACK } },
};

function titleRow(ws: ExcelJS.Worksheet, title: string, ncols: number, row = 1): void {
  if (ncols > 1) ws.mergeCells(row, 1, row, ncols);
  for (let c = 1; c <= ncols; c++) {
    const cell = ws.getRow(row).getCell(c);
    cell.border = borderAll;
    cell.fill = fill(COLOR_TITLE);
    if (c === 1) {
      cell.value = title;
      cell.font = { name: "Arial", size: 10, bold: true, color: { argb: COLOR_WHITE } };
      cell.alignment = { horizontal: "left", vertical: "middle" };
    }
  }
}

function headerCell(cell: ExcelJS.Cell, value: string, align: "left" | "right" = "left"): void {
  cell.value = value;
  cell.fill = fill(COLOR_HEADER);
  cell.font = { name: "Arial", size: 10, bold: true, color: { argb: COLOR_BLACK } };
  cell.border = borderAll;
  cell.alignment = { horizontal: align, vertical: "middle" };
}

function totalCell(cell: ExcelJS.Cell, value: string | number, align: "left" | "right" = "right"): void {
  cell.value = value;
  if (typeof value === "number") cell.numFmt = MONEY_FMT;
  cell.fill = fill(COLOR_TOTAL);
  cell.font = { name: "Arial", size: 10, bold: true, color: { argb: COLOR_BLACK } };
  cell.border = borderAll;
  cell.alignment = { horizontal: align, vertical: "middle" };
}

function bodyCell(cell: ExcelJS.Cell, value: string | number, align: "left" | "right" = "left"): void {
  cell.value = value;
  if (typeof value === "number") cell.numFmt = MONEY_FMT;
  cell.fill = fill(COLOR_WHITE);
  cell.font = { name: "Arial", size: 10, color: { argb: COLOR_BLACK } };
  cell.border = borderAll;
  cell.alignment = { horizontal: align, vertical: "middle" };
}

function autoColWidths(ws: ExcelJS.Worksheet, minWidth = 12, maxWidth = 60): void {
  ws.columns.forEach((col) => {
    let maxLen = 0;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? "").length;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(Math.max(maxLen + 2, minWidth), maxWidth);
  });
}

// Excel sheet names: <= 31 chars, no \ / * [ ] : ?
function safeSheetName(name: string): string {
  return name.replace(/[\\/*[\]:?]/g, "").slice(0, 31);
}
function shortStrat(strategy: string): string {
  return strategy.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Sheet writers — mirror report_builder.py's write_* functions
// ---------------------------------------------------------------------------

function writeInvestmentSummary(ws: ExcelJS.Worksheet, d: StrategyInvestmentData, label: string): void {
  titleRow(ws, `Investment Summary${label ? ` : ${label}` : ""}`, 2);
  headerCell(ws.getRow(2).getCell(1), "Amount Invested");
  headerCell(ws.getRow(2).getCell(2), "Amount", "right");
  const rows: [string, number][] = [
    ["Holdings", d.amountInvested.holdings],
    ["Cash", d.amountInvested.cash],
  ];
  rows.forEach(([label2, val], i) => {
    bodyCell(ws.getRow(3 + i).getCell(1), label2);
    bodyCell(ws.getRow(3 + i).getCell(2), val, "right");
  });
  totalCell(ws.getRow(5).getCell(1), "Total", "left");
  totalCell(ws.getRow(5).getCell(2), d.amountInvested.total);
  autoColWidths(ws);
}

function writeOverviewCashSummary(ws: ExcelJS.Worksheet, d: StrategyInvestmentData, label: string): void {
  titleRow(ws, `Overview Cash Summary${label ? ` : ${label}` : ""}`, 2);
  headerCell(ws.getRow(2).getCell(1), "Particulars");
  headerCell(ws.getRow(2).getCell(2), "Amount", "right");
  if (!d.overviewCashSummary) {
    autoColWidths(ws);
    return;
  }
  const totalLabels = new Set(["Total Profits", "Total Cash Generated"]);
  let r = 3;
  for (const row of d.overviewCashSummary.rows) {
    if (totalLabels.has(row.label)) {
      totalCell(ws.getRow(r).getCell(1), row.label, "left");
      totalCell(ws.getRow(r).getCell(2), row.amount);
    } else {
      bodyCell(ws.getRow(r).getCell(1), row.label);
      bodyCell(ws.getRow(r).getCell(2), row.amount, "right");
    }
    r++;
  }
  headerCell(ws.getRow(r).getCell(1), "Adjustments");
  headerCell(ws.getRow(r).getCell(2), "");
  r++;
  for (const row of d.overviewCashSummary.adjustments) {
    bodyCell(ws.getRow(r).getCell(1), row.label);
    bodyCell(ws.getRow(r).getCell(2), row.amount, "right");
    r++;
  }
  autoColWidths(ws);
}

function writeCashInvestmentSummary(ws: ExcelJS.Worksheet, d: StrategyInvestmentData, label: string): void {
  titleRow(ws, `Cash Investment Summary${label ? ` : ${label}` : ""}`, 2);
  headerCell(ws.getRow(2).getCell(1), "Particulars");
  headerCell(ws.getRow(2).getCell(2), "Amount", "right");
  const rows: [string, number][] = [
    ["Total Cash Added", d.cashInvestmentSummary.totalCashAdded],
    ["Profits and Capital Withdrawn", d.cashInvestmentSummary.profitsAndCapitalWithdrawn],
  ];
  rows.forEach(([label2, val], i) => {
    bodyCell(ws.getRow(3 + i).getCell(1), label2);
    bodyCell(ws.getRow(3 + i).getCell(2), val, "right");
  });
  totalCell(ws.getRow(5).getCell(1), "Net Cash Balance", "left");
  totalCell(ws.getRow(5).getCell(2), d.cashInvestmentSummary.netCashBalance);
  autoColWidths(ws);
}

function writeHoldingsInvestmentSummary(ws: ExcelJS.Worksheet, d: StrategyInvestmentData, label: string): void {
  titleRow(ws, `Holdings Investment Summary${label ? ` : ${label}` : ""}`, 2);
  headerCell(ws.getRow(2).getCell(1), "Particulars");
  headerCell(ws.getRow(2).getCell(2), "Amount", "right");
  const rows: [string, number][] = [
    ["Total Holdings Added", d.holdingsInvestmentSummary.totalHoldingsAdded],
    ["Total Holdings Withdrawn", d.holdingsInvestmentSummary.totalHoldingsWithdrawn],
  ];
  rows.forEach(([label2, val], i) => {
    bodyCell(ws.getRow(3 + i).getCell(1), label2);
    bodyCell(ws.getRow(3 + i).getCell(2), val, "right");
  });
  totalCell(ws.getRow(5).getCell(1), "Net Holding Balance", "left");
  totalCell(ws.getRow(5).getCell(2), d.holdingsInvestmentSummary.netHoldingBalance);
  autoColWidths(ws);
}

// This physically-titled "Current Account Summary" sheet is the
// Equity/Debt/Hybrid + Cash & Liquid Case breakdown, not a Holdings/
// Liquid Case/Cash table — matches report_builder.py's write_holdings_
// bifurcation(), which is the only writer real Python ever calls for a
// sheet with this title (doc 05 Q16).
function writeCurrentAccountSummary(ws: ExcelJS.Worksheet, d: StrategyInvestmentData, label: string): void {
  titleRow(ws, `Current Account Summary${label ? ` : ${label}` : ""}`, 3);
  headerCell(ws.getRow(2).getCell(1), "Type");
  headerCell(ws.getRow(2).getCell(2), "Amount", "right");
  headerCell(ws.getRow(2).getCell(3), "%", "right");
  let r = 3;
  let accountValue = 0;
  for (const row of d.holdingsBifurcation) {
    bodyCell(ws.getRow(r).getCell(1), row.type);
    bodyCell(ws.getRow(r).getCell(2), row.amount, "right");
    bodyCell(ws.getRow(r).getCell(3), row.percent / 100, "right");
    ws.getRow(r).getCell(3).numFmt = "0.00%";
    accountValue += row.amount;
    r++;
  }
  totalCell(ws.getRow(r).getCell(1), "Total", "left");
  totalCell(ws.getRow(r).getCell(2), accountValue);
  totalCell(ws.getRow(r).getCell(3), "100.00%", "right");
  autoColWidths(ws);
}

function writeProfitRedeployment(ws: ExcelJS.Worksheet, rows: MultiStrategyInvestmentData["profitRedeployment"]): void {
  titleRow(ws, "Profit Redeployment Summary", 3);
  headerCell(ws.getRow(2).getCell(1), "Active Strategies");
  headerCell(ws.getRow(2).getCell(2), "Profits", "right");
  headerCell(ws.getRow(2).getCell(3), "Profits Redeployed To");
  let r = 3;
  for (const row of rows) {
    if (row.isHeader) {
      const cell = ws.getRow(r).getCell(1);
      cell.value = row.strategy;
      cell.font = { name: "Arial", size: 10, bold: true, color: { argb: COLOR_BLACK } };
      cell.fill = fill(COLOR_HEADER);
      cell.border = borderAll;
      for (let c = 2; c <= 3; c++) {
        ws.getRow(r).getCell(c).fill = fill(COLOR_HEADER);
        ws.getRow(r).getCell(c).border = borderAll;
      }
      r++;
      continue;
    }
    if (row.isTotal) {
      totalCell(ws.getRow(r).getCell(1), row.strategy, "left");
      totalCell(ws.getRow(r).getCell(2), row.profits);
      totalCell(ws.getRow(r).getCell(3), "", "left");
      r++;
      continue;
    }
    bodyCell(ws.getRow(r).getCell(1), row.strategy);
    bodyCell(ws.getRow(r).getCell(2), row.profits, "right");
    bodyCell(ws.getRow(r).getCell(3), row.note);
    r++;
  }
  autoColWidths(ws);
}

function writeHoldingsSheet(
  ws: ExcelJS.Worksheet,
  title: string,
  headers: string[],
  rows: Array<Record<string, string | number>>,
  fields: string[],
  amountField: string,
): void {
  titleRow(ws, title, headers.length);
  headers.forEach((h, i) => headerCell(ws.getRow(2).getCell(i + 1), h, h === "Amount" ? "right" : "left"));
  let total = 0;
  rows.forEach((row, i) => {
    const r = 3 + i;
    fields.forEach((f, ci) => {
      const val = row[f] ?? "";
      bodyCell(ws.getRow(r).getCell(ci + 1), val, f === amountField ? "right" : "left");
    });
    total += Number(row[amountField]) || 0;
  });
  const r = 3 + rows.length;
  totalCell(ws.getRow(r).getCell(1), "Net", "left");
  for (let c = 2; c < fields.length; c++) totalCell(ws.getRow(r).getCell(c), "", "left");
  totalCell(ws.getRow(r).getCell(fields.length), total);
  autoColWidths(ws);
}

function writeTransactionsSheet(
  ws: ExcelJS.Worksheet,
  title: string,
  rows: Array<{ name: string; capitalFlow: string; date: string; strategy: string; amount: number }>,
): void {
  titleRow(ws, title, 5);
  ["Name", "Capital Inflow", "Date", "Strategy", "Amount"].forEach((h, i) =>
    headerCell(ws.getRow(2).getCell(i + 1), h, h === "Amount" ? "right" : "left"),
  );
  let total = 0;
  rows.forEach((row, i) => {
    const r = 3 + i;
    bodyCell(ws.getRow(r).getCell(1), row.name);
    bodyCell(ws.getRow(r).getCell(2), row.capitalFlow);
    bodyCell(ws.getRow(r).getCell(3), row.date);
    bodyCell(ws.getRow(r).getCell(4), row.strategy);
    bodyCell(ws.getRow(r).getCell(5), row.amount, "right");
    total += row.amount;
  });
  const r = 3 + rows.length;
  totalCell(ws.getRow(r).getCell(1), "Net", "left");
  for (let c = 2; c <= 4; c++) totalCell(ws.getRow(r).getCell(c), "", "left");
  totalCell(ws.getRow(r).getCell(5), total);
  autoColWidths(ws);
}

function writeCashTransactionsSheet(
  ws: ExcelJS.Worksheet,
  rows: MultiStrategyInvestmentData["cashTransactions"],
): void {
  titleRow(ws, "Cash Transactions", 4);
  ["Transaction Type", "Date", "Strategy", "Amount"].forEach((h, i) =>
    headerCell(ws.getRow(2).getCell(i + 1), h, h === "Amount" ? "right" : "left"),
  );
  let total = 0;
  rows.forEach((row, i) => {
    const r = 3 + i;
    bodyCell(ws.getRow(r).getCell(1), row.transactionType);
    bodyCell(ws.getRow(r).getCell(2), row.date);
    bodyCell(ws.getRow(r).getCell(3), row.strategy);
    bodyCell(ws.getRow(r).getCell(4), row.amount, "right");
    total += row.amount;
  });
  const r = 3 + rows.length;
  totalCell(ws.getRow(r).getCell(1), "Net", "left");
  totalCell(ws.getRow(r).getCell(2), "", "left");
  totalCell(ws.getRow(r).getCell(3), "", "left");
  totalCell(ws.getRow(r).getCell(4), total);
  autoColWidths(ws);
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function buildInvestmentSummaryWorkbook(data: MultiStrategyInvestmentData): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Qode";
  wb.created = new Date();

  const usedNames = new Set<string>();
  const addSheet = (name: string): ExcelJS.Worksheet => {
    let safe = safeSheetName(name);
    let n = 2;
    while (usedNames.has(safe)) {
      safe = safeSheetName(`${name} ${n}`);
      n++;
    }
    usedNames.add(safe);
    return wb.addWorksheet(safe);
  };

  // data.strategies entries are bare for active strategies, suffixed
  // " (Inactive)" for inactive ones (index.ts's convention — doc 05 Q16).
  const activeStrategies = data.strategies.filter((s) => !s.endsWith(" (Inactive)"));
  const inactiveStrategies = data.strategies
    .filter((s) => s.endsWith(" (Inactive)"))
    .map((s) => s.replace(/\s*\(Inactive\)$/, ""));
  const isMultiStrategyEver = data.strategies.length > 1;

  if (isMultiStrategyEver) {
    for (const strat of activeStrategies) {
      const sd = data.perStrategy[strat];
      if (!sd) continue;
      writeInvestmentSummary(addSheet(`Inv Summary ${shortStrat(strat)}`), sd, strat);
    }
    for (const strat of activeStrategies) {
      const sd = data.perStrategy[strat];
      if (!sd) continue;
      writeOverviewCashSummary(addSheet(`Overview Cash ${shortStrat(strat)}`), sd, strat);
    }
    for (const strat of activeStrategies) {
      const sd = data.perStrategy[strat];
      if (!sd) continue;
      writeCashInvestmentSummary(addSheet(`Cash Inv ${shortStrat(strat)}`), sd, strat);
    }
    for (const strat of activeStrategies) {
      const sd = data.perStrategy[strat];
      if (!sd) continue;
      writeHoldingsInvestmentSummary(addSheet(`Holdings Inv ${shortStrat(strat)}`), sd, strat);
    }
    for (const strat of activeStrategies) {
      const sd = data.perStrategy[strat];
      if (!sd) continue;
      writeCurrentAccountSummary(addSheet(`Acct Summary ${shortStrat(strat)}`), sd, strat);
    }

    writeInvestmentSummary(addSheet("Investment Summary"), data, "Total Portfolio");
    writeOverviewCashSummary(addSheet("Overview Cash Summary"), data, "Total Portfolio");
    writeCashInvestmentSummary(addSheet("Cash Investment Summary"), data, "Total Portfolio");
    writeHoldingsInvestmentSummary(addSheet("Holdings Investment Summary"), data, "Total Portfolio");
    writeCurrentAccountSummary(addSheet("Current Account Summary"), data, "Total Portfolio");
  } else {
    writeInvestmentSummary(addSheet("Investment Summary"), data, "");
    writeOverviewCashSummary(addSheet("Overview Cash Summary"), data, "");
    writeCashInvestmentSummary(addSheet("Cash Investment Summary"), data, "");
    writeHoldingsInvestmentSummary(addSheet("Holdings Investment Summary"), data, "");
    writeCurrentAccountSummary(addSheet("Current Account Summary"), data, "");
  }

  // Inactive strategy sheets — Cash Inv / Holdings Inv only, no Overview
  // Cash / Account Summary (nothing current to reconcile), per doc 02.
  for (const strat of inactiveStrategies) {
    const sd = data.perStrategy[`${strat} (Inactive)`];
    if (!sd) continue;
    const label = `${strat} (Inactive)`;
    writeCashInvestmentSummary(addSheet(`Cash Inv ${shortStrat(strat)} (Inactive)`), sd, label);
    writeHoldingsInvestmentSummary(addSheet(`Holdings Inv ${shortStrat(strat)} (Inactive)`), sd, label);
  }

  writeProfitRedeployment(addSheet("Profit Redeployment"), data.profitRedeployment);

  writeHoldingsSheet(
    addSheet("Current MF Holdings"),
    "Current MF Holdings",
    ["Fund Name", "Type", "Broker", "Strategy", "Amount"],
    data.currentMfHoldings.map((h) => ({
      "Fund Name": h.name,
      Type: h.type,
      Broker: h.broker,
      Strategy: h.strategy,
      Amount: h.amount,
    })),
    ["Fund Name", "Type", "Broker", "Strategy", "Amount"],
    "Amount",
  );

  writeHoldingsSheet(
    addSheet("Current Equity Holdings"),
    "Current Equity Holdings",
    ["Stock Name", "Type", "Broker", "Exchange", "Strategy", "Amount"],
    data.currentEquityHoldings.map((h) => ({
      "Stock Name": h.name,
      Type: h.type,
      Broker: h.broker,
      Exchange: h.exchange,
      Strategy: h.strategy,
      Amount: h.amount,
    })),
    ["Stock Name", "Type", "Broker", "Exchange", "Strategy", "Amount"],
    "Amount",
  );

  writeTransactionsSheet(addSheet("MF Transactions"), "MF Transactions", data.mfTransactions);
  writeTransactionsSheet(addSheet("Equity Transactions"), "Equity Transactions", data.equityTransactions);
  writeCashTransactionsSheet(addSheet("Cash Transactions"), data.cashTransactions);

  return wb;
}
