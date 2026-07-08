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
