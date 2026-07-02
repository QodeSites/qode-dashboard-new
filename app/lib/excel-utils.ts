import ExcelJS from "exceljs";
import type { StrategyBreakupRow } from "./internal-utils";

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
  if (value == null) {
    cell.value = "—";
    return;
  }
  cell.value = value;
  cell.numFmt = PCT_FMT;
  const positive = value >= 0;
  cell.fill = fill(positive ? XL_COLORS.positive : XL_COLORS.negative);
  cell.font = {
    color: { argb: positive ? XL_COLORS.positiveText : XL_COLORS.negativeText },
  };
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
  lastCol: number,
): void {
  ws.mergeCells(1, 2, 1, lastCol);
  const cell = ws.getCell(1, 2);
  cell.value = title;
  cell.font = { bold: true, color: { argb: XL_COLORS.white } };
  cell.fill = fill(XL_COLORS.title);
  cell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = HEADER_ROW_HEIGHT;
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

  writeTitle(ws, "Strategy-wise Client Breakup", lastCol);

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
