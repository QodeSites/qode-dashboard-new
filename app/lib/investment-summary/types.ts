/**
 * Shared types for the Postgres-native Investment Summary calculator.
 * See docs/investment-summary-migration/04-migration-plan.md for the module map.
 *
 * MultiStrategyInvestmentData etc. stay defined in parse-investment-pdf.ts
 * (today's xlsx parser) — re-exported here so every new module imports from
 * one place, and so the two computation paths (old xlsx parser, new DB
 * calculator) can be diffed against the exact same shape during Phase 2.
 * "@/*" maps to the repo root (tsconfig.json), so this resolves to
 * app/lib/parse-investment-pdf.ts.
 */
export type {
  InvestmentSummaryData,
  StrategyInvestmentData,
  MultiStrategyInvestmentData,
} from "@/app/lib/parse-investment-pdf";

/**
 * One row of the consolidated Master_Config.csv (doc 05 Q10 / doc 04).
 * Only the columns the calculator modules actually use are modeled here —
 * the fee/hurdle/GST/override/folder/filename columns present in the real
 * file are intentionally not read by this calculator (doc 04's
 * "Master_Config.csv — status" section).
 */
export interface ClientStrategyConfigRow {
  icode: string;
  qcode: string;
  clientName: string;
  strategy: string;
  effectiveFrom: string; // ISO date (YYYY-MM-DD)
  effectiveTo: string | null; // null = still active
  status: "Active" | "Inactive";
  forProfitTag: string; // exact system_tag for that strategy's unrealised profit
  forExposureTag: string | null; // kept per doc 05 Q8, not currently consumed by any calculator
}

/** Base tag names loaded from config/system_tags.yaml (doc 02). */
export interface BaseSystemTags {
  zerodhaTotalPortfolio: string;
  equityStockHoldings: string;
  mutualFunds: string;
  liquidcaseStockHoldings: string;
  bondStockHoldings: string;
  liquidbees: string;
  equityOtherDebitsCredits: string;
  equityHoldingsTax: string;
  miscellaneousPnl: string;
  totalPortfolioValue: string;
}

/** Narrowed shape of a bifurcated_master_sheet_test row, as read by mastersheet.ts. */
export interface MasterSheetRow {
  date: Date;
  systemTag: string;
  portfolioValue: number | null;
  capitalInOut: number | null;
  nav: number | null;
  pnl: number | null;
  drawdown: number | null;
}

/** Result of tags.ts's resolveTagAlias — which candidate tag actually got used, for traceability/debugging. */
export interface ResolvedTag {
  tag: string;
  candidatesTried: string[];
  matchedNonZero: boolean;
}

/**
 * One row of current (latest-snapshot) holdings, as read by holdings.ts from
 * either bifurcated_equity_holding_test or bifurcated_mutual_fund_holding_sheet_test —
 * ports of Python's calc_eq_holdings/calc_mf_holdings row shape (doc 02/04).
 */
export interface HoldingRow {
  symbol: string | null;
  quantity: number | null;
  avgPrice: number | null;
  buyValue: number | null;
  valueAsOfToday: number | null;
  pnlAmount: number | null;
  percentPnl: number | null;
  subCategory: string | null;
  strategy: string | null;
  broker: string | null;
  /** `debt_equity` column on both source tables — used by calc_holdings_bifurcation (doc 02) to group holdings. */
  debtEquity: string | null;
  /** `exchange` column — equity table only (bifurcated_equity_holding_test); always null for MF holdings (that table has no such column, it has `isin` instead). Needed for the "Current Equity Holdings" output shape (parse-investment-pdf.ts's InvestmentSummaryData). */
  exchange: string | null;
}
