/**
 * Shared type definitions for the Investment Summary report shape.
 *
 * Originally this file also parsed the legacy .xlsx workbook that the
 * Python pipeline produced (via the `xlsx` package). That parsing code
 * was removed 2026-08-12 (doc 05 Q14) once the last two clients still on
 * the .xlsx path (Sarla/QUS0007, Satidham-new/QUS00081) were cut over to
 * the Postgres-native calculator (app/lib/investment-summary/index.ts) —
 * every client now produces this same shape directly from Postgres, so
 * nothing calls parseInvestmentXlsx() anymore. The types stayed here
 * (rather than moving) since app/investment-summary/page.tsx,
 * print-report.ts, and profit-redeployment-overrides.ts all still import
 * from this path.
 */

export interface InvestmentSummaryData {
  clientName: string;
  generatedDate: string;
  dataAsOfDate: string;

  // Investment Summary sheet
  amountInvested: { holdings: number; cash: number; total: number };

  // 5 reconciliation checks (port of calc_validation_summary, doc 02) —
  // optional since only the Postgres-native calculator populates it.
  // "Missing Input Files" always PASSes: that check tracks failed Excel-
  // sheet downloads from the old file-fetching pipeline, a step that
  // doesn't exist in this Postgres-native path. "Missing System Tags" is
  // real (see index.ts's checkMissingSystemTags / tags.ts).
  validationChecks?: Array<{
    checkName: string;
    value: number;
    status: "PASS" | "FAIL";
    remarks: string;
  }>;

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
    isTotal?: boolean;
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
