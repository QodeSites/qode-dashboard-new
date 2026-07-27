// Hardcoded "Profit Redeployment Summary" figures for clients whose
// pre-migration / inactive-strategy profit numbers are reconciled manually
// (e.g. legacy schemes closed out and rolled into a PMS account) rather than
// derivable from the mastersheet's system-tag PnL sums.
//
// Keyed by icode. To add another client, add a new entry below — the row
// shape matches MultiStrategyInvestmentData["profitRedeployment"].
import type { MultiStrategyInvestmentData } from "@/app/lib/parse-investment-pdf";

type ProfitRedeploymentRow = MultiStrategyInvestmentData["profitRedeployment"][number];

export const PROFIT_REDEPLOYMENT_OVERRIDES: Record<string, ProfitRedeploymentRow[]> = {
  // Sarla Performance Fibers Pvt. Ltd. (QUS0007)
  QUS0007: [
    { strategy: "Scheme A", profits: 79783174.5, note: "PMS" },
    { strategy: "Scheme C", profits: 4052160.7, note: "Scheme D,E,F" },
    { strategy: "Scheme D", profits: 232540.0, note: "QAW - Zerodha" },
    { strategy: "Scheme E", profits: 13020843.3, note: "QAW - Zerodha" },
    { strategy: "Scheme F", profits: 10954459.7, note: "QAW - Zerodha" },
    { strategy: "Scheme QAW", profits: 7169015.3, note: "PMS" },
    { strategy: "Total Profits", profits: 115212193.4, note: "", isTotal: true },
  ],
};

// Inserts a computed subtotal row after each section's data rows and a grand
// total at the end. Strips any pre-existing isTotal rows (they're stale once
// live PMS figures are injected). Sections are delimited by isHeader rows;
// rows before the first header form an implicit "active" section.
export function withSectionTotals(rows: ProfitRedeploymentRow[]): ProfitRedeploymentRow[] {
  const result: ProfitRedeploymentRow[] = [];
  let sectionRows: ProfitRedeploymentRow[] = [];
  let lastHeader: string | null = null;
  let grandTotal = 0;

  const flushSection = () => {
    if (sectionRows.length === 0) return;
    const total = sectionRows.reduce((s, r) => s + (r.profits || 0), 0);
    grandTotal += total;
    const isInactive = lastHeader !== null && lastHeader.toLowerCase().includes("inactive");
    result.push({ strategy: isInactive ? "Inactive Total" : "Active Total", profits: total, note: "", isTotal: true });
    sectionRows = [];
  };

  for (const row of rows) {
    if (row.isTotal) continue;
    if (row.isHeader) {
      flushSection();
      lastHeader = row.strategy;
      result.push(row);
    } else {
      result.push(row);
      sectionRows.push(row);
    }
  }
  flushSection();

  result.push({ strategy: "Grand Total", profits: grandTotal, note: "", isTotal: true });
  return result;
}

// Appends this icode's hardcoded rows after the xlsx-parsed rows (with a
// divider row between them) — shows both sources rather than replacing one
// with the other. Returns excelRows unchanged if the icode has no override.
export function withProfitRedeploymentOverrides(
  icode: string | undefined,
  excelRows: ProfitRedeploymentRow[],
): ProfitRedeploymentRow[] {
  const overrides = icode ? PROFIT_REDEPLOYMENT_OVERRIDES[icode] : undefined;
  if (!overrides) return excelRows;
  return [
    ...excelRows,
    { strategy: "Inactive", profits: 0, note: "", isHeader: true },
    ...overrides,
  ];
}
