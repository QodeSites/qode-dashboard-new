// Typed client for the /api/internal/* portfolio review endpoints.
// All requests rely on the browser's same-origin session cookie
// (credentials: "include"), set after logging in as an INTERNAL_EMAILS user.

export interface ClientStrategyOption {
  id: number | null;
  strategy: string;
  effective_from: string;
  effective_to: string | null;
  profit_tag: string;
  exposure_tag: string;
}

export interface ClientListItem {
  qcode: string;
  account_name: string;
  strategies: ClientStrategyOption[];
}

export interface RatioSet {
  sharpe: number | null;
  sortino: number | null;
  calmar: number | null;
  ann_volatility: number | null;
  monthly_volatility: number;
  best_month: number;
  worst_month: number;
  avg_monthly_return: number;
  win_rate: number;
  downside_deviation: number;
}

export interface MonthlyReturnEntry {
  year: number;
  month: string;
  return_pct: number;
  pnl_inr: number;
}
export interface QuarterlyReturnEntry {
  year: number;
  quarter: string;
  return_pct: number;
  pnl_inr: number;
}
export interface YearlyReturnEntry {
  year: number;
  return_pct: number;
  pnl_inr: number;
}
export interface SeriesPoint {
  date: string;
  nav: number;
  drawdown: number;
}

export interface TagDetail {
  start_date: string;
  end_date: string;
  since_inception: number;
  since_inception_pnl: number;
  max_drawdown: number;
  current_drawdown: number;
  ratios: RatioSet;
  monthly: MonthlyReturnEntry[];
  quarterly: QuarterlyReturnEntry[];
  yearly: YearlyReturnEntry[];
  series: SeriesPoint[];
}

export interface BenchmarkData {
  since_inception: number;
  max_drawdown: number;
  current_drawdown: number;
  series: { date: string; nav: number }[];
}

export interface ClientDashboardResponse {
  account_name: string;
  data_as_of: string;
  risk_free_rate: number;
  benchmark: BenchmarkData;
  profit_tag: string;
  tags: Record<string, TagDetail>;
}

export interface PortfolioSummaryInvestor {
  qcode: string;
  account_name: string;
  strategy: string;
  since: string;
  aum: number;
  until: string | null;
}

export interface PortfolioSummaryResponse {
  total_investors: number;
  total_aum: number;
  mom: {
    prev_aum: number;
    prev_date: string;
    change_pct: number;
  };
  investors: PortfolioSummaryInvestor[];
  aum_daily: { date: string; aum: number }[];
  strategy_aum_daily: Record<string, { date: string; aum: number }[]>;
}

// ─── Strategy-wise Client Breakup ────────────────────────────────────────────

export interface StrategyBreakupRow {
  qcode: string;
  account_name: string;
  strategy: string;
  inception_date: string;
  since_inception: number;
  benchmark_return: number;
  max_drawdown: number;
  current_drawdown: number;
  upside_capture: number | null;
  downside_capture: number | null;
  sharpe: number | null;
  sortino: number | null;
  calmar: number | null;
  ann_volatility: number | null;
  tracking_error: number | null;
  information_ratio: number | null;
  alpha: number | null;
  beta: number | null;
  end_date: string | null;
}

// ─── Account Value Breakup ────────────────────────────────────────────────────

export interface AccountValueRow {
  qcode: string;
  account_name: string;
  strategy: string;
  total_av: number;
  equity_book: number;
  debt_book: number;
  equity_pct: number;
  debt_pct: number;
  diff_equity: number;
  diff_debt: number;
  liquid_case: number;
  cash: number;
  lc_pct: number;
  cash_pct: number;
  diff_lc: number;
  diff_cash: number;
}

export interface EquityBreakupRow {
  qcode: string;
  account_name: string;
  strategy: string;
  equity_book: number;
  equity_pct: number;
  gold: number;
  lowvol: number;
  momentum: number;
  gold_pct: number | null;
  lowvol_pct: number | null;
  momentum_pct: number | null;
  diff_gold: number | null;
  diff_lowvol: number | null;
  diff_momentum: number | null;
}

export interface AccountValueBreakupResponse {
  accounts: AccountValueRow[];
  equity_breakup: EquityBreakupRow[];
}

export interface AccountValueOverride {
  qcode?: string;
  strategy?: string;
  equity_pct?: number;
  debt_pct?: number;
  lc_pct?: number;
  cash_pct?: number;
  gold_pct?: number;
  lowvol_pct?: number;
  momentum_pct?: number;
}

// ─── Sub-Strategy Performance ─────────────────────────────────────────────────

export interface SubStrategyEntry {
  section: string;
  qcode: string;
  account_name: string;
  strategy: string;
  monthly: { year: number; month: string; return_pct: number; pnl_inr: number }[];
  yearly: { year: number; return_pct: number; pnl_inr: number }[];
}

// ─── Strategy-wise Monthly Returns ───────────────────────────────────────────

export interface StrategyMonthlyEntry {
  qcode: string;
  account_name: string;
  strategy: string;
  monthly: { year: number; month: string; return_pct: number; pnl_inr: number }[];
  yearly: { year: number; return_pct: number; pnl_inr: number }[];
}

// ─── Shared fetch infrastructure ─────────────────────────────────────────────

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      message = body?.error || message;
    } catch {
      // response wasn't JSON — keep the generic message
    }
    throw new ApiError(message, res.status);
  }

  return res.json();
}

export async function fetchClients(): Promise<ClientListItem[]> {
  return apiFetch<ClientListItem[]>("/api/internal/clients");
}

export async function fetchClientDashboard(
  qcode: string,
  strategy: string,
  riskFreeRate?: number,
  asOf?: string
): Promise<ClientDashboardResponse> {
  return apiFetch<ClientDashboardResponse>("/api/internal/portfolio-review/client-dashboard", {
    method: "POST",
    body: JSON.stringify({
      qcode,
      strategy,
      ...(riskFreeRate !== undefined ? { risk_free_rate: riskFreeRate } : {}),
      ...(asOf ? { as_of: asOf } : {}),
    }),
  });
}

export async function fetchPortfolioSummary(): Promise<PortfolioSummaryResponse> {
  return apiFetch<PortfolioSummaryResponse>("/api/internal/portfolio-review/portfolio-summary");
}

export async function fetchStrategyBreakup(riskFreeRate?: number): Promise<StrategyBreakupRow[]> {
  return apiFetch<StrategyBreakupRow[]>("/api/internal/portfolio-review/strategy-breakup", {
    method: "POST",
    body: JSON.stringify({ risk_free_rate: riskFreeRate ?? 0.065 }),
  });
}

// Always POST — empty body for default load, { override } when targets are set
export async function fetchAccountValueBreakup(override?: AccountValueOverride): Promise<AccountValueBreakupResponse> {
  return apiFetch<AccountValueBreakupResponse>("/api/internal/portfolio-review/account-value-breakup", {
    method: "POST",
    body: JSON.stringify(
      override && Object.keys(override).length > 0 ? { override } : {}
    ),
  });
}

export async function fetchSubStrategyPerformance(): Promise<SubStrategyEntry[]> {
  return apiFetch<SubStrategyEntry[]>("/api/internal/portfolio-review/sub-strategy-performance");
}

export async function fetchStrategyMonthlyReturns(): Promise<StrategyMonthlyEntry[]> {
  return apiFetch<StrategyMonthlyEntry[]>("/api/internal/portfolio-review/strategy-monthly-returns");
}

export { ApiError };