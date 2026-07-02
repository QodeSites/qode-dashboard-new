import ExcelJS from "exceljs";
import type {
  StrategyBreakupRow,
  AccountRow,
  EquityBreakupRow,
} from "./internal-utils";

// brand palette — pulled from the reference exports, shared by every report
export const XL_COLORS = {
  title: "FF02422B",
  sectionHeader: "FFEFECD3",
  positive: "FFE8F5E9",
  negative: "FFFFEBEE",
  positiveText: "FF1B5E20",
  negativeText: "FFC62828",
  white: "FFFFFFFF",
};

const PCT_FMT = '+0.00%;[Red]-0.00%;"—"';
const DIFF_PCT_FMT = "+0.00%;[Red](0.00%)";
const PLAIN_PCT_FMT = "0.00%";
const MONEY_FMT = "₹#,##0;[Red](₹#,##0)";
const RATIO_FMT = "0.000";
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const HEADER_ROW_HEIGHT = 42;
const MIN_COL_WIDTH = 10;
const MAX_COL_WIDTH = 40;

function fill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

// tracks the widest content seen per column so widths are content-driven,
// not a fixed guess — same helper reused for every future export
export class ColumnWidthTracker {
  private max = new Map<number, number>();

  see(col: number, text: string): void {
    const len = text.length;
    if (len > (this.max.get(col) ?? 0)) this.max.set(col, len);
  }

  apply(ws: ExcelJS.Worksheet): void {
    for (const [col, len] of this.max) {
      ws.getColumn(col).width = Math.min(
        MAX_COL_WIDTH,
        Math.max(MIN_COL_WIDTH, len + 2),
      );
    }
  }
}

// % + sign-colored fill/text, "—" for null — used by every percentage-shaped column
export function writePctCell(cell: ExcelJS.Cell, value: number | null): void {
  writeColoredPct(cell, value, PCT_FMT);
}

// same coloring, parens instead of minus for negative — Account Value Breakup's diff style
export function writeDiffPctCell(
  cell: ExcelJS.Cell,
  value: number | null,
): void {
  writeColoredPct(cell, value, DIFF_PCT_FMT);
}

function writeColoredPct(
  cell: ExcelJS.Cell,
  value: number | null,
  fmt: string,
): void {
  if (value == null) {
    cell.value = "—";
    return;
  }
  cell.value = value;
  cell.numFmt = fmt;
  const positive = value >= 0;
  cell.fill = fill(positive ? XL_COLORS.positive : XL_COLORS.negative);
  cell.font = {
    color: { argb: positive ? XL_COLORS.positiveText : XL_COLORS.negativeText },
  };
}

// plain %, no color — factual splits rather than diffs (Equity%, LC%, etc.)
export function writePlainPctCell(
  cell: ExcelJS.Cell,
  value: number | null,
): void {
  cell.value = value == null ? "—" : value;
  if (value != null) cell.numFmt = PLAIN_PCT_FMT;
}

// ₹ amount, no color, "—" for null
export function writeMoneyCell(cell: ExcelJS.Cell, value: number | null): void {
  cell.value = value == null ? "—" : value;
  if (value != null) cell.numFmt = MONEY_FMT;
}

// plain 3-decimal ratio, never colored, "—" for null
export function writeRatioCell(cell: ExcelJS.Cell, value: number | null): void {
  cell.value = value == null ? "—" : value;
  if (value != null) cell.numFmt = RATIO_FMT;
}

