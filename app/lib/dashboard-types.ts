// Dashboard Type Definitions

export interface EquityCurvePoint {
  date: string;
  value: number;
}

export interface TrailingReturns {
  fiveDays?: string | null;
  tenDays?: string | null;
  fifteenDays?: string | null;
  oneMonth?: string | null;
  threeMonths?: string | null;
  sixMonths?: string | null;
  oneYear?: string | null;
  twoYears?: string | null;
  fiveYears?: string | null;
  sinceInception: string;
  MDD?: string;
  currentDD?: string;
}

export interface CombinedTrailingCell {
  portfolio?: string | null;
  benchmark?: string | null;
}

export interface CombinedTrailing {
  fiveDays?: CombinedTrailingCell;
  tenDays?: CombinedTrailingCell;
  fifteenDays?: CombinedTrailingCell;
  oneMonth?: CombinedTrailingCell;
  threeMonths?: CombinedTrailingCell;
  sixMonths?: CombinedTrailingCell;
  oneYear?: CombinedTrailingCell;
  twoYears?: CombinedTrailingCell;
  fiveYears?: CombinedTrailingCell;
  sinceInception: CombinedTrailingCell;
  MDD?: CombinedTrailingCell;
  currentDD?: CombinedTrailingCell;
}

export interface Stats {
  amountDeposited: string;
  currentExposure: string;
  return: string;
  totalProfit: string;
  trailingReturns: TrailingReturns;
  benchmarkTrailingReturns?: TrailingReturns;
  drawdown: string;
  equityCurve: EquityCurvePoint[];
  drawdownCurve: { date: string; value: number }[];
  quarterlyPnl: {
    [year: string]: {
      percent: { q1: string; q2: string; q3: string; q4: string; total: string };
      cash: { q1: string; q2: string; q3: string; q4: string; total: string };
      yearCash: string;
    };
  };
  monthlyPnl: {
    [year: string]: {
      months: { [month: string]: { percent: string; cash: string; capitalInOut: string } };
      totalPercent: number | string;
      totalCash: number;
      totalCapitalInOut: number;
    };
  };
  cashFlows: { date: string; amount: number }[];
  strategyName?: string;
  fees?: {
    [year: string]: {
      q1: string;
      q2: string;
      q3: string;
      q4: string;
      total: string;
    };
  };
}

export interface PmsStats {
  totalPortfolioValue: string;
  totalPnl: string;
  maxDrawdown: string;
  cumulativeReturn: string;
  equityCurve: EquityCurvePoint[];
  drawdownCurve: { date: string; value: number }[];
  quarterlyPnl: {
    [year: string]: {
      percent: { q1: string; q2: string; q3: string; q4: string; total: string };
      cash: { q1: string; q2: string; q3: string; q4: string; total: string };
      yearCash?: string;
    };
  };
  monthlyPnl: {
    [year: string]: {
      months: { [month: string]: { percent: string; cash: string; capitalInOut?: string } };
      totalPercent: number;
      totalCash: number;
      totalCapitalInOut?: number;
    };
  };
  trailingReturns: TrailingReturns;
  benchmarkTrailingReturns?: TrailingReturns;
  cashFlows: { date: string; amount: number }[];
  strategyName?: string;
  fees?: {
    [year: string]: {
      q1: string;
      q2: string;
      q3: string;
      q4: string;
      total: string;
    };
  };
}

export interface Account {
  qcode: string;
  account_name: string;
  account_type: string;
  broker: string;
}

export interface Metadata {
  icode: string;
  accountCount: number;
  inceptionDate: string | null;
  dataAsOfDate: string | null;
  lastUpdated: string;
  strategyName: string;
  filtersApplied: {
    accountType: string | null;
    broker: string | null;
    startDate: string | null;
    endDate: string | null;
  };
  isActive: boolean;
  benchmarkTrailingReturns?: TrailingReturns;
}

export interface SarlaApiResponse {
  [strategyName: string]: {
    data: Stats | PmsStats;
    metadata: Metadata;
  };
}

export type ReturnView = "percent" | "cash";