// "YYYY-MM-DD" -> "DD-MMM-YYYY", matching the reference export style
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}-${MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

// full-width dark banner, merged across every data column — not just col B
export function writeTitle(
  ws: ExcelJS.Worksheet,
  title: string,
  row: number,
  lastCol: number,
): void {
  ws.mergeCells(row, 2, row, lastCol);
  const cell = ws.getCell(row, 2);
  cell.value = title;
  cell.font = { bold: true, color: { argb: XL_COLORS.white } };
  cell.fill = fill(XL_COLORS.title);
  cell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(row).height = HEADER_ROW_HEIGHT;
}

// tan section-banner row: bucket label in col B, wrapped headers across the rest
export function writeSectionHeader(
  ws: ExcelJS.Worksheet,
  row: number,
  bucketLabel: string,
  headers: string[],
  widths: ColumnWidthTracker,
): void {
  const r = ws.getRow(row);
  [bucketLabel, ...headers].forEach((h, i) => {
    const col = 2 + i;
    const cell = r.getCell(col);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = fill(XL_COLORS.sectionHeader);
    cell.alignment = { wrapText: true, vertical: "middle" };
    widths.see(col, h.split(" ")[0]); // wrapped, so only the longest word drives width
  });
  r.height = HEADER_ROW_HEIGHT;
}

type ColKind = "pct" | "ratio";
interface Col {
  header: string;
  kind: ColKind;
  get: (r: StrategyBreakupRow) => number | null;
}

const COLUMNS: Col[] = [
  {
    header: "Return Since Inception",
    kind: "pct",
    get: (r) => r.since_inception,
  },
  { header: "Benchmark Return", kind: "pct", get: (r) => r.benchmark_return },
  { header: "Max Drawdown", kind: "pct", get: (r) => r.max_drawdown },
  { header: "Current Drawdown", kind: "pct", get: (r) => r.current_drawdown },
  { header: "Upside Capture", kind: "pct", get: (r) => r.upside_capture },
  { header: "Downside Capture", kind: "pct", get: (r) => r.downside_capture },
  { header: "Sharpe", kind: "ratio", get: (r) => r.sharpe },
  { header: "Sortino", kind: "ratio", get: (r) => r.sortino },
  { header: "Calmar", kind: "ratio", get: (r) => r.calmar },
  { header: "Volatility (Ann.)", kind: "pct", get: (r) => r.ann_volatility },
  { header: "Tracking Error", kind: "pct", get: (r) => r.tracking_error },
  {
    header: "Information Ratio",
    kind: "ratio",
    get: (r) => r.information_ratio,
  },
  { header: "Alpha", kind: "pct", get: (r) => r.alpha },
  { header: "Beta", kind: "ratio", get: (r) => r.beta },
];

export function buildStrategyBreakupWorkbook(
  rows: StrategyBreakupRow[],
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Strategy-wise Client Breakup");
  const widths = new ColumnWidthTracker();
  const lastCol = 3 + COLUMNS.length; // client + date + metric columns

  writeTitle(ws, "Strategy-wise Client Breakup", 1, lastCol);

  const buckets = new Map<string, StrategyBreakupRow[]>();
  for (const r of rows) {
    if (!buckets.has(r.strategy)) buckets.set(r.strategy, []);
    buckets.get(r.strategy)!.push(r);
  }

  let row = 3;
  for (const strategy of [...buckets.keys()].sort()) {
    writeSectionHeader(
      ws,
      row,
      `${strategy} Clients`,
      ["Inception Date", ...COLUMNS.map((c) => c.header)],
      widths,
    );
    row++;

    for (const r of buckets.get(strategy)!) {
      const dr = ws.getRow(row);
      const clientLabel = `${r.account_name} ${r.strategy}`;
      const clientCell = dr.getCell(2);
      clientCell.value = clientLabel;
      clientCell.font = { bold: true };
      widths.see(2, clientLabel);

      const dateLabel = formatDate(r.inception_date);
      dr.getCell(3).value = dateLabel;
      widths.see(3, dateLabel);

      COLUMNS.forEach((col, i) => {
        const c = 4 + i;
        const cell = dr.getCell(c);
        const value = col.get(r);
        if (col.kind === "pct") writePctCell(cell, value);
        else writeRatioCell(cell, value);
        widths.see(c, value != null ? "+00.00%" : "—");
      });
      row++;
    }
    row += 2; // blank row between buckets
  }

  widths.apply(ws);
  return wb;
}

// ── Account Value Breakup ────────────────────────────────────────────────────

// "QYE++" -> { family: "QYE", leverage: "++" } — no hardcoded strategy names
function splitStrategy(strategy: string): { family: string; leverage: string } {
  const leverage = strategy.endsWith("++") ? "++" : "+";
  return { family: strategy.slice(0, -leverage.length), leverage };
}

function writeHeaderRow(
  ws: ExcelJS.Worksheet,
  row: number,
  headers: string[],
  widths: ColumnWidthTracker,
): void {
  headers.forEach((h, i) => {
    const col = 2 + i;
    const cell = ws.getRow(row).getCell(col);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = fill(XL_COLORS.sectionHeader);
    widths.see(col, h);
  });
}

function writeTotalCell(
  ws: ExcelJS.Worksheet,
  row: number,
  col: number,
  value: number,
  isLabel: boolean,
): void {
  const cell = ws.getRow(row).getCell(col);
  cell.value = value;
  cell.font = { bold: true, color: { argb: XL_COLORS.white } };
  cell.fill = fill(XL_COLORS.title);
  if (!isLabel) cell.numFmt = MONEY_FMT;
}

function writeSection1(
  ws: ExcelJS.Worksheet,
  startRow: number,
  rows: AccountRow[],
  widths: ColumnWidthTracker,
): number {
  const headers = [
    "Strategy",
    "Leverage",
    "Client Name",
    "Total AV",
    "Equity Book",
    "Debt Book",
    "Equity (%)",
    "Debt (%)",
    "Diff EQ",
    "Diff Debt",
  ];
  writeTitle(ws, "Account Value Break-up", startRow, 1 + headers.length);
  const headerRow = startRow + 1;
  writeHeaderRow(ws, headerRow, headers, widths);

  let r = headerRow + 1;
  let totalAv = 0;
  for (const row of rows) {
    const { family, leverage } = splitStrategy(row.strategy);
    const dr = ws.getRow(r);
    dr.getCell(2).value = family;
    dr.getCell(2).fill = fill("FFF5F5F5");
    dr.getCell(3).value = leverage;
    dr.getCell(3).fill = fill("FFF5F5F5");
    const clientLabel = `${row.account_name} ${row.strategy}`;
    dr.getCell(4).value = clientLabel;
    dr.getCell(4).font = { bold: true };
    widths.see(4, clientLabel);

    writeMoneyCell(dr.getCell(5), row.total_av);
    writeMoneyCell(dr.getCell(6), row.equity_book);
    writeMoneyCell(dr.getCell(7), row.debt_book);
    writePlainPctCell(dr.getCell(8), row.equity_pct);
    writePlainPctCell(dr.getCell(9), row.debt_pct);
    writeDiffPctCell(dr.getCell(10), row.diff_equity);
    writeDiffPctCell(dr.getCell(11), row.diff_debt);
    totalAv += row.total_av;
    r++;
  }

  ws.getRow(r).getCell(4).value = "Total AUM";
  ws.getRow(r).getCell(4).font = {
    bold: true,
    color: { argb: XL_COLORS.white },
  };
  ws.getRow(r).getCell(4).fill = fill(XL_COLORS.title);
  writeTotalCell(ws, r, 5, totalAv, false);
  return r + 2;
}

function writeSection2(
  ws: ExcelJS.Worksheet,
  startRow: number,
  rows: AccountRow[],
  widths: ColumnWidthTracker,
): number {
  const headers = [
    "Leverage",
    "Client Name",
    "Debt Book",
    "% of Total AV",
    "Liquid Case",
    "Cash",
    "LC (%)",
    "Cash (%)",
    "Diff LC",
    "Diff Cash",
  ];
  writeTitle(ws, "Debt Book Break-up", startRow, 1 + headers.length);
  const headerRow = startRow + 1;
  writeHeaderRow(ws, headerRow, headers, widths);

  let r = headerRow + 1;
  let totalDebt = 0,
    totalLc = 0,
    totalCash = 0;
  for (const row of rows) {
    const { leverage } = splitStrategy(row.strategy);
    const dr = ws.getRow(r);
    dr.getCell(2).value = leverage;
    dr.getCell(2).fill = fill("FFF5F5F5");
    const clientLabel = `${row.account_name} ${row.strategy}`;
    dr.getCell(3).value = clientLabel;
    dr.getCell(3).font = { bold: true };
    widths.see(3, clientLabel);

    writeMoneyCell(dr.getCell(4), row.debt_book);
    writePlainPctCell(dr.getCell(5), row.debt_pct);
    writeMoneyCell(dr.getCell(6), row.liquid_case);
    writeMoneyCell(dr.getCell(7), row.cash);
    writePlainPctCell(dr.getCell(8), row.lc_pct);
    writePlainPctCell(dr.getCell(9), row.cash_pct);
    writeDiffPctCell(dr.getCell(10), row.diff_lc);
    writeDiffPctCell(dr.getCell(11), row.diff_cash);
    totalDebt += row.debt_book;
    totalLc += row.liquid_case;
    totalCash += row.cash;
    r++;
  }

  ws.getRow(r).getCell(3).value = "Total";
  ws.getRow(r).getCell(3).font = {
    bold: true,
    color: { argb: XL_COLORS.white },
  };
  ws.getRow(r).getCell(3).fill = fill(XL_COLORS.title);
  writeTotalCell(ws, r, 4, totalDebt, false);
  writeTotalCell(ws, r, 6, totalLc, false);
  writeTotalCell(ws, r, 7, totalCash, false);
  return r + 2;
}

function writeSection3(
  ws: ExcelJS.Worksheet,
  startRow: number,
  rows: EquityBreakupRow[],
  widths: ColumnWidthTracker,
): number {
  const headers = [
    "Strategy",
    "Client Name",
    "Equity Book",
    "% of Total AV",
    "Gold",
    "Low Vol",
    "Momentum",
    "Gold %",
    "Low Vol %",
    "Mom %",
    "Diff Gold",
    "Diff Low Vol",
    "Diff Mom",
  ];
  writeTitle(ws, "Equity Book Break-up", startRow, 1 + headers.length);
  const headerRow = startRow + 1;
  writeHeaderRow(ws, headerRow, headers, widths);

  let r = headerRow + 1;
  let totalEq = 0,
    totalGold = 0,
    totalLowVol = 0,
    totalMom = 0;
  for (const row of rows) {
    const { family } = splitStrategy(row.strategy);
    const dr = ws.getRow(r);
    dr.getCell(2).value = family;
    dr.getCell(2).fill = fill("FFF5F5F5");
    const clientLabel = `${row.account_name} ${row.strategy}`;
    dr.getCell(3).value = clientLabel;
    dr.getCell(3).font = { bold: true };
    widths.see(3, clientLabel);

    writeMoneyCell(dr.getCell(4), row.equity_book);
    writePlainPctCell(dr.getCell(5), row.equity_pct);
    writeMoneyCell(dr.getCell(6), row.gold);
    writeMoneyCell(dr.getCell(7), row.lowvol);
    writeMoneyCell(dr.getCell(8), row.momentum);
    writePlainPctCell(dr.getCell(9), row.gold_pct);
    writePlainPctCell(dr.getCell(10), row.lowvol_pct);
    writePlainPctCell(dr.getCell(11), row.momentum_pct);
    writeDiffPctCell(dr.getCell(12), row.diff_gold);
    writeDiffPctCell(dr.getCell(13), row.diff_lowvol);
    writeDiffPctCell(dr.getCell(14), row.diff_momentum);
    totalEq += row.equity_book;
    totalGold += row.gold;
    totalLowVol += row.lowvol;
    totalMom += row.momentum;
    r++;
  }

  ws.getRow(r).getCell(3).value = "Total";
  ws.getRow(r).getCell(3).font = {
    bold: true,
    color: { argb: XL_COLORS.white },
  };
  ws.getRow(r).getCell(3).fill = fill(XL_COLORS.title);
  writeTotalCell(ws, r, 4, totalEq, false);
  writeTotalCell(ws, r, 6, totalGold, false);
  writeTotalCell(ws, r, 7, totalLowVol, false);
  writeTotalCell(ws, r, 8, totalMom, false);
  return r + 2;
}

export function buildAccountValueBreakupWorkbook(result: {
  accounts: AccountRow[];
  equity_breakup: EquityBreakupRow[];
}): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Account Value Break-up");
  const widths = new ColumnWidthTracker();

  const accounts = [...result.accounts].sort((a, b) =>
    a.account_name.localeCompare(b.account_name),
  );
  const equity = [...result.equity_breakup].sort((a, b) =>
    a.account_name.localeCompare(b.account_name),
  );

  let row = writeSection1(ws, 2, accounts, widths);
  row = writeSection2(ws, row, accounts, widths);
  writeSection3(ws, row, equity, widths);

  widths.apply(ws);
  return wb;
}
