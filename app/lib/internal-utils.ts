import { prisma } from "@/lib/prisma";
import YahooFinance from "yahoo-finance2";

// Types

export interface NavPoint {
  date: Date;
  nav: number;
  prev_nav: number | null;
  drawdown: number; // stored as % (e.g. -4.19)
  pnl: number; // daily ₹
  portfolio_value: number;
}

export interface MonthlyReturn {
  year: number;
  month: string;
  return_pct: number;
  pnl_inr: number;
}

export interface QuarterlyReturn {
  year: number;
  quarter: string;
  return_pct: number;
  pnl_inr: number;
}

export interface YearlyReturn {
  year: number;
  return_pct: number;
  pnl_inr: number;
}

export interface Ratios {
  sharpe: number | null;
  sortino: number | null;
  calmar: number | null;
  ann_volatility: number | null;
  monthly_volatility: number | null;
  best_month: number | null;
  worst_month: number | null;
  avg_monthly_return: number | null;
  win_rate: number | null;
  downside_deviation: number | null;
}

export interface TagMetrics {
  start_date: string;
  end_date: string;
  since_inception: number | null;
  since_inception_pnl: number;
  max_drawdown: number | null;
  current_drawdown: number | null;
  ratios: Ratios;
  monthly: MonthlyReturn[];
  quarterly: QuarterlyReturn[];
  yearly: YearlyReturn[];
  series: { date: string; nav: number; drawdown: number }[];
}

export interface BenchmarkResult {
  since_inception: number | null;
  max_drawdown: number | null;
  current_drawdown: number | null;
  series: { date: string; nav: number; drawdown: number }[];
}

// DB

// Fetch summary (non-numbered) tags filtered by strategy or combined view
export async function fetchTagData(
  qcode: string,
  strategy: string, // strategy name e.g. "QYE++" or "combined"
  allPrefixes: string[], // all known strategy prefixes for this client
  asOf?: Date, // optional cutoff — omit for latest available
): Promise<Record<string, NavPoint[]>> {
  let rows: any[];

  if (strategy === "combined") {
    if (allPrefixes.length === 0) {
      const dateClause = asOf ? " AND date <= $2" : "";
      const params: any[] = asOf ? [qcode, asOf] : [qcode];
      rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT system_tag, date, nav, prev_nav, drawdown, pnl, portfolio_value
         FROM bifurcated_master_sheet_test
         WHERE qcode = $1 AND nav IS NOT NULL${dateClause}
         ORDER BY system_tag, date ASC`,
        ...params,
      );
    } else {
      const excludes = allPrefixes
        .map((_, i) => `system_tag NOT LIKE $${i + 2}`)
        .join(" AND ");
      const dateIdx = allPrefixes.length + 2;
      const dateClause = asOf ? ` AND date <= $${dateIdx}` : "";
      const params: any[] = [qcode, ...allPrefixes.map((p) => `${p} %`)];
      if (asOf) params.push(asOf);
      rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT system_tag, date, nav, prev_nav, drawdown, pnl, portfolio_value
         FROM bifurcated_master_sheet_test
         WHERE qcode = $1 AND nav IS NOT NULL AND ${excludes}${dateClause}
         ORDER BY system_tag, date ASC`,
        ...params,
      );
    }
  } else {
    const dateClause = asOf ? " AND date <= $3" : "";
    const params: any[] = asOf
      ? [qcode, `${strategy} %`, asOf]
      : [qcode, `${strategy} %`];
    rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT system_tag, date, nav, prev_nav, drawdown, pnl, portfolio_value
       FROM bifurcated_master_sheet_test
       WHERE qcode = $1 AND nav IS NOT NULL
         AND system_tag LIKE $2${dateClause}
       ORDER BY system_tag, date ASC`,
      ...params,
    );
  }

  return groupRows(rows);
}

function groupRows(rows: any[]): Record<string, NavPoint[]> {
  const grouped: Record<string, NavPoint[]> = {};
  for (const row of rows) {
    const tag = row.system_tag as string;
    if (!grouped[tag]) grouped[tag] = [];
    grouped[tag].push({
      date: row.date instanceof Date ? row.date : new Date(row.date),
      nav: Number(row.nav) || 0,
      prev_nav: row.prev_nav != null ? Number(row.prev_nav) : null,
      drawdown: Number(row.drawdown) || 0,
      pnl: Number(row.pnl) || 0,
      portfolio_value: Number(row.portfolio_value) || 0,
    });
  }
  return grouped;
}

export interface PnlSnapshotEntry {
  pnl_inr: number;
  pnl_pct: number;
}

// single-day PnL (₹ and %) for a set of tags — one batched query, not one per tag
export async function fetchPnlSnapshot(
  qcode: string,
  tags: string[],
  date: Date,
): Promise<Record<string, PnlSnapshotEntry>> {
  if (tags.length === 0) return {};
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT system_tag, pnl, daily_p_l FROM bifurcated_master_sheet_test
     WHERE qcode = $1 AND date = $2 AND system_tag = ANY($3::text[])`,
    qcode,
    date,
    tags,
  );
  const out: Record<string, PnlSnapshotEntry> = {};
  for (const row of rows) {
    out[row.system_tag as string] = {
      pnl_inr: Number(row.pnl) || 0,
      pnl_pct: (Number(row.daily_p_l) || 0) / 100, // stored as %, response uses fraction like everything else
    };
  }
  return out;
}

// Math helpers

const MS = 1000 * 60 * 60 * 24;

export function round(v: number | null | undefined, d: number): number | null {
  if (v == null || !isFinite(v) || isNaN(v)) return null;
  return parseFloat(v.toFixed(d));
}

function mean(a: number[]): number {
  return a.length > 0 ? a.reduce((s, x) => s + x, 0) / a.length : 0;
}

function std(a: number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}

// Core metrics

export function calcSinceInception(nav: NavPoint[]): number | null {
  if (nav.length < 2) return null;
  const days =
    (nav[nav.length - 1].date.getTime() - nav[0].date.getTime()) / MS;
  // true inception has no prior day; windowed start uses nav[0].prev_nav as base
  const baseNav =
    nav[0].prev_nav != null && nav[0].prev_nav > 0 ? nav[0].prev_nav : 100;
  const startNav = nav[0].nav;
  const endNav = nav[nav.length - 1].nav;
  if (endNav <= 0 || startNav <= 0 || days <= 0) return null;
  // <365 days: simple return from baseNav; >=365: CAGR using actual first NAV
  return round(
    days < 365 ? endNav / baseNav - 1 : (endNav / startNav) ** (365 / days) - 1,
    4,
  );
}

export function calcMaxDrawdown(nav: NavPoint[]): number | null {
  if (nav.length === 0) return null;
  return round(Math.min(...nav.map((p) => p.drawdown)) / 100, 4);
}

export function calcCurrentDrawdown(nav: NavPoint[]): number | null {
  if (nav.length === 0) return null;
  return round(nav[nav.length - 1].drawdown / 100, 4);
}

export function calcSiPnl(nav: NavPoint[]): number {
  return parseFloat(nav.reduce((s, p) => s + p.pnl, 0).toFixed(2));
}

// ── Returns ─────────────────────────────────────────────────────────────────

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const QUARTERS: Record<string, number[]> = {
  Q1: [0, 1, 2],
  Q2: [3, 4, 5],
  Q3: [6, 7, 8],
  Q4: [9, 10, 11],
};

export function calcMonthlyReturns(nav: NavPoint[]): MonthlyReturn[] {
  if (nav.length === 0) return [];

  const buckets = new Map<string, NavPoint[]>();
  for (const p of nav) {
    const key = `${p.date.getFullYear()}-${String(p.date.getMonth()).padStart(2, "0")}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(p);
  }

  const keys = [...buckets.keys()].sort();
  const result: MonthlyReturn[] = [];
  let prevEnd: number | null = null;

  for (let i = 0; i < keys.length; i++) {
    const pts = buckets.get(keys[i])!;
    const [yr, mo] = keys[i].split("-");
    const startNav =
      i === 0
        ? nav[0].prev_nav != null && nav[0].prev_nav > 0
          ? nav[0].prev_nav
          : 100
        : prevEnd!;
    const endNav = pts[pts.length - 1].nav;

    result.push({
      year: parseInt(yr),
      month: MONTHS[parseInt(mo)],
      return_pct: parseFloat(
        (startNav > 0 ? (endNav / startNav - 1) * 100 : 0).toFixed(2),
      ),
      pnl_inr: parseFloat(pts.reduce((s, p) => s + p.pnl, 0).toFixed(2)),
    });
    prevEnd = endNav;
  }
  return result;
}

export function calcQuarterlyReturns(
  monthly: MonthlyReturn[],
): QuarterlyReturn[] {
  const buckets = new Map<string, { c: number; pnl: number }>();
  for (const m of monthly) {
    const mi = MONTHS.indexOf(m.month);
    const q = Object.entries(QUARTERS).find(([, v]) => v.includes(mi))?.[0];
    if (!q) continue;
    const key = `${m.year}-${q}`;
    if (!buckets.has(key)) buckets.set(key, { c: 1, pnl: 0 });
    const e = buckets.get(key)!;
    e.c *= 1 + m.return_pct / 100;
    e.pnl += m.pnl_inr;
  }
  return [...buckets.entries()]
    .map(([k, d]) => {
      const [yr, q] = k.split("-");
      return {
        year: parseInt(yr),
        quarter: q,
        return_pct: parseFloat(((d.c - 1) * 100).toFixed(2)),
        pnl_inr: parseFloat(d.pnl.toFixed(2)),
      };
    })
    .sort((a, b) =>
      a.year !== b.year ? a.year - b.year : a.quarter.localeCompare(b.quarter),
    );
}

export function calcYearlyReturns(monthly: MonthlyReturn[]): YearlyReturn[] {
  const buckets = new Map<number, { c: number; pnl: number }>();
  for (const m of monthly) {
    if (!buckets.has(m.year)) buckets.set(m.year, { c: 1, pnl: 0 });
    const e = buckets.get(m.year)!;
    e.c *= 1 + m.return_pct / 100;
    e.pnl += m.pnl_inr;
  }
  return [...buckets.entries()]
    .map(([yr, d]) => ({
      year: yr,
      return_pct: parseFloat(((d.c - 1) * 100).toFixed(2)),
      pnl_inr: parseFloat(d.pnl.toFixed(2)),
    }))
    .sort((a, b) => a.year - b.year);
}

// ── Ratios ─────────────────────────────────────────────────────────────────

const EMPTY_RATIOS: Ratios = {
  sharpe: null,
  sortino: null,
  calmar: null,
  ann_volatility: null,
  monthly_volatility: null,
  best_month: null,
  worst_month: null,
  avg_monthly_return: null,
  win_rate: null,
  downside_deviation: null,
};

export function calcRatios(
  nav: NavPoint[],
  monthly: MonthlyReturn[],
  rfr: number,
): Ratios {
  if (nav.length < 10) return EMPTY_RATIOS;

  const daily: number[] = [];
  for (let i = 1; i < nav.length; i++) {
    if (nav[i - 1].nav > 0) daily.push(nav[i].nav / nav[i - 1].nav - 1);
  }
  if (daily.length < 10) return EMPTY_RATIOS;

  const rfDaily = (1 + rfr) ** (1 / 252) - 1;
  const s = std(daily);
  const annVol = s > 0 ? s * Math.sqrt(252) : null;
  const sharpe =
    s > 0
      ? round((mean(daily.map((r) => r - rfDaily)) / s) * Math.sqrt(252), 3)
      : null;

  const si = calcSinceInception(nav);
  const maxDD = calcMaxDrawdown(nav);
  const calmar =
    si != null && maxDD != null && maxDD !== 0
      ? round(si / Math.abs(maxDD), 3)
      : null;

  const down = daily.filter((r) => r < rfDaily);
  let sortino: number | null = null;
  let downsideDev: number | null = null;
  if (down.length > 1 && si != null) {
    downsideDev = std(down) * Math.sqrt(252);
    if (downsideDev > 0) sortino = round((si - rfr) / downsideDev, 3);
  }

  const pcts = monthly.map((m) => m.return_pct / 100);
  return {
    sharpe,
    sortino,
    calmar,
    ann_volatility: round(annVol, 4),
    monthly_volatility:
      pcts.length > 1 ? round(std(pcts) * Math.sqrt(12), 4) : null,
    best_month: pcts.length > 0 ? round(Math.max(...pcts), 4) : null,
    worst_month: pcts.length > 0 ? round(Math.min(...pcts), 4) : null,
    avg_monthly_return: pcts.length > 0 ? round(mean(pcts), 4) : null,
    win_rate:
      pcts.length > 0
        ? round(pcts.filter((r) => r > 0).length / pcts.length, 4)
        : null,
    downside_deviation: downsideDev != null ? round(downsideDev, 4) : null,
  };
}

// ── Build full tag metrics object ───────────────────────────────────────────

export function buildTagMetrics(nav: NavPoint[], rfr: number): TagMetrics {
  const monthly = calcMonthlyReturns(nav);
  const quarterly = calcQuarterlyReturns(monthly);
  const yearly = calcYearlyReturns(monthly);
  return {
    start_date: nav[0].date.toISOString().split("T")[0],
    end_date: nav[nav.length - 1].date.toISOString().split("T")[0],
    since_inception: calcSinceInception(nav),
    since_inception_pnl: calcSiPnl(nav),
    max_drawdown: calcMaxDrawdown(nav),
    current_drawdown: calcCurrentDrawdown(nav),
    ratios: calcRatios(nav, monthly, rfr),
    monthly,
    quarterly,
    yearly,
    series: nav.map((p) => ({
      date: p.date.toISOString().split("T")[0],
      nav: p.nav,
      drawdown: parseFloat((p.drawdown / 100).toFixed(4)),
    })),
  };
}

// ── Nifty 50 Benchmark ──────────────────────────────────────────────────────

const NIFTY_URL =
  "https://qode360-backend.qodeinvest.com/api/v1/returns/indices/?downloadNav=true";

// raw price fetch only, shared across clients instead of one call each
async function fetchNiftyRawSeries(
  startDate: Date,
  endDate: Date,
): Promise<{ date: string; nav: number }[] | null> {
  const buf = new Date(startDate);
  buf.setDate(buf.getDate() - 10);
  const endStr = endDate.toISOString().split("T")[0];

  const res = await fetch(NIFTY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      startDate: buf.toISOString().split("T")[0],
      endDate: endStr,
      indices: ["NIFTY 50"],
    }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const raw: { date: string; nav: number }[] = json?.data?.data?.["NIFTY 50"];
  return Array.isArray(raw) && raw.length > 0 ? raw : null;
}

// pure — slices metrics for one window from an already-fetched raw series
function computeBenchmarkMetrics(
  raw: { date: string; nav: number }[],
  startDate: Date,
  endDate: Date,
): BenchmarkResult | null {
  const startStr = startDate.toISOString().split("T")[0];
  const endStr = endDate.toISOString().split("T")[0];

  // Compare date strings directly — no timezone ambiguity
  const earlier = raw.filter((p) => p.date < startStr);
  if (earlier.length === 0) return null;
  const ref = earlier[earlier.length - 1];
  const refPrice = ref.nav;

  const clipped = raw.filter((p) => p.date >= ref.date && p.date <= endStr);
  if (clipped.length === 0) return null;

  const last = clipped[clipped.length - 1];
  const days =
    (new Date(last.date).getTime() - new Date(ref.date).getTime()) / MS;
  const si =
    days < 365
      ? last.nav / refPrice - 1
      : (last.nav / refPrice) ** (365 / days) - 1;

  let peak = refPrice,
    maxDD = 0;
  const series = clipped.map((p) => {
    if (p.nav > peak) peak = p.nav;
    const dd = peak > 0 ? (p.nav - peak) / peak : 0;
    if (dd < maxDD) maxDD = dd;
    return {
      date: p.date,
      nav: parseFloat(((p.nav / refPrice) * 100).toFixed(4)),
      drawdown: round(dd, 4)!,
    };
  });

  return {
    since_inception: round(si, 4),
    max_drawdown: round(maxDD, 4),
    current_drawdown: series[series.length - 1].drawdown,
    series,
  };
}

export async function fetchBenchmark(
  startDate: Date,
  endDate: Date,
): Promise<BenchmarkResult | null> {
  try {
    const raw = await fetchNiftyRawSeries(startDate, endDate);
    if (!raw) return null;
    return computeBenchmarkMetrics(raw, startDate, endDate);
  } catch {
    return null;
  }
}

// ── Portfolio Summary ────────────────────────────────────────────────────────

export interface AumPoint {
  date: string;
  aum: number;
}

// group by qcode for investor-level rollups, by strategy for strategy-level ones
export interface InvestorAum {
  qcode: string;
  account_name: string;
  strategy: string;
  since: string;
  aum: number;
  until: string | null;
}

export interface PortfolioSummaryResult {
  total_investors: number;
  total_aum: number;
  mom: {
    prev_aum: number;
    prev_date: string;
    change_pct: number | null;
  } | null;
  investors: InvestorAum[];
  aum_daily: AumPoint[];
  strategy_aum_daily: Record<string, AumPoint[]>;
}

interface StrategyPair {
  qcode: string;
  account_name: string;
  strategy: string;
  tag: string;
  // split overrides — null means "use strategy_defaults for this field"
  equity_pct: number | null;
  debt_pct: number | null;
  lc_pct: number | null;
  cash_pct: number | null;
  gold_pct: number | null;
  lowvol_pct: number | null;
  momentum_pct: number | null;
  psar_leverage: number | null;
  psar_multiplier: number | null;
  long_opt_pct: number | null;
  gold_model_pct: number | null;
  momentum_model_pct: number | null;
  lowvol_model_pct: number | null;
  cash_pct_healthy: number | null;
  liquidcase_pct_gate: number | null;
  effective_to: string | null;
}

interface SeriesPoint {
  date: string;
  value: number;
}

function toNum(v: unknown): number | null {
  return v != null ? Number(v) : null;
}

// one row per (qcode, strategy), latest revision wins; suffixField picks exposure vs profit
async function fetchStrategyPairs(
  suffixField: "exposure_tag_suffix" | "profit_tag_suffix",
): Promise<StrategyPair[]> {
  const configs = await prisma.client_strategy_configs.findMany({
    orderBy: [{ qcode: "asc" }, { strategy: "asc" }, { effective_from: "asc" }],
  });
  const map = new Map<string, StrategyPair>();
  for (const c of configs) {
    map.set(`${c.qcode}|${c.strategy}`, {
      qcode: c.qcode,
      account_name: c.account_name,
      strategy: c.strategy,
      tag: `${c.strategy} ${c[suffixField]}`,
      equity_pct: toNum(c.equity_pct),
      debt_pct: toNum(c.debt_pct),
      lc_pct: toNum(c.lc_pct),
      cash_pct: toNum(c.cash_pct),
      gold_pct: toNum(c.gold_pct),
      lowvol_pct: toNum(c.lowvol_pct),
      momentum_pct: toNum(c.momentum_pct),
      psar_leverage: toNum(c.psar_leverage),
      psar_multiplier: toNum(c.psar_multiplier),
      long_opt_pct: toNum(c.long_opt_pct),
      gold_model_pct: toNum(c.gold_model_pct),
      momentum_model_pct: toNum(c.momentum_model_pct),
      lowvol_model_pct: toNum(c.lowvol_model_pct),
      cash_pct_healthy: toNum(c.cash_pct_healthy),
      liquidcase_pct_gate: toNum(c.liquidcase_pct_gate),
      effective_to: c.effective_to
        ? c.effective_to.toISOString().split("T")[0]
        : null,
    });
  }
  return [...map.values()];
}

// carries values forward per series until each one's `until` date, so lapsed strategies drop to 0
function mergeFfillSum(
  seriesList: { series: SeriesPoint[]; until: string | null }[],
  dates: string[],
): AumPoint[] {
  const idx = new Array(seriesList.length).fill(0);
  const last = new Array(seriesList.length).fill(0);
  const out: AumPoint[] = [];

  for (const d of dates) {
    let sum = 0;
    for (let i = 0; i < seriesList.length; i++) {
      const { series, until } = seriesList[i];
      while (idx[i] < series.length && series[idx[i]].date <= d) {
        last[i] = series[idx[i]].value;
        idx[i]++;
      }
      if (!until || d <= until) sum += last[i];
    }
    out.push({ date: d, aum: sum });
  }
  return out;
}

// drop the trailing zero run once a strategy has no active clients left
function trimTrailingZeros(series: AumPoint[]): AumPoint[] {
  let end = series.length;
  while (end > 0 && series[end - 1].aum === 0) end--;
  return series.slice(0, end);
}

// drop the leading zero run before a strategy's first real client
function trimLeadingZeros(series: AumPoint[]): AumPoint[] {
  let start = 0;
  while (start < series.length && series[start].aum === 0) start++;
  return series.slice(start);
}

function computeMom(
  aumDaily: AumPoint[],
): { prev_aum: number; prev_date: string; change_pct: number | null } | null {
  if (aumDaily.length === 0) return null;
  const latest = aumDaily[aumDaily.length - 1];
  const target = new Date(latest.date);
  target.setUTCMonth(target.getUTCMonth() - 1);
  const targetStr = target.toISOString().split("T")[0];

  let prev: AumPoint | null = null;
  for (const p of aumDaily) {
    if (p.date <= targetStr) prev = p;
    else break;
  }
  if (!prev) return null;

  return {
    prev_aum: prev.aum,
    prev_date: prev.date,
    change_pct:
      prev.aum > 0 ? round((latest.aum - prev.aum) / prev.aum, 4) : null,
  };
}

// shared "is this strategy still active" check — same rule everywhere it's used
function isActive(until: string | null, today: string): boolean {
  return !until || until >= today;
}

export async function computePortfolioSummary(): Promise<PortfolioSummaryResult> {
  const pairs = await fetchStrategyPairs("exposure_tag_suffix");
  if (pairs.length === 0) {
    return {
      total_investors: 0,
      total_aum: 0,
      mom: null,
      investors: [],
      aum_daily: [],
      strategy_aum_daily: {},
    };
  }

  // single batched query — paired via unnest, no N+1
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT b.qcode, b.system_tag, b.date, b.portfolio_value
     FROM bifurcated_master_sheet_test b
     JOIN unnest($1::text[], $2::text[]) AS v(qcode, tag)
       ON b.qcode = v.qcode AND b.system_tag = v.tag
     WHERE b.portfolio_value IS NOT NULL AND b.portfolio_value > 0
     ORDER BY b.qcode, b.system_tag, b.date ASC`,
    pairs.map((p) => p.qcode),
    pairs.map((p) => p.tag),
  );

  const seriesMap = new Map<string, SeriesPoint[]>();
  for (const row of rows) {
    const key = `${row.qcode}|${row.system_tag}`;
    const d = row.date instanceof Date ? row.date : new Date(row.date);
    if (!seriesMap.has(key)) seriesMap.set(key, []);
    seriesMap.get(key)!.push({
      date: d.toISOString().split("T")[0],
      value: Number(row.portfolio_value) || 0,
    });
  }

  const investors: InvestorAum[] = [];
  const allSeries: { series: SeriesPoint[]; until: string | null }[] = [];
  const strategySeries = new Map<
    string,
    { series: SeriesPoint[]; until: string | null }[]
  >();
  const today = new Date().toISOString().split("T")[0];

  for (const pair of pairs) {
    const series = seriesMap.get(`${pair.qcode}|${pair.tag}`);
    if (!series || series.length === 0) continue; // no data — nothing to report

    investors.push({
      qcode: pair.qcode,
      account_name: pair.account_name,
      strategy: pair.strategy,
      since: series[0].date,
      aum: series[series.length - 1].value,
      until: pair.effective_to,
    });

    const entry = { series, until: pair.effective_to };
    allSeries.push(entry);
    if (!strategySeries.has(pair.strategy))
      strategySeries.set(pair.strategy, []);
    strategySeries.get(pair.strategy)!.push(entry);
  }

  // shared axis so a lapsed strategy resolves to 0, not a frozen stale value
  const dateSet = new Set<string>();
  for (const { series } of allSeries)
    for (const p of series) dateSet.add(p.date);
  const dates = [...dateSet].sort();

  const activeInvestors = investors.filter((inv) => isActive(inv.until, today));
  const activeClients = new Set(activeInvestors.map((inv) => inv.qcode)); // dedupe multi-strategy clients
  const activeStrategies = new Set(activeInvestors.map((inv) => inv.strategy));

  // per-series cutoff is now baked in, so this is accurate for any date — mom included
  const aum_daily = mergeFfillSum(allSeries, dates);
  const strategy_aum_daily: Record<string, AumPoint[]> = {};
  for (const [strategy, list] of strategySeries) {
    const series = trimLeadingZeros(mergeFfillSum(list, dates)); // no padding before its own inception
    // fully-lapsed strategies don't need the trailing zero repeat out to today
    strategy_aum_daily[strategy] = activeStrategies.has(strategy)
      ? series
      : trimTrailingZeros(series);
  }

  return {
    total_investors: activeClients.size,
    total_aum: activeInvestors.reduce((s, inv) => s + inv.aum, 0),
    mom: computeMom(aum_daily),
    investors,
    aum_daily,
    strategy_aum_daily,
  };
}

// resolves payload override -> global_config, shared by every route needing rfr
export async function resolveRiskFreeRate(
  payloadValue?: number | null,
): Promise<number | null> {
  if (payloadValue != null) return payloadValue;
  const cfg = await prisma.global_config.findUnique({
    where: { key: "RISK_FREE_RATE" },
  });
  return cfg ? parseFloat(cfg.value) : null;
}

// ── Strategy-wise Client Breakup ─────────────────────────────────────────────

export interface StrategyBreakupRow {
  qcode: string;
  account_name: string;
  strategy: string;
  inception_date: string;
  since_inception: number | null;
  benchmark_return: number | null;
  max_drawdown: number | null;
  current_drawdown: number | null;
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

// top-level query window — distinct from each row's own effective_to
export interface StrategyBreakupResult {
  start_date: string | null;
  end_date: string;
  clients: StrategyBreakupRow[];
}

// batched nav/prev_nav/drawdown/pnl fetch for any (qcode, tag) list, one round trip
async function fetchBulkNavSeries(
  pairs: { qcode: string; tag: string }[],
  end?: Date, // optional upper bound — omit for latest available
  start?: Date, // optional lower bound — omit for full history
): Promise<Map<string, NavPoint[]>> {
  const params: any[] = [pairs.map((p) => p.qcode), pairs.map((p) => p.tag)];
  let dateClause = "";
  if (start) {
    params.push(start);
    dateClause += ` AND b.date >= $${params.length}`;
  }
  if (end) {
    params.push(end);
    dateClause += ` AND b.date <= $${params.length}`;
  }

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT b.qcode, b.system_tag, b.date, b.nav, b.prev_nav, b.drawdown, b.pnl
     FROM bifurcated_master_sheet_test b
     JOIN unnest($1::text[], $2::text[]) AS v(qcode, tag)
       ON b.qcode = v.qcode AND b.system_tag = v.tag
     WHERE b.nav IS NOT NULL${dateClause}
     ORDER BY b.qcode, b.system_tag, b.date ASC`,
    ...params,
  );

  const seriesMap = new Map<string, NavPoint[]>();
  for (const row of rows) {
    const key = `${row.qcode}|${row.system_tag}`;
    if (!seriesMap.has(key)) seriesMap.set(key, []);
    seriesMap.get(key)!.push({
      date: row.date instanceof Date ? row.date : new Date(row.date),
      nav: Number(row.nav) || 0,
      prev_nav: row.prev_nav != null ? Number(row.prev_nav) : null,
      drawdown: Number(row.drawdown) || 0,
      pnl: Number(row.pnl) || 0,
      portfolio_value: 0, // unused for these tabs' metrics
    });
  }
  return seriesMap;
}

// parses optional "YYYY-MM-DD" — undefined if omitted, null if invalid
export function parseOptionalDate(input?: string): Date | null | undefined {
  if (!input) return undefined;
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

// keyed by "YYYY-MM" so portfolio/benchmark align by calendar month, not position
function toMonthlyReturnMap(
  series: { date: string; nav: number }[],
): Map<string, number> {
  const monthEnd = new Map<string, number>();
  for (const p of series) monthEnd.set(p.date.slice(0, 7), p.nav); // rows are ascending, last write wins
  const keys = [...monthEnd.keys()].sort();

  const out = new Map<string, number>();
  for (let i = 1; i < keys.length; i++) {
    const prev = monthEnd.get(keys[i - 1])!;
    const cur = monthEnd.get(keys[i])!;
    if (prev > 0) out.set(keys[i], (cur / prev - 1) * 100);
  }
  return out;
}

// intersect portfolio + benchmark monthly returns on shared calendar-month keys
function alignMonthlyReturns(
  portfolioMonthly: MonthlyReturn[],
  benchmarkMonthly: Map<string, number>,
): { port: number[]; bm: number[] } {
  const port: number[] = [];
  const bm: number[] = [];
  for (const m of portfolioMonthly) {
    const key = `${m.year}-${String(MONTHS.indexOf(m.month) + 1).padStart(2, "0")}`;
    const bmVal = benchmarkMonthly.get(key);
    if (bmVal !== undefined) {
      port.push(m.return_pct);
      bm.push(bmVal);
    }
  }
  return { port, bm };
}

// sample covariance (n-1), matching the existing std() convention in this file
function covariance(a: number[], b: number[]): number {
  if (a.length < 2) return 0;
  const ma = mean(a);
  const mb = mean(b);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / (a.length - 1);
}

export interface CaptureRatios {
  upside_capture: number | null;
  downside_capture: number | null;
}

// monthly upside/downside capture vs benchmark — port/bm must already be aligned
export function calcCaptureRatios(port: number[], bm: number[]): CaptureRatios {
  const empty: CaptureRatios = { upside_capture: null, downside_capture: null };
  if (port.length < 3 || bm.length !== port.length) return empty;

  const up: number[] = [];
  const upBm: number[] = [];
  const down: number[] = [];
  const downBm: number[] = [];
  for (let i = 0; i < bm.length; i++) {
    if (bm[i] > 0) {
      up.push(port[i]);
      upBm.push(bm[i]);
    } else if (bm[i] < 0) {
      down.push(port[i]);
      downBm.push(bm[i]);
    }
  }
  if (upBm.length < 1 || downBm.length < 1) return empty;

  const bmUpAvg = mean(upBm);
  const bmDownAvg = mean(downBm);
  return {
    upside_capture:
      Math.abs(bmUpAvg) > 1e-8 ? round(mean(up) / bmUpAvg, 4) : null,
    downside_capture:
      Math.abs(bmDownAvg) > 1e-8 ? round(mean(down) / bmDownAvg, 4) : null,
  };
}

export interface ExtraRatios {
  tracking_error: number | null;
  information_ratio: number | null;
  alpha: number | null;
  beta: number | null;
}

// benchmark-relative ratios, monthly basis — Capture Ratios has no daily equivalent
export function calcExtraRatios(port: number[], bm: number[]): ExtraRatios {
  const empty: ExtraRatios = {
    tracking_error: null,
    information_ratio: null,
    alpha: null,
    beta: null,
  };
  if (port.length < 6 || bm.length !== port.length) return empty;

  const p = port.map((v) => v / 100);
  const b = bm.map((v) => v / 100);
  const diff = p.map((v, i) => v - b[i]);
  const te = std(diff) * Math.sqrt(12);

  let tracking_error: number | null = null;
  let information_ratio: number | null = null;
  if (te > 0) {
    tracking_error = round(te, 4);
    information_ratio = round(((mean(p) - mean(b)) * Math.sqrt(12)) / te, 3);
  }

  let alpha: number | null = null;
  let beta: number | null = null;
  const bmVar = std(b) ** 2;
  if (bmVar > 0) {
    const betaVal = covariance(p, b) / bmVar;
    beta = round(betaVal, 3);
    alpha = round((mean(p) - betaVal * mean(b)) * 12, 4);
  }

  return { tracking_error, information_ratio, alpha, beta };
}

export async function computeStrategyBreakup(
  rfr: number,
  end?: Date,
  start?: Date,
): Promise<StrategyBreakupResult> {
  const allPairs = await fetchStrategyPairs("profit_tag_suffix");
  const endDate = end
    ? end.toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];
  const startDate = start ? start.toISOString().split("T")[0] : null;
  const pairs = allPairs.filter((p) => isActive(p.effective_to, endDate));
  if (pairs.length === 0)
    return { start_date: startDate, end_date: endDate, clients: [] };

  const seriesMap = await fetchBulkNavSeries(
    pairs.map((p) => ({ qcode: p.qcode, tag: p.tag })),
    end,
    start,
  );

  // one shared date span covers every client — Nifty gets fetched exactly once
  let minStart: Date | null = null;
  let maxEnd: Date | null = null;
  for (const series of seriesMap.values()) {
    if (series.length === 0) continue;
    const s = series[0].date;
    const e = series[series.length - 1].date;
    if (!minStart || s < minStart) minStart = s;
    if (!maxEnd || e > maxEnd) maxEnd = e;
  }
  let niftyRaw: { date: string; nav: number }[] | null = null;
  if (minStart && maxEnd) {
    try {
      niftyRaw = await fetchNiftyRawSeries(minStart, maxEnd);
    } catch {
      niftyRaw = null; // benchmark-relative columns fall back to null, rest of the row still returns
    }
  }

  const rows: StrategyBreakupRow[] = [];
  for (const pair of pairs) {
    const nav = seriesMap.get(`${pair.qcode}|${pair.tag}`);
    if (!nav || nav.length === 0) continue; // no data — nothing to report

    const monthly = calcMonthlyReturns(nav);
    const clientStart = nav[0].date;
    const clientEnd = nav[nav.length - 1].date;

    // slice the shared raw series for this client's own window — no extra fetch
    const bmMetrics = niftyRaw
      ? computeBenchmarkMetrics(niftyRaw, clientStart, clientEnd)
      : null;

    let upside_capture: number | null = null;
    let downside_capture: number | null = null;
    let tracking_error: number | null = null;
    let information_ratio: number | null = null;
    let alpha: number | null = null;
    let beta: number | null = null;

    if (bmMetrics) {
      const bmMonthly = toMonthlyReturnMap(bmMetrics.series);
      const { port, bm } = alignMonthlyReturns(monthly, bmMonthly);
      const cap = calcCaptureRatios(port, bm);
      upside_capture = cap.upside_capture;
      downside_capture = cap.downside_capture;
      const extra = calcExtraRatios(port, bm);
      tracking_error = extra.tracking_error;
      information_ratio = extra.information_ratio;
      alpha = extra.alpha;
      beta = extra.beta;
    }

    // Sharpe/Sortino/Calmar/Vol reuse calcRatios, consistent with Client Dashboards
    const ratios = calcRatios(nav, monthly, rfr);

    rows.push({
      qcode: pair.qcode,
      account_name: pair.account_name,
      strategy: pair.strategy,
      inception_date: clientStart.toISOString().split("T")[0],
      since_inception: calcSinceInception(nav),
      benchmark_return: bmMetrics?.since_inception ?? null,
      max_drawdown: calcMaxDrawdown(nav),
      current_drawdown: calcCurrentDrawdown(nav),
      upside_capture,
      downside_capture,
      sharpe: ratios.sharpe,
      sortino: ratios.sortino,
      calmar: ratios.calmar,
      ann_volatility: ratios.ann_volatility,
      tracking_error,
      information_ratio,
      alpha,
      beta,
      end_date: pair.effective_to,
    });
  }

  return { start_date: startDate, end_date: endDate, clients: rows };
}

// ── Account Value Breakup ────────────────────────────────────────────────────

// fixed tag suffixes — bifurcation output, not a per-client config
const COMPONENT_TAGS = [
  "Mutual Funds",
  "Equity Stock Holdings",
  "Bond Stock Holdings",
  "Liquidcase Stock Holdings",
  "Gold Stock Holdings",
  "Low Vol Stock Holdings",
  "Momentum Stock Holdings",
] as const;

export interface AccountRow {
  qcode: string;
  account_name: string;
  strategy: string;
  total_av: number;
  equity_book: number;
  debt_book: number;
  equity_pct: number | null;
  debt_pct: number | null;
  diff_equity: number | null;
  diff_debt: number | null;
  liquid_case: number;
  cash: number;
  lc_pct: number | null;
  cash_pct: number | null;
  diff_lc: number | null;
  diff_cash: number | null;
}

export interface EquityBreakupRow {
  qcode: string;
  account_name: string;
  strategy: string;
  equity_book: number;
  equity_pct: number | null;
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

export interface AccountValueBreakupResult {
  accounts: AccountRow[];
  equity_breakup: EquityBreakupRow[];
}

export interface SplitConfig {
  equity_pct: number | null;
  debt_pct: number | null;
  lc_pct: number | null;
  cash_pct: number | null;
  gold_pct: number | null;
  lowvol_pct: number | null;
  momentum_pct: number | null;
  psar_leverage: number | null;
  psar_multiplier: number | null;
  long_opt_pct: number | null;
  gold_model_pct: number | null;
  momentum_model_pct: number | null;
  lowvol_model_pct: number | null;
  cash_pct_healthy: number | null;
  liquidcase_pct_gate: number | null;
}

// client override (already on the pair) → strategy_defaults, per field
async function resolveSplitConfigs(
  pairs: StrategyPair[],
): Promise<Map<string, SplitConfig>> {
  const defaults = await prisma.strategy_defaults.findMany();
  const defaultMap = new Map(defaults.map((d) => [d.strategy_name, d]));

  const result = new Map<string, SplitConfig>();
  for (const pair of pairs) {
    const def = defaultMap.get(pair.strategy);
    result.set(`${pair.qcode}|${pair.strategy}`, {
      equity_pct: pair.equity_pct ?? toNum(def?.equity_pct),
      debt_pct: pair.debt_pct ?? toNum(def?.debt_pct),
      lc_pct: pair.lc_pct ?? toNum(def?.lc_pct),
      cash_pct: pair.cash_pct ?? toNum(def?.cash_pct),
      gold_pct: pair.gold_pct ?? toNum(def?.gold_pct),
      lowvol_pct: pair.lowvol_pct ?? toNum(def?.lowvol_pct),
      momentum_pct: pair.momentum_pct ?? toNum(def?.momentum_pct),
      psar_leverage: pair.psar_leverage ?? toNum(def?.psar_leverage),
      psar_multiplier: pair.psar_multiplier ?? toNum(def?.psar_multiplier),
      long_opt_pct: pair.long_opt_pct ?? toNum(def?.long_opt_pct),
      gold_model_pct: pair.gold_model_pct ?? toNum(def?.gold_model_pct),
      momentum_model_pct:
        pair.momentum_model_pct ?? toNum(def?.momentum_model_pct),
      lowvol_model_pct: pair.lowvol_model_pct ?? toNum(def?.lowvol_model_pct),
      cash_pct_healthy: pair.cash_pct_healthy ?? toNum(def?.cash_pct_healthy),
      liquidcase_pct_gate:
        pair.liquidcase_pct_gate ?? toNum(def?.liquidcase_pct_gate),
    });
  }
  return result;
}

// DISTINCT ON — snapshot only, no history needed
async function fetchLatestTagValues(
  pairs: StrategyPair[],
): Promise<Map<string, number>> {
  const qcodes: string[] = [];
  const tags: string[] = [];
  for (const p of pairs) {
    qcodes.push(p.qcode);
    tags.push(p.tag);
    for (const comp of COMPONENT_TAGS) {
      qcodes.push(p.qcode);
      tags.push(`${p.strategy} ${comp}`);
    }
  }

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT DISTINCT ON (b.qcode, b.system_tag) b.qcode, b.system_tag, b.portfolio_value
     FROM bifurcated_master_sheet_test b
     JOIN unnest($1::text[], $2::text[]) AS v(qcode, tag)
       ON b.qcode = v.qcode AND b.system_tag = v.tag
     WHERE b.portfolio_value IS NOT NULL
     ORDER BY b.qcode, b.system_tag, b.date DESC`,
    qcodes,
    tags,
  );

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(`${row.qcode}|${row.system_tag}`, Number(row.portfolio_value) || 0);
  }
  return map;
}

export interface SplitOverride extends Partial<SplitConfig> {
  qcode: string;
  strategy: string;
}

export async function computeAccountValueBreakup(
  override?: SplitOverride,
): Promise<AccountValueBreakupResult> {
  const pairs = await fetchStrategyPairs("exposure_tag_suffix");
  if (pairs.length === 0) return { accounts: [], equity_breakup: [] };

  const [valueMap, splitMap] = await Promise.all([
    fetchLatestTagValues(pairs),
    resolveSplitConfigs(pairs),
  ]);

  if (override) {
    const key = `${override.qcode}|${override.strategy}`;
    const base = splitMap.get(key);
    if (!base) {
      throw new Error(
        `No client-strategy pair found for override: ${override.qcode} / ${override.strategy}`,
      );
    }
    splitMap.set(key, {
      equity_pct: override.equity_pct ?? base.equity_pct,
      debt_pct: override.debt_pct ?? base.debt_pct,
      lc_pct: override.lc_pct ?? base.lc_pct,
      cash_pct: override.cash_pct ?? base.cash_pct,
      gold_pct: override.gold_pct ?? base.gold_pct,
      lowvol_pct: override.lowvol_pct ?? base.lowvol_pct,
      momentum_pct: override.momentum_pct ?? base.momentum_pct,
      // added when SplitConfig grew for Withdrawal/Deploy — always pass through
      psar_leverage: base.psar_leverage,
      psar_multiplier: base.psar_multiplier,
      long_opt_pct: base.long_opt_pct,
      gold_model_pct: base.gold_model_pct,
      momentum_model_pct: base.momentum_model_pct,
      lowvol_model_pct: base.lowvol_model_pct,
      cash_pct_healthy: base.cash_pct_healthy,
      liquidcase_pct_gate: base.liquidcase_pct_gate,
    });
  }

  const accounts: AccountRow[] = [];
  const equity_breakup: EquityBreakupRow[] = [];

  for (const pair of pairs) {
    const total = valueMap.get(`${pair.qcode}|${pair.tag}`) ?? 0;
    if (total === 0) continue; // no data for this strategy — nothing to report

    const split = splitMap.get(`${pair.qcode}|${pair.strategy}`)!;

    const mf = valueMap.get(`${pair.qcode}|${pair.strategy} Mutual Funds`) ?? 0;
    const eqStock =
      valueMap.get(`${pair.qcode}|${pair.strategy} Equity Stock Holdings`) ?? 0;
    const bondStock =
      valueMap.get(`${pair.qcode}|${pair.strategy} Bond Stock Holdings`) ?? 0;
    const equity_book = mf + eqStock + bondStock;
    const debt_book = total - equity_book;

    const equity_pct = equity_book / total;
    const debt_pct = debt_book / total;

    const liquid_case =
      valueMap.get(
        `${pair.qcode}|${pair.strategy} Liquidcase Stock Holdings`,
      ) ?? 0;
    const cash = debt_book - liquid_case;
    const lc_pct = liquid_case / total;
    const cash_pct = cash / total;

    accounts.push({
      qcode: pair.qcode,
      account_name: pair.account_name,
      strategy: pair.strategy,
      total_av: total,
      equity_book,
      debt_book,
      equity_pct: round(equity_pct, 4),
      debt_pct: round(debt_pct, 4),
      diff_equity:
        split.equity_pct != null
          ? round(split.equity_pct - equity_pct, 4)
          : null,
      diff_debt:
        split.debt_pct != null ? round(split.debt_pct - debt_pct, 4) : null,
      liquid_case,
      cash,
      lc_pct: round(lc_pct, 4),
      cash_pct: round(cash_pct, 4),
      diff_lc: split.lc_pct != null ? round(split.lc_pct - lc_pct, 4) : null,
      diff_cash:
        split.cash_pct != null ? round(split.cash_pct - cash_pct, 4) : null,
    });

    // gated on resolved config, never a strategy-name check
    if (
      split.gold_pct == null ||
      split.lowvol_pct == null ||
      split.momentum_pct == null
    ) {
      continue;
    }

    const gold =
      valueMap.get(`${pair.qcode}|${pair.strategy} Gold Stock Holdings`) ?? 0;
    const lowvol =
      valueMap.get(`${pair.qcode}|${pair.strategy} Low Vol Stock Holdings`) ??
      0;
    const momentum =
      valueMap.get(`${pair.qcode}|${pair.strategy} Momentum Stock Holdings`) ??
      0;
    const legSum = gold + lowvol + momentum;
    const eqBk = legSum > 0 ? legSum : equity_book; // fall back to Section 1's figure if legs are missing

    const gold_pct = eqBk > 0 ? gold / eqBk : null;
    const lowvol_pct = eqBk > 0 ? lowvol / eqBk : null;
    const momentum_pct = eqBk > 0 ? momentum / eqBk : null;

    equity_breakup.push({
      qcode: pair.qcode,
      account_name: pair.account_name,
      strategy: pair.strategy,
      equity_book: eqBk,
      equity_pct: round(equity_pct, 4),
      gold,
      lowvol,
      momentum,
      gold_pct: gold_pct != null ? round(gold_pct, 4) : null,
      lowvol_pct: lowvol_pct != null ? round(lowvol_pct, 4) : null,
      momentum_pct: momentum_pct != null ? round(momentum_pct, 4) : null,
      diff_gold: gold_pct != null ? round(split.gold_pct - gold_pct, 4) : null,
      diff_lowvol:
        lowvol_pct != null ? round(split.lowvol_pct - lowvol_pct, 4) : null,
      diff_momentum:
        momentum_pct != null
          ? round(split.momentum_pct - momentum_pct, 4)
          : null,
    });
  }

  return { accounts, equity_breakup };
}

// ── Sub-Strategy Performance ─────────────────────────────────────────────────

interface SubStrategySectionDef {
  label: string;
  tag: string; // flat rollup tag suffix — pre-aggregated upstream, confirmed against real data
  existsField:
    | "long_opt_pct"
    | "psar_leverage"
    | "gold_pct"
    | "lowvol_pct"
    | "momentum_pct";
  tier: 1 | 2 | null; // required psar_multiplier value, or null if the section has no tier split
}

// no strategy names anywhere — section membership is entirely config-driven
const SUB_STRATEGY_SECTIONS: SubStrategySectionDef[] = [
  {
    label: "Long Options (1%)",
    tag: "LONG",
    existsField: "long_opt_pct",
    tier: 1,
  },
  {
    label: "Long Options (1.5%)",
    tag: "LONG",
    existsField: "long_opt_pct",
    tier: 2,
  },
  { label: "PSAR 1x", tag: "PSAR", existsField: "psar_leverage", tier: 1 },
  { label: "PSAR 2x", tag: "PSAR", existsField: "psar_leverage", tier: 2 },
  {
    label: "Gold",
    tag: "Gold Stock Holdings",
    existsField: "gold_pct",
    tier: null,
  },
  {
    label: "Momentum",
    tag: "Momentum Stock Holdings",
    existsField: "momentum_pct",
    tier: null,
  },
  {
    label: "Low Vol",
    tag: "Low Vol Stock Holdings",
    existsField: "lowvol_pct",
    tier: null,
  },
  { label: "NLONG (1%)", tag: "NLONG", existsField: "long_opt_pct", tier: 1 },
  { label: "SLONG (1%)", tag: "SLONG", existsField: "long_opt_pct", tier: 1 },
  { label: "NLONG (1.5%)", tag: "NLONG", existsField: "long_opt_pct", tier: 2 },
  { label: "SLONG (1.5%)", tag: "SLONG", existsField: "long_opt_pct", tier: 2 },
  { label: "NPSAR 1x", tag: "NPSAR", existsField: "psar_leverage", tier: 1 },
  { label: "SPSAR 1x", tag: "SPSAR", existsField: "psar_leverage", tier: 1 },
  { label: "NPSAR 2x", tag: "NPSAR", existsField: "psar_leverage", tier: 2 },
  { label: "SPSAR 2x", tag: "SPSAR", existsField: "psar_leverage", tier: 2 },
];

export const SUB_STRATEGY_SECTION_ORDER = SUB_STRATEGY_SECTIONS.map(
  (s) => s.label,
);

export interface SubStrategyRow {
  section: string;
  qcode: string;
  account_name: string;
  strategy: string;
  monthly: MonthlyReturn[];
  yearly: YearlyReturn[];
}

export interface SubStrategyPerformanceResult {
  start_date: string | null;
  end_date: string;
  rows: SubStrategyRow[];
}

export async function computeSubStrategyPerformance(
  end?: Date,
  start?: Date,
): Promise<SubStrategyPerformanceResult> {
  const endDate = end
    ? end.toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];
  const startDate = start ? start.toISOString().split("T")[0] : null;

  const pairs = await fetchStrategyPairs("profit_tag_suffix");
  if (pairs.length === 0)
    return { start_date: startDate, end_date: endDate, rows: [] };

  const splitMap = await resolveSplitConfigs(pairs);

  // build every (qcode, tag) needed once, so NAV fetch is a single batched round trip
  const queries: { qcode: string; tag: string }[] = [];
  for (const pair of pairs) {
    const split = splitMap.get(`${pair.qcode}|${pair.strategy}`)!;
    for (const sec of SUB_STRATEGY_SECTIONS) {
      if (split[sec.existsField] == null) continue;
      if (sec.tier != null && split.psar_multiplier !== sec.tier) continue;
      queries.push({ qcode: pair.qcode, tag: `${pair.strategy} ${sec.tag}` });
    }
  }

  const seriesMap = await fetchBulkNavSeries(queries, end, start);

  const rows: SubStrategyRow[] = [];
  for (const pair of pairs) {
    const split = splitMap.get(`${pair.qcode}|${pair.strategy}`)!;
    for (const sec of SUB_STRATEGY_SECTIONS) {
      if (split[sec.existsField] == null) continue;
      if (sec.tier != null && split.psar_multiplier !== sec.tier) continue;

      const nav = seriesMap.get(`${pair.qcode}|${pair.strategy} ${sec.tag}`);
      if (!nav || nav.length === 0) continue; // config says it should exist, data doesn't — nothing to report

      const monthly = calcMonthlyReturns(nav);
      rows.push({
        section: sec.label,
        qcode: pair.qcode,
        account_name: pair.account_name,
        strategy: pair.strategy,
        monthly,
        yearly: calcYearlyReturns(monthly),
      });
    }
  }

  return { start_date: startDate, end_date: endDate, rows };
}

// ── Sub-Strategy Daily PnL (export-only) ─────────────────────────────────────

export interface DailyPnlSelection {
  qcode: string;
  strategy: string;
}

export interface DailyPnlPoint {
  date: string;
  return_pct: number | null; // null on a client's first data point — no prev_nav to ratio against
  pnl_inr: number;
}

export interface DailyPnlSeries {
  qcode: string;
  account_name: string;
  strategy: string;
  section: string;
  points: DailyPnlPoint[];
}

// per-day nav ratio — same formula calcMonthlyReturns chains across a month
function calcDailyReturns(nav: NavPoint[]): DailyPnlPoint[] {
  return nav.map((p) => ({
    date: p.date.toISOString().split("T")[0],
    return_pct:
      p.prev_nav != null && p.prev_nav > 0
        ? parseFloat(((p.nav / p.prev_nav - 1) * 100).toFixed(2))
        : null,
    pnl_inr: parseFloat(p.pnl.toFixed(2)),
  }));
}

export async function computeSubStrategyDailyPnl(
  selections: DailyPnlSelection[],
  sections: string[],
  end?: Date,
  start?: Date,
): Promise<DailyPnlSeries[]> {
  const wantedSections = new Set(
    sections.filter((s) => SUB_STRATEGY_SECTION_ORDER.includes(s)),
  );
  if (wantedSections.size === 0) return [];

  const allPairs = await fetchStrategyPairs("profit_tag_suffix");
  const pairMap = new Map(allPairs.map((p) => [`${p.qcode}|${p.strategy}`, p]));

  // dedupe selections before the unnest join, same fix as computeCompare
  const uniqueKeys = new Set(selections.map((s) => `${s.qcode}|${s.strategy}`));
  const pairs = [...uniqueKeys]
    .map((k) => pairMap.get(k))
    .filter((p): p is StrategyPair => p != null);
  if (pairs.length === 0) return [];

  const splitMap = await resolveSplitConfigs(pairs);

  const queries: { qcode: string; tag: string }[] = [];
  const combos: { pair: StrategyPair; sec: SubStrategySectionDef }[] = [];
  for (const pair of pairs) {
    const split = splitMap.get(`${pair.qcode}|${pair.strategy}`)!;
    for (const sec of SUB_STRATEGY_SECTIONS) {
      if (!wantedSections.has(sec.label)) continue;
      if (split[sec.existsField] == null) continue;
      if (sec.tier != null && split.psar_multiplier !== sec.tier) continue;
      queries.push({ qcode: pair.qcode, tag: `${pair.strategy} ${sec.tag}` });
      combos.push({ pair, sec });
    }
  }
  if (queries.length === 0) return [];

  const seriesMap = await fetchBulkNavSeries(queries, end, start);

  const result: DailyPnlSeries[] = [];
  for (const { pair, sec } of combos) {
    const nav = seriesMap.get(`${pair.qcode}|${pair.strategy} ${sec.tag}`);
    if (!nav || nav.length === 0) continue; // config says it should exist, data doesn't — nothing to report

    result.push({
      qcode: pair.qcode,
      account_name: pair.account_name,
      strategy: pair.strategy,
      section: sec.label,
      points: calcDailyReturns(nav),
    });
  }
  return result;
}

// ── Strategy-wise Monthly Returns ────────────────────────────────────────────

export interface StrategyMonthlyRow {
  qcode: string;
  account_name: string;
  strategy: string;
  monthly: MonthlyReturn[];
  yearly: YearlyReturn[];
}

export async function computeStrategyMonthlyReturns(): Promise<
  StrategyMonthlyRow[]
> {
  const pairs = await fetchStrategyPairs("profit_tag_suffix");
  if (pairs.length === 0) return [];

  const seriesMap = await fetchBulkNavSeries(
    pairs.map((p) => ({ qcode: p.qcode, tag: p.tag })),
  );

  const rows: StrategyMonthlyRow[] = [];
  for (const pair of pairs) {
    const nav = seriesMap.get(`${pair.qcode}|${pair.tag}`);
    if (!nav || nav.length === 0) continue; // no data — nothing to report

    const monthly = calcMonthlyReturns(nav);
    rows.push({
      qcode: pair.qcode,
      account_name: pair.account_name,
      strategy: pair.strategy,
      monthly,
      yearly: calcYearlyReturns(monthly),
    });
  }

  return rows;
}

// ── Backtest (Research Dashboard) ────────────────────────────────────────────

const SCHEDULE_RUNS_URL = "https://research.qodeinvest.com/api/schedule-runs";
const LIVE_RUN_BASE_URL = "https://research.qodeinvest.com/api/live-runs";

const LIVE_RUN_ID_TTL_MS = 15 * 60 * 1000; // recheck for a newer completed run periodically
const COMBINED_METRICS_TTL_MS = 24 * 60 * 60 * 1000; // a completed run's own data never changes

interface ScheduleRun {
  live_run_id: string;
  run_start: string;
  run_result: "COMPLETED" | "FAILED" | "RUNNING";
}

let cachedLiveRunIds: { ids: string[]; fetchedAt: number } | null = null;
const combinedMetricsCache = new Map<
  string,
  { data: any; fetchedAt: number }
>();

// every COMPLETED run, newest first — cached; stale beats nothing on fetch failure
async function resolveCompletedLiveRunIds(): Promise<string[]> {
  if (
    cachedLiveRunIds &&
    Date.now() - cachedLiveRunIds.fetchedAt < LIVE_RUN_ID_TTL_MS
  ) {
    return cachedLiveRunIds.ids;
  }
  try {
    const res = await fetch(SCHEDULE_RUNS_URL);
    if (!res.ok) return cachedLiveRunIds?.ids ?? [];
    const runs: ScheduleRun[] = await res.json();
    const ids = runs
      .filter((r) => r.run_result === "COMPLETED")
      .sort(
        (a, b) =>
          new Date(b.run_start).getTime() - new Date(a.run_start).getTime(),
      )
      .map((r) => r.live_run_id);
    if (ids.length === 0) return cachedLiveRunIds?.ids ?? [];
    cachedLiveRunIds = { ids, fetchedAt: Date.now() };
    return ids;
  } catch {
    return cachedLiveRunIds?.ids ?? [];
  }
}

// one option's combined-metrics payload — immutable once COMPLETED, cached longer
async function fetchCombinedMetrics(
  liveRunId: string,
  option: string,
): Promise<any | null> {
  const key = `${liveRunId}:${option}`;
  const cached = combinedMetricsCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < COMBINED_METRICS_TTL_MS) {
    return cached.data;
  }
  try {
    const res = await fetch(
      `${LIVE_RUN_BASE_URL}/${liveRunId}/combined-metrics?option=${option}`,
    );
    if (!res.ok) return null;
    const json = await res.json();
    const schemeData = json?.data?.[option];
    if (!json?.success || !schemeData) return null;
    combinedMetricsCache.set(key, { data: schemeData, fetchedAt: Date.now() });
    return schemeData;
  } catch {
    return null;
  }
}

// tries newest-first completed run; a bad run doesn't sink the whole option
async function fetchCombinedMetricsWithFallback(
  liveRunIds: string[],
  option: string,
): Promise<any | null> {
  for (const liveRunId of liveRunIds) {
    const data = await fetchCombinedMetrics(liveRunId, option);
    if (data) return data;
  }
  return null;
}

// client's strategy field -> research dashboard scheme; QTF has none, by design
const SCHEME_OPTION: Record<string, string> = {
  "QAW+": "qaw_plus",
  "QAW++": "qaw_plus_plus",
  "QYE+": "qye_plus",
  "QYE++": "qye_plus_plus",
};

// PSAR/BTST curves are columns in the scheme-level nav_curve, not nested
type BacktestSource =
  | {
      kind: "scheme";
      array: "nav_curve" | "nifty_nav_curve" | "sensex_nav_curve";
      field: "normalized_nav" | "psar_nav" | "btst_nav";
    }
  | {
      kind: "qaw_split";
      split:
        | "all"
        | "qaw_gold_matrics"
        | "qaw_low_vol_matrics"
        | "qaw_mom_matrics"
        | "qaw_put_prot_matrics";
    }
  | { kind: "standalone"; tab: "all" | "nifty" | "sensex" }; // Section 3 — always the Compounded variant

const TOTAL_PORTFOLIO_SOURCE: BacktestSource = {
  kind: "scheme",
  array: "nav_curve",
  field: "normalized_nav",
};

// scheme-prefixed tags (e.g. "QYE++ PSAR") — client's own strategy determines the scheme
const BACKTEST_TAG_SOURCE: Record<string, BacktestSource> = {
  "Total Portfolio Value": TOTAL_PORTFOLIO_SOURCE,
  "Total Portfolio Exposure": TOTAL_PORTFOLIO_SOURCE,
  "Zerodha Total Portfolio": TOTAL_PORTFOLIO_SOURCE,
  PSAR: { kind: "scheme", array: "nav_curve", field: "psar_nav" },
  NPSAR: { kind: "scheme", array: "nifty_nav_curve", field: "psar_nav" },
  SPSAR: { kind: "scheme", array: "sensex_nav_curve", field: "psar_nav" },
  LONG: { kind: "scheme", array: "nav_curve", field: "btst_nav" },
  NLONG: { kind: "scheme", array: "nifty_nav_curve", field: "btst_nav" },
  SLONG: { kind: "scheme", array: "sensex_nav_curve", field: "btst_nav" },
  "Equity Stock Holdings": { kind: "qaw_split", split: "all" },
  "Gold Stock Holdings": { kind: "qaw_split", split: "qaw_gold_matrics" },
  "Low Vol Stock Holdings": {
    kind: "qaw_split",
    split: "qaw_low_vol_matrics",
  },
  "Momentum Stock Holdings": { kind: "qaw_split", split: "qaw_mom_matrics" },
  DMA1: { kind: "qaw_split", split: "qaw_put_prot_matrics" },
};

// bare tags with no scheme prefix — Section 3's standalone options
const UNPREFIXED_OPTION: Record<string, string> = {
  PSAR: "pbsar",
  NPSAR: "pbsar",
  SPSAR: "pbsar",
  LONG: "btst",
  NLONG: "btst",
  SLONG: "btst",
  DMA1: "dma",
};

const UNPREFIXED_SOURCE: Record<string, BacktestSource> = {
  PSAR: { kind: "standalone", tab: "all" },
  NPSAR: { kind: "standalone", tab: "nifty" },
  SPSAR: { kind: "standalone", tab: "sensex" },
  LONG: { kind: "standalone", tab: "all" },
  NLONG: { kind: "standalone", tab: "nifty" },
  SLONG: { kind: "standalone", tab: "sensex" },
  DMA1: { kind: "standalone", tab: "all" },
};

// pulls {date, nav} pairs out of an already-fetched scheme payload — no I/O
function extractBacktestRaw(
  schemeData: any,
  source: BacktestSource,
): { date: string; nav: number }[] | null {
  const arr =
    source.kind === "scheme"
      ? schemeData?.[source.array]
      : source.kind === "qaw_split"
        ? schemeData?.qaw?.[source.split]?.nav_curve
        : schemeData?.[source.tab]?.compounded?.nav_curve;
  const field = source.kind === "scheme" ? source.field : "normalized_nav";
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const out = arr
    .map((row: any) => ({ date: row.date, nav: Number(row[field]) }))
    .filter((p: { date: unknown; nav: number }) => p.date && isFinite(p.nav));
  return out.length > 0 ? out : null;
}

// ── Compare ───────────────────────────────────────────────────────────────

export interface CompareSelection {
  qcode: string;
  system_tag: string;
}

export interface CompareResult {
  qcode: string;
  system_tag: string;
  metrics: Omit<TagMetrics, "ratios"> | null;
  benchmark_overview: {
    since_inception: number | null;
    max_drawdown: number | null;
    current_drawdown: number | null;
  } | null;
}

export interface BacktestSeries {
  system_tag: string;
  series: { date: string; nav: number; drawdown: number }[];
}

export interface CompareOutput {
  benchmark_series: { date: string; nav: number; drawdown: number }[];
  backtest_series: BacktestSeries[];
  results: CompareResult[];
}

export async function computeCompare(
  selections: CompareSelection[],
): Promise<CompareOutput> {
  if (selections.length === 0)
    return { benchmark_series: [], backtest_series: [], results: [] };

  // dedupe first — a repeated pair would double NAV points in the join
  const uniquePairs = new Map<string, CompareSelection>();
  for (const s of selections) uniquePairs.set(`${s.qcode}|${s.system_tag}`, s);
  const unique = [...uniquePairs.values()];

  const seriesMap = await fetchBulkNavSeries(
    unique.map((s) => ({ qcode: s.qcode, tag: s.system_tag })),
  );

  // no rfr needed — ratios are stripped, so 0 is just a placeholder input
  const built = new Map<
    string,
    { nav: NavPoint[] | null; metrics: Omit<TagMetrics, "ratios"> | null }
  >();
  for (const s of unique) {
    const key = `${s.qcode}|${s.system_tag}`;
    const nav = seriesMap.get(key);
    if (!nav || nav.length === 0) {
      built.set(key, { nav: null, metrics: null });
      continue;
    }
    const { ratios: _ratios, ...metrics } = buildTagMetrics(nav, 0);
    built.set(key, { nav, metrics });
  }

  // shared window across every unique pair — one Nifty fetch regardless of count
  let minStart: Date | null = null;
  let maxEnd: Date | null = null;
  for (const b of built.values()) {
    if (!b.nav) continue;
    const start = b.nav[0].date;
    const end = b.nav[b.nav.length - 1].date;
    if (!minStart || start < minStart) minStart = start;
    if (!maxEnd || end > maxEnd) maxEnd = end;
  }

  const niftyRaw =
    minStart && maxEnd ? await fetchNiftyRawSeries(minStart, maxEnd) : null;

  // chart line: one series, rebased at the oldest selection's start
  const chartBenchmark =
    niftyRaw && minStart && maxEnd
      ? computeBenchmarkMetrics(niftyRaw, minStart, maxEnd)
      : null;

  // overview card per unique pair, rebased at that pair's own start; cached
  const overviewCache = new Map<string, CompareResult["benchmark_overview"]>();
  function benchmarkOverview(key: string, nav: NavPoint[]) {
    if (overviewCache.has(key)) return overviewCache.get(key)!;
    const obj = niftyRaw
      ? computeBenchmarkMetrics(niftyRaw, nav[0].date, nav[nav.length - 1].date)
      : null;
    const result = obj
      ? {
          since_inception: obj.since_inception,
          max_drawdown: obj.max_drawdown,
          current_drawdown: obj.current_drawdown,
        }
      : null;
    overviewCache.set(key, result);
    return result;
  }

  // rebuilt in original request order — duplicates still get one entry each
  const results: CompareResult[] = selections.map((s) => {
    const key = `${s.qcode}|${s.system_tag}`;
    const b = built.get(key)!;
    if (!b.nav || !b.metrics) {
      return {
        qcode: s.qcode,
        system_tag: s.system_tag,
        metrics: null,
        benchmark_overview: null,
      };
    }
    return {
      qcode: s.qcode,
      system_tag: s.system_tag,
      metrics: b.metrics,
      benchmark_overview: benchmarkOverview(key, b.nav),
    };
  });

  // ── Backtest curves — one per distinct system_tag, not one shared line
  // shared-tag selections merge into one rebased curve; different tags never merge
  const tagGroups = new Map<string, NavPoint[][]>();
  for (const s of unique) {
    const b = built.get(`${s.qcode}|${s.system_tag}`);
    if (!b?.nav) continue;
    if (!tagGroups.has(s.system_tag)) tagGroups.set(s.system_tag, []);
    tagGroups.get(s.system_tag)!.push(b.nav);
  }

  const backtest_series: BacktestSeries[] = [];
  if (tagGroups.size > 0) {
    const liveRunIds = await resolveCompletedLiveRunIds();
    if (liveRunIds.length > 0) {
      // one combined-metrics fetch per distinct scheme, reused across its tag groups
      const schemeCache = new Map<string, any | null>();
      for (const [systemTag, members] of tagGroups) {
        const trimmed = systemTag.trim();
        const spaceIdx = trimmed.indexOf(" ");

        let option: string | undefined;
        let source: BacktestSource | undefined;
        if (spaceIdx === -1) {
          // no scheme prefix — client runs the strategy directly, not bifurcated
          option = UNPREFIXED_OPTION[trimmed];
          source = UNPREFIXED_SOURCE[trimmed];
        } else {
          const strategy = trimmed.slice(0, spaceIdx).trim();
          const tag = trimmed.slice(spaceIdx + 1).trim();
          option = SCHEME_OPTION[strategy];
          source = BACKTEST_TAG_SOURCE[tag];
        }
        if (!option || !source) continue; // no backtest for this tag (QTF, or a UID-level tag)

        if (!schemeCache.has(option)) {
          schemeCache.set(
            option,
            await fetchCombinedMetricsWithFallback(liveRunIds, option),
          );
        }
        const schemeData = schemeCache.get(option);
        if (!schemeData) continue;

        const raw = extractBacktestRaw(schemeData, source);
        if (!raw) continue;

        const groupStart = members.reduce(
          (min, nav) => (nav[0].date < min ? nav[0].date : min),
          members[0][0].date,
        );
        const groupEnd = members.reduce(
          (max, nav) => {
            const end = nav[nav.length - 1].date;
            return end > max ? end : max;
          },
          members[0][members[0].length - 1].date,
        );

        const rebased = computeBenchmarkMetrics(raw, groupStart, groupEnd);
        if (rebased)
          backtest_series.push({
            system_tag: systemTag,
            series: rebased.series,
          });
      }
    }
  }

  return {
    benchmark_series: chartBenchmark?.series ?? [],
    backtest_series,
    results,
  };
}

// ── System Tags ───────────────────────────────────────────────────────────

// all distinct strategies configured for a client — resolves "combined" views
async function fetchClientStrategies(qcode: string): Promise<string[]> {
  const configs = await prisma.client_strategy_configs.findMany({
    where: { qcode },
    select: { strategy: true },
  });
  return [...new Set(configs.map((c) => c.strategy))];
}

// distinct tags for a qcode+strategy; "combined" = no known strategy prefix match
export async function fetchSystemTags(
  qcode: string,
  strategy: string,
): Promise<string[]> {
  let rows: { system_tag: string }[];

  if (strategy === "combined") {
    const allPrefixes = await fetchClientStrategies(qcode);
    if (allPrefixes.length === 0) {
      rows = await prisma.$queryRawUnsafe<{ system_tag: string }[]>(
        `SELECT DISTINCT system_tag
         FROM bifurcated_master_sheet_test
         WHERE qcode = $1
         ORDER BY system_tag`,
        qcode,
      );
    } else {
      const excludes = allPrefixes
        .map((_, i) => `system_tag NOT LIKE $${i + 2}`)
        .join(" AND ");
      rows = await prisma.$queryRawUnsafe<{ system_tag: string }[]>(
        `SELECT DISTINCT system_tag
         FROM bifurcated_master_sheet_test
         WHERE qcode = $1 AND ${excludes}
         ORDER BY system_tag`,
        qcode,
        ...allPrefixes.map((p) => `${p} %`),
      );
    }
  } else {
    rows = await prisma.$queryRawUnsafe<{ system_tag: string }[]>(
      `SELECT DISTINCT system_tag
       FROM bifurcated_master_sheet_test
       WHERE qcode = $1 AND system_tag LIKE $2
       ORDER BY system_tag`,
      qcode,
      `${strategy} %`,
    );
  }

  return rows.map((r) => r.system_tag);
}

// ── Cash & Margin: Snapshot ──────────────────────────────────────────────────

// uses Exposure Tag, not Profit Tag — diverges from Portfolio Review when F&O positions are open
export interface CashMarginSnapshotRow {
  account_name: string;
  strategy: string;
  account_value: number;
  gold: number;
  momentum: number;
  lowvol: number;
  mutual_funds: number;
  holdings: number; // gold+momentum+lowvol, or mutual_funds
  has_equity_split: boolean;
  liquidcase: number;
  cash: number;
  cash_plus_liquidcase: number;
  excess_cash: number;
  excess_cash_pct: number;
  cash_drift: number | null;
  holdings_drift: number | null;
  cash_component_drift: number | null;
  snapshot_below_floor: boolean | null; // §2 — null on Combined, no single target
}

export interface CashMarginSnapshotResult {
  strategies: CashMarginSnapshotRow[];
  combined: CashMarginSnapshotRow | null; // drift fields null — no single target across strategies
}

// §8.2/§10.2
function calcExcessCash(
  holdings: number,
  cashPlusLc: number,
  equityPct: number | null,
): number {
  if (!equityPct) return cashPlusLc;
  const requiredBuffer = holdings / equityPct - holdings;
  return cashPlusLc - requiredBuffer;
}

// one DB round-trip shared by the snapshot and withdrawal targets
async function fetchCashMarginContext(qcode: string): Promise<{
  pairs: StrategyPair[];
  valueMap: Map<string, number>;
  splitMap: Map<string, SplitConfig>;
}> {
  const today = new Date().toISOString().split("T")[0];
  // Exposure Tag, not Profit Tag — diverges from Portfolio Review with open F&O
  const allPairs = await fetchStrategyPairs("exposure_tag_suffix");
  const pairs = allPairs.filter(
    (p) => p.qcode === qcode && isActive(p.effective_to, today),
  );
  if (pairs.length === 0) {
    return { pairs, valueMap: new Map(), splitMap: new Map() };
  }
  const [valueMap, splitMap] = await Promise.all([
    fetchLatestTagValues(pairs),
    resolveSplitConfigs(pairs),
  ]);
  return { pairs, valueMap, splitMap };
}

function buildCashMarginSnapshot(
  pairs: StrategyPair[],
  valueMap: Map<string, number>,
  splitMap: Map<string, SplitConfig>,
): CashMarginSnapshotResult {
  const strategies: CashMarginSnapshotRow[] = [];
  for (const pair of pairs) {
    const account_value = valueMap.get(`${pair.qcode}|${pair.tag}`) ?? 0;
    if (account_value === 0) continue;

    const split = splitMap.get(`${pair.qcode}|${pair.strategy}`)!;
    const mutual_funds =
      valueMap.get(`${pair.qcode}|${pair.strategy} Mutual Funds`) ?? 0;
    const equity_stock_holdings =
      valueMap.get(`${pair.qcode}|${pair.strategy} Equity Stock Holdings`) ?? 0;
    const bond_stock_holdings =
      valueMap.get(`${pair.qcode}|${pair.strategy} Bond Stock Holdings`) ?? 0;
    const gold =
      valueMap.get(`${pair.qcode}|${pair.strategy} Gold Stock Holdings`) ?? 0;
    const momentum =
      valueMap.get(`${pair.qcode}|${pair.strategy} Momentum Stock Holdings`) ??
      0;
    const lowvol =
      valueMap.get(`${pair.qcode}|${pair.strategy} Low Vol Stock Holdings`) ??
      0;
    // gated on resolved config, never a strategy-name check
    const has_equity_split = split.gold_pct != null;

    const holdings = has_equity_split
      ? gold +
        momentum +
        lowvol +
        equity_stock_holdings +
        bond_stock_holdings +
        mutual_funds
      : mutual_funds + equity_stock_holdings + bond_stock_holdings;

    const liquidcase =
      valueMap.get(
        `${pair.qcode}|${pair.strategy} Liquidcase Stock Holdings`,
      ) ?? 0;
    const cash = account_value - holdings - liquidcase;
    const cash_plus_liquidcase = cash + liquidcase;

    const excess_cash = calcExcessCash(
      holdings,
      cash_plus_liquidcase,
      split.equity_pct,
    );

    const cashPctActual = cash / account_value;
    const holdingsPctActual = holdings / account_value;
    const cashLcPctActual = cash_plus_liquidcase / account_value;

    strategies.push({
      account_name: pair.account_name,
      strategy: pair.strategy,
      account_value,
      gold,
      momentum,
      lowvol,
      mutual_funds,
      holdings,
      has_equity_split,
      liquidcase,
      cash,
      cash_plus_liquidcase,
      excess_cash: round(excess_cash, 2)!,
      excess_cash_pct: round(excess_cash / account_value, 4)!,
      cash_drift:
        split.cash_pct != null
          ? round(cashPctActual - split.cash_pct, 4)
          : null,
      holdings_drift:
        split.equity_pct != null
          ? round(holdingsPctActual - split.equity_pct, 4)
          : null,
      cash_component_drift:
        split.equity_pct != null
          ? round(cashLcPctActual - (1 - split.equity_pct), 4)
          : null,
      snapshot_below_floor:
        split.cash_pct != null
          ? cash_plus_liquidcase < split.cash_pct * account_value
          : null,
    });
  }

  if (strategies.length === 0) return { strategies: [], combined: null };

  const sum = (f: (r: CashMarginSnapshotRow) => number) =>
    strategies.reduce((s, r) => s + f(r), 0);
  const combinedAv = sum((r) => r.account_value);
  const combinedExcess = sum((r) => r.excess_cash);

  const combined: CashMarginSnapshotRow = {
    account_name: strategies[0].account_name,
    strategy: "combined",
    account_value: combinedAv,
    gold: sum((r) => r.gold),
    momentum: sum((r) => r.momentum),
    lowvol: sum((r) => r.lowvol),
    mutual_funds: sum((r) => r.mutual_funds),
    holdings: sum((r) => r.holdings),
    has_equity_split: strategies.some((r) => r.has_equity_split),
    liquidcase: sum((r) => r.liquidcase),
    cash: sum((r) => r.cash),
    cash_plus_liquidcase: sum((r) => r.cash_plus_liquidcase),
    excess_cash: round(combinedExcess, 2)!,
    excess_cash_pct:
      combinedAv > 0 ? round(combinedExcess / combinedAv, 4)! : 0,
    cash_drift: null,
    holdings_drift: null,
    cash_component_drift: null,
    snapshot_below_floor: null,
  };

  return { strategies, combined };
}

export async function fetchCashMarginSnapshot(
  qcode: string,
): Promise<CashMarginSnapshotResult> {
  const { pairs, valueMap, splitMap } = await fetchCashMarginContext(qcode);
  if (pairs.length === 0) return { strategies: [], combined: null };
  return buildCashMarginSnapshot(pairs, valueMap, splitMap);
}

// ── Cash & Margin: Withdrawal ────────────────────────────────────────────────

const EPSILON = 0.01; // rupee tolerance for floor/remainder comparisons — absorbs float noise, not real shortfalls

export interface WithdrawalTargets {
  equity_pct: number;
  cash_pct: number;
  lc_pct: number; // §10.1 — derived by default (1 - equity_pct - cash_pct), overridable via liquidcase_pct
  // safety-floor/model-ratio fields — same cascade, never payload-overridable
  cash_pct_healthy: number | null;
  liquidcase_pct_gate: number | null;
  gold_model_pct: number | null;
  momentum_model_pct: number | null;
  lowvol_model_pct: number | null;
}

const RATIO_EPSILON = 0.0001; // tolerance for the equity+cash+liquidcase = 1 identity check

// only two of equity/cash/lc are ever independent — third is derived, or validated if both given
function resolveCashLiquidcaseSplit(
  equity_pct: number,
  defaultCashPct: number | null,
  cashOverride?: number,
  lcOverride?: number,
): { cash_pct: number; lc_pct: number } {
  if (lcOverride != null && cashOverride != null) {
    const expected = 1 - equity_pct;
    const actual = cashOverride + lcOverride;
    if (Math.abs(actual - expected) > RATIO_EPSILON) {
      throw new Error(
        `cash_pct + liquidcase_pct must sum to ${round(expected, 4)} (1 - equity_pct); got ${round(actual, 4)}`,
      );
    }
    return { cash_pct: cashOverride, lc_pct: lcOverride };
  }
  if (lcOverride != null) {
    return { cash_pct: 1 - equity_pct - lcOverride, lc_pct: lcOverride };
  }
  const cash_pct = cashOverride ?? defaultCashPct;
  if (cash_pct == null) {
    throw new Error("cash_pct not configured for this strategy");
  }
  return { cash_pct, lc_pct: 1 - equity_pct - cash_pct }; // §10.1, default derivation
}

// payload override -> resolved SplitConfig, pure, no DB access
function mergeWithdrawalTargets(
  split: SplitConfig,
  equityPctOverride?: number,
  cashPctOverride?: number,
  liquidcasePctOverride?: number,
): WithdrawalTargets {
  const equity_pct = equityPctOverride ?? split.equity_pct;
  if (equity_pct == null) {
    throw new Error("equity_pct not configured for this strategy");
  }
  const { cash_pct, lc_pct } = resolveCashLiquidcaseSplit(
    equity_pct,
    split.cash_pct,
    cashPctOverride,
    liquidcasePctOverride,
  );

  return {
    equity_pct,
    cash_pct,
    lc_pct,
    cash_pct_healthy: split.cash_pct_healthy,
    liquidcase_pct_gate: split.liquidcase_pct_gate,
    gold_model_pct: split.gold_model_pct,
    momentum_model_pct: split.momentum_model_pct,
    lowvol_model_pct: split.lowvol_model_pct,
  };
}

// ── Cash & Margin: Withdrawal — reworked to match Sahil's four-source /
// four sources resolve one amount; Balanced/Holdings-Frozen/Cash-Frozen
// always compute together. Liquidcase LTP is informational only here.

// last bucket absorbs the rounding remainder so the parts sum exactly to `total`
function allocateWithRounding(total: number, weights: number[]): number[] {
  const sumWeights = weights.reduce((a, b) => a + b, 0);
  const amounts = weights.map((w) =>
    sumWeights > 0 ? round((total * w) / sumWeights, 2)! : 0,
  );
  const allocatedSoFar = amounts.slice(0, -1).reduce((a, b) => a + b, 0);
  amounts[amounts.length - 1] = round(total - allocatedSoFar, 2)!;
  return amounts;
}

export type WithdrawalDirection =
  | "Sell"
  | "Buy"
  | "Withdraw"
  | "Deposit"
  | "None";

function directionFor(
  changeAmount: number,
  unit: "sell_buy" | "withdraw_deposit",
): WithdrawalDirection {
  if (Math.abs(changeAmount) < 0.005) return "None";
  if (unit === "sell_buy") return changeAmount > 0 ? "Sell" : "Buy";
  return changeAmount > 0 ? "Withdraw" : "Deposit";
}

export interface WithdrawalSleeve {
  particular: string;
  current_value: number;
  new_value: number;
  change_amount: number; // positive = value left this bucket
  direction: WithdrawalDirection;
  ltp: number | null; // Liquidcase only — informational, see note above
  quantity: number | null; // fractional, informational — NOT whole-unit floored
  new_pct: number;
}

function buildWithdrawalSleeve(
  particular: string,
  oldValue: number,
  newValue: number,
  newAccountValue: number,
  unit: "sell_buy" | "withdraw_deposit",
  ltp?: number,
): WithdrawalSleeve {
  const changeAmount = round(oldValue - newValue, 2)!;
  return {
    particular,
    current_value: round(oldValue, 2)!,
    new_value: round(newValue, 2)!,
    change_amount: changeAmount,
    direction: directionFor(changeAmount, unit),
    ltp: ltp ?? null,
    quantity: ltp ? round(Math.abs(changeAmount) / ltp, 2)! : null,
    new_pct: newAccountValue > 0 ? round(newValue / newAccountValue, 4)! : 0,
  };
}

// current/ideal/model split from data on hand, not a separate defaults fetch
function resolveWithdrawalEqSplit(
  row: CashMarginSnapshotRow,
  targets: WithdrawalTargets,
  ratioType: "current" | "ideal" | "model",
): { gold: number; momentum: number; lowvol: number } {
  if (ratioType === "ideal") {
    return { gold: 0.4, momentum: 0.4, lowvol: 0.2 };
  }
  if (ratioType === "model") {
    const g = targets.gold_model_pct ?? 0;
    const m = targets.momentum_model_pct ?? 0;
    const l = targets.lowvol_model_pct ?? 0;
    const total = g + m + l;
    return total > 0
      ? { gold: g / total, momentum: m / total, lowvol: l / total }
      : { gold: 0, momentum: 0, lowvol: 0 };
  }
  // current
  return row.holdings > 0
    ? {
        gold: row.gold / row.holdings,
        momentum: row.momentum / row.holdings,
        lowvol: row.lowvol / row.holdings,
      }
    : { gold: 0, momentum: 0, lowvol: 0 };
}

function resolveWithdrawalAmount(
  source: "all_profits" | "specific" | "fees" | "excess_cash",
  totalProfits: number | undefined,
  amount: number | undefined,
  excessCashBeforeWithdrawal: number,
): { blocked: boolean; warning: string | null; amount: number | null } {
  if (source === "specific" || source === "fees") {
    if (amount == null || amount <= 0) {
      throw new Error(
        `amount is required and must be positive for source '${source}'`,
      );
    }
    return { blocked: false, warning: null, amount };
  }
  if (source === "all_profits") {
    if (totalProfits == null) {
      throw new Error("total_profits is required for source 'all_profits'");
    }
    if (totalProfits <= 0) {
      return {
        blocked: true,
        warning: "Client has no profits available to withdraw",
        amount: null,
      };
    }
    return { blocked: false, warning: null, amount: totalProfits };
  }
  // excess_cash
  if (excessCashBeforeWithdrawal <= 0) {
    return {
      blocked: true,
      warning: "Client currently does not have excess cash",
      amount: null,
    };
  }
  return { blocked: false, warning: null, amount: excessCashBeforeWithdrawal };
}

export interface WithdrawalViewResult {
  new_account_value: number;
  sleeves: WithdrawalSleeve[];
}

// ── Balanced — two regimes joined exactly at the excess-cash boundary ──────
function computeBalancedQye(
  row: CashMarginSnapshotRow,
  targets: WithdrawalTargets,
  amountToWithdraw: number,
  excessCashBeforeWithdrawal: number,
  liquidcaseLtp: number | undefined,
): WithdrawalViewResult {
  const newAccountValue = row.account_value - amountToWithdraw;
  const isRegimeB = amountToWithdraw > excessCashBeforeWithdrawal;
  const newHoldings = isRegimeB
    ? newAccountValue * targets.equity_pct
    : row.holdings;
  const newCash = newAccountValue * targets.cash_pct;
  const newLiquidcase = newAccountValue - newHoldings - newCash;

  const sleeves = [
    buildWithdrawalSleeve(
      "Mutual Funds",
      row.mutual_funds,
      newHoldings,
      newAccountValue,
      "sell_buy",
    ),
    buildWithdrawalSleeve(
      "Liquidcase",
      row.liquidcase,
      newLiquidcase,
      newAccountValue,
      "sell_buy",
      liquidcaseLtp,
    ),
    buildWithdrawalSleeve(
      "Cash",
      row.cash,
      newCash,
      newAccountValue,
      "withdraw_deposit",
    ),
  ];
  return { new_account_value: round(newAccountValue, 2)!, sleeves };
}

async function computeBalancedQaw(
  row: CashMarginSnapshotRow,
  targets: WithdrawalTargets,
  amountToWithdraw: number,
  excessCashBeforeWithdrawal: number,
  ratioType: "current" | "ideal" | "model",
  liquidcaseLtp: number | undefined,
): Promise<WithdrawalViewResult> {
  const newAccountValue = row.account_value - amountToWithdraw;
  const isRegimeB = amountToWithdraw > excessCashBeforeWithdrawal;

  let newGold = row.gold;
  let newMomentum = row.momentum;
  let newLowvol = row.lowvol;
  if (isRegimeB) {
    const subRatios = resolveWithdrawalEqSplit(row, targets, ratioType);
    const newEquityTotal = newAccountValue * targets.equity_pct;
    const equityReduction = row.holdings - newEquityTotal;
    const [redGold, redMomentum, redLowvol] = allocateWithRounding(
      equityReduction,
      [subRatios.gold, subRatios.momentum, subRatios.lowvol],
    );
    newGold = row.gold - redGold;
    newMomentum = row.momentum - redMomentum;
    newLowvol = row.lowvol - redLowvol;
  }
  const newCash = newAccountValue * targets.cash_pct;
  const newLiquidcase =
    newAccountValue - newGold - newMomentum - newLowvol - newCash;

  const sleeves = [
    buildWithdrawalSleeve(
      "Gold",
      row.gold,
      newGold,
      newAccountValue,
      "sell_buy",
    ),
    buildWithdrawalSleeve(
      "Momentum",
      row.momentum,
      newMomentum,
      newAccountValue,
      "sell_buy",
    ),
    buildWithdrawalSleeve(
      "Low Vol",
      row.lowvol,
      newLowvol,
      newAccountValue,
      "sell_buy",
    ),
    buildWithdrawalSleeve(
      "Liquidcase",
      row.liquidcase,
      newLiquidcase,
      newAccountValue,
      "sell_buy",
      liquidcaseLtp,
    ),
    buildWithdrawalSleeve(
      "Cash",
      row.cash,
      newCash,
      newAccountValue,
      "withdraw_deposit",
    ),
  ];
  return { new_account_value: round(newAccountValue, 2)!, sleeves };
}

// ── Holdings-Frozen — "don't reduce exposure". Liquidcase can come out
// Liquidcase can go negative — the informative signal, not capped
function computeHoldingsFrozenQye(
  row: CashMarginSnapshotRow,
  targets: WithdrawalTargets,
  amountToWithdraw: number,
  liquidcaseLtp: number | undefined,
): WithdrawalViewResult {
  const newAccountValue = row.account_value - amountToWithdraw;
  const newCash = newAccountValue * targets.cash_pct;
  const newLiquidcase = newAccountValue - row.holdings - newCash;

  const sleeves = [
    buildWithdrawalSleeve(
      "Mutual Funds",
      row.mutual_funds,
      row.holdings,
      newAccountValue,
      "sell_buy",
    ),
    buildWithdrawalSleeve(
      "Liquidcase",
      row.liquidcase,
      newLiquidcase,
      newAccountValue,
      "sell_buy",
      liquidcaseLtp,
    ),
    buildWithdrawalSleeve(
      "Cash",
      row.cash,
      newCash,
      newAccountValue,
      "withdraw_deposit",
    ),
  ];
  return { new_account_value: round(newAccountValue, 2)!, sleeves };
}

function computeHoldingsFrozenQaw(
  row: CashMarginSnapshotRow,
  targets: WithdrawalTargets,
  amountToWithdraw: number,
  liquidcaseLtp: number | undefined,
): WithdrawalViewResult {
  const newAccountValue = row.account_value - amountToWithdraw;
  const newCash = newAccountValue * targets.cash_pct;
  const newLiquidcase = newAccountValue - row.holdings - newCash;

  const sleeves = [
    buildWithdrawalSleeve(
      "Gold",
      row.gold,
      row.gold,
      newAccountValue,
      "sell_buy",
    ),
    buildWithdrawalSleeve(
      "Momentum",
      row.momentum,
      row.momentum,
      newAccountValue,
      "sell_buy",
    ),
    buildWithdrawalSleeve(
      "Low Vol",
      row.lowvol,
      row.lowvol,
      newAccountValue,
      "sell_buy",
    ),
    buildWithdrawalSleeve(
      "Liquidcase",
      row.liquidcase,
      newLiquidcase,
      newAccountValue,
      "sell_buy",
      liquidcaseLtp,
    ),
    buildWithdrawalSleeve(
      "Cash",
      row.cash,
      newCash,
      newAccountValue,
      "withdraw_deposit",
    ),
  ];
  return { new_account_value: round(newAccountValue, 2)!, sleeves };
}

// ── Cash-Frozen — "only reduce exposure". Becomes null with a reason when
// null + reason when amount exceeds Holdings — never a partial execution
function computeCashFrozenQye(
  row: CashMarginSnapshotRow,
  amountToWithdraw: number,
): WithdrawalViewResult {
  const newHoldings = row.holdings - amountToWithdraw;
  const newAccountValue = row.account_value - amountToWithdraw;

  const sleeves = [
    buildWithdrawalSleeve(
      "Mutual Funds",
      row.mutual_funds,
      newHoldings,
      newAccountValue,
      "sell_buy",
    ),
    buildWithdrawalSleeve(
      "Liquidcase",
      row.liquidcase,
      row.liquidcase,
      newAccountValue,
      "sell_buy",
    ),
    buildWithdrawalSleeve(
      "Cash",
      row.cash,
      row.cash,
      newAccountValue,
      "withdraw_deposit",
    ),
  ];
  return { new_account_value: round(newAccountValue, 2)!, sleeves };
}

function computeCashFrozenQaw(
  row: CashMarginSnapshotRow,
  targets: WithdrawalTargets,
  amountToWithdraw: number,
  ratioType: "current" | "ideal" | "model",
): WithdrawalViewResult {
  const newAccountValue = row.account_value - amountToWithdraw;

  const subRatios = resolveWithdrawalEqSplit(row, targets, ratioType);
  const [redGold, redMomentum, redLowvol] = allocateWithRounding(
    amountToWithdraw,
    [subRatios.gold, subRatios.momentum, subRatios.lowvol],
  );
  const newGold = row.gold - redGold;
  const newMomentum = row.momentum - redMomentum;
  const newLowvol = row.lowvol - redLowvol;

  const sleeves = [
    buildWithdrawalSleeve(
      "Gold",
      row.gold,
      newGold,
      newAccountValue,
      "sell_buy",
    ),
    buildWithdrawalSleeve(
      "Momentum",
      row.momentum,
      newMomentum,
      newAccountValue,
      "sell_buy",
    ),
    buildWithdrawalSleeve(
      "Low Vol",
      row.lowvol,
      newLowvol,
      newAccountValue,
      "sell_buy",
    ),
    buildWithdrawalSleeve(
      "Liquidcase",
      row.liquidcase,
      row.liquidcase,
      newAccountValue,
      "sell_buy",
    ),
    buildWithdrawalSleeve(
      "Cash",
      row.cash,
      row.cash,
      newAccountValue,
      "withdraw_deposit",
    ),
  ];
  return { new_account_value: round(newAccountValue, 2)!, sleeves };
}

// ── Orchestration ────────────────────────────────────────────────────────
export interface WithdrawalInput {
  qcode: string;
  strategy?: string; // absent → snapshot-only preview, matching prior behavior
  source?: "all_profits" | "specific" | "fees" | "excess_cash";
  total_profits?: number; // required when source = "all_profits" — manual input, no automated source, confirmed
  amount?: number; // required when source = "specific" or "fees"
  ratio_type?: "current" | "ideal" | "model"; // required for QAW strategies
  equity_pct?: number;
  cash_pct?: number;
  lc_pct?: number; // renamed from liquidcase_pct to match Deploy's naming exactly
}

export interface CashMarginWithdrawalResult {
  snapshot: CashMarginSnapshotResult;
  blocked: boolean;
  warning: string | null;
  amount_to_withdraw: number | null;
  excess_cash_before_withdrawal: number | null;
  ratio_type: "current" | "ideal" | "model" | null;
  balanced: WithdrawalViewResult | null;
  holdings_frozen: WithdrawalViewResult | null;
  cash_frozen: WithdrawalViewResult | null;
  // set only when cash_frozen is null
  cash_frozen_unavailable_reason: string | null;
}

export async function computeCashMarginWithdrawal(
  input: WithdrawalInput,
): Promise<CashMarginWithdrawalResult> {
  const { pairs, valueMap, splitMap } = await fetchCashMarginContext(
    input.qcode,
  );
  const snapshot =
    pairs.length === 0
      ? { strategies: [], combined: null }
      : buildCashMarginSnapshot(pairs, valueMap, splitMap);

  const empty = {
    blocked: false,
    warning: null,
    amount_to_withdraw: null,
    excess_cash_before_withdrawal: null,
    ratio_type: null,
    balanced: null,
    holdings_frozen: null,
    cash_frozen: null,
    cash_frozen_unavailable_reason: null,
  } as const;

  if (!input.strategy) {
    return { snapshot, ...empty };
  }

  const row = snapshot.strategies.find((r) => r.strategy === input.strategy);
  if (!row) {
    throw new Error(
      `No active strategy '${input.strategy}' found for ${input.qcode}`,
    );
  }

  // §2 — blocks outright so every view downstream doesn't re-derive safety
  if (row.snapshot_below_floor) {
    return {
      snapshot,
      ...empty,
      blocked: true,
      warning: "Account is below its cash floor — withdrawal blocked",
    };
  }

  const split = splitMap.get(`${input.qcode}|${input.strategy}`);
  if (!split) {
    throw new Error(
      `No client-strategy config found for ${input.qcode} / ${input.strategy}`,
    );
  }
  const targets = mergeWithdrawalTargets(
    split,
    input.equity_pct,
    input.cash_pct,
    input.lc_pct,
  );

  if (!input.source) {
    throw new Error("source is required");
  }

  // override-aware, not row.excess_cash (tier-default) — also drives the Regime A/B boundary below
  const excessCashBeforeWithdrawal = calcExcessCash(
    row.holdings,
    row.cash_plus_liquidcase,
    targets.equity_pct,
  );

  const resolved = resolveWithdrawalAmount(
    input.source,
    input.total_profits,
    input.amount,
    excessCashBeforeWithdrawal,
  );
  if (resolved.blocked) {
    return {
      snapshot,
      ...empty,
      blocked: true,
      warning: resolved.warning,
      excess_cash_before_withdrawal: round(excessCashBeforeWithdrawal, 2)!,
      ratio_type: input.ratio_type ?? null,
    };
  }
  const amountToWithdraw = resolved.amount!;

  // top-level impossibility — graceful block, not a throw
  if (amountToWithdraw >= row.account_value) {
    return {
      snapshot,
      ...empty,
      blocked: true,
      warning: "Withdrawal amount cannot meet or exceed the Account Value",
      amount_to_withdraw: round(amountToWithdraw, 2)!,
      excess_cash_before_withdrawal: round(excessCashBeforeWithdrawal, 2)!,
      ratio_type: input.ratio_type ?? null,
    };
  }

  let balanced: WithdrawalViewResult;
  let holdings_frozen: WithdrawalViewResult;
  let cash_frozen: WithdrawalViewResult | null;
  let cash_frozen_unavailable_reason: string | null = null;

  // informational only, fetched live like Deploy; degrades to null on failure
  const liquidcaseLtp = (await fetchLtps([ETF_SYMBOLS.liquidcase])).get(
    ETF_SYMBOLS.liquidcase,
  );

  // see computeCashFrozenQaw/Qye
  const cashFrozenAvailable = amountToWithdraw <= row.holdings;
  if (!cashFrozenAvailable) {
    cash_frozen_unavailable_reason = `Cash-Frozen can't fund this withdrawal without also selling Holdings — ₹${round(row.holdings, 2)} available, ₹${round(amountToWithdraw, 2)} requested.`;
  }

  if (row.has_equity_split) {
    if (!input.ratio_type) {
      throw new Error("ratio_type is required for this strategy");
    }
    balanced = await computeBalancedQaw(
      row,
      targets,
      amountToWithdraw,
      excessCashBeforeWithdrawal,
      input.ratio_type,
      liquidcaseLtp,
    );
    holdings_frozen = computeHoldingsFrozenQaw(
      row,
      targets,
      amountToWithdraw,
      liquidcaseLtp,
    );
    cash_frozen = cashFrozenAvailable
      ? computeCashFrozenQaw(row, targets, amountToWithdraw, input.ratio_type)
      : null;
  } else {
    balanced = computeBalancedQye(
      row,
      targets,
      amountToWithdraw,
      excessCashBeforeWithdrawal,
      liquidcaseLtp,
    );
    holdings_frozen = computeHoldingsFrozenQye(
      row,
      targets,
      amountToWithdraw,
      liquidcaseLtp,
    );
    cash_frozen = cashFrozenAvailable
      ? computeCashFrozenQye(row, amountToWithdraw)
      : null;
  }

  return {
    snapshot,
    blocked: false,
    warning: null,
    amount_to_withdraw: round(amountToWithdraw, 2)!,
    excess_cash_before_withdrawal: round(excessCashBeforeWithdrawal, 2)!,
    ratio_type: input.ratio_type ?? null,
    balanced,
    holdings_frozen,
    cash_frozen,
    cash_frozen_unavailable_reason,
  };
}

// ── Cash & Margin: Deploy (D0 — hypothetical new-client deployment) ─────────
// LTP via yahoo-finance2 (no auth needed) — batched into one call per computation

const yahooFinance = new YahooFinance();

const ETF_SYMBOLS = {
  gold: "GOLDBEES.NS",
  momentum: "MOMENTUM50.NS",
  lowvol: "LOWVOLIETF.NS",
  liquidcase: "LIQUIDCASE.NS",
} as const;

const QAW_IDEAL_RATIOS = { gold: 0.4, momentum: 0.4, lowvol: 0.2 }; // hardcoded by explicit instruction — never DB-driven, unlike Model

async function fetchLtps(symbols: string[]): Promise<Map<string, number>> {
  let quotes;
  try {
    quotes = await yahooFinance.quote(symbols);
  } catch (e) {
    throw new Error(
      `LTP fetch failed (Yahoo Finance): ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const list = Array.isArray(quotes) ? quotes : [quotes];
  const map = new Map<string, number>();
  for (const q of list) {
    if (q?.symbol && q.regularMarketPrice != null) {
      map.set(q.symbol, q.regularMarketPrice);
    }
  }
  return map;
}

// strategy_defaults only — no client_strategy_configs row for a hypothetical client
async function fetchStrategyDefaults(strategy: string): Promise<{
  equity_pct: number | null;
  cash_pct: number | null;
  gold_pct: number | null; // presence of this, not the strategy name, decides QAW-shaped vs QYE-shaped
  gold_model_pct: number | null;
  momentum_model_pct: number | null;
  lowvol_model_pct: number | null;
}> {
  const def = await prisma.strategy_defaults.findUnique({
    where: { strategy_name: strategy },
  });
  if (!def) {
    throw new Error(`No strategy_defaults row found for '${strategy}'`);
  }
  return {
    equity_pct: toNum(def.equity_pct),
    cash_pct: toNum(def.cash_pct),
    gold_pct: toNum(def.gold_pct),
    gold_model_pct: toNum(def.gold_model_pct),
    momentum_model_pct: toNum(def.momentum_model_pct),
    lowvol_model_pct: toNum(def.lowvol_model_pct),
  };
}

export interface DeploySleeve {
  particular: string;
  target_pct: number;
  target_value: number; // pure ideal target, never adjusted for rounding — same meaning on every row
  actual_value: number; // what this sleeve genuinely holds after rounding
  ltp: number | null; // null for non-tradeable rows (Cash, Holdings rollup)
  quantity: number | null;
}

// floors to whole units; remainder returned for the caller to sweep into Cash
function buildPricedSleeve(
  particular: string,
  target_pct: number,
  target_value: number,
  ltp: number | undefined,
): { sleeve: DeploySleeve; dust: number } {
  const roundedTarget = round(target_value, 2)!;
  if (ltp == null || ltp <= 0) {
    return {
      sleeve: {
        particular,
        target_pct,
        target_value: roundedTarget,
        actual_value: roundedTarget,
        ltp: null,
        quantity: null,
      },
      dust: 0,
    };
  }
  // trunc, not floor — floor over-sells on negative targets
  const quantity = Math.trunc(target_value / ltp);
  const actualValue = quantity * ltp;
  return {
    sleeve: {
      particular,
      target_pct,
      target_value: roundedTarget,
      actual_value: round(actualValue, 2)!,
      ltp,
      quantity,
    },
    dust: target_value - actualValue,
  };
}

// ── unified input — one route, no strategy-name check anywhere. Which fields
// required fields depend on has_equity_split, resolved once by computeDeploy
export interface DeployInput {
  qcode?: string; // presence decides D0 vs real-client path
  strategy: string;
  // D0-only (qcode absent) — QAW-shaped
  ratio_type?: "current" | "ideal" | "model";
  account_value?: number;
  reference_qcode?: string; // required only for ratio_type "current" — proportions only
  // D0-only (qcode absent) — QYE-shaped
  input_mode?: "holdings" | "account_value" | "cash";
  value?: number;
  // real-client only (qcode present)
  amount?: number; // specific-amount deployment, sibling to the always-computed results
  today_pnl?: number; // scoped to additional_cash_required/additional_holdings_required only — see applyTodayPnl
  // shared by both paths
  equity_pct?: number;
  cash_pct?: number;
  lc_pct?: number;
}

export interface QawDeployResult {
  ratio_type: "current" | "ideal" | "model";
  strategy: string;
  account_value: number;
  sleeves: DeploySleeve[]; // Equity - Stock (rollup), Gold, Momentum, Low Vol, Liquidcase, Cash
}

async function resolveQawSubRatios(
  ratio_type: NonNullable<DeployInput["ratio_type"]>,
  strategy: string,
  reference_qcode: string | undefined,
  defaults: Awaited<ReturnType<typeof fetchStrategyDefaults>>,
): Promise<{ gold: number; momentum: number; lowvol: number }> {
  if (ratio_type === "ideal") return QAW_IDEAL_RATIOS;

  if (ratio_type === "model") {
    const gold = defaults.gold_model_pct;
    const momentum = defaults.momentum_model_pct;
    const lowvol = defaults.lowvol_model_pct;
    if (gold == null || momentum == null || lowvol == null) {
      throw new Error(`Model ratios not configured for '${strategy}'`);
    }
    return { gold, momentum, lowvol };
  }

  // "current" — proportions only, from the reference client's own holdings
  if (!reference_qcode) {
    throw new Error("reference_qcode is required for ratio_type 'current'");
  }
  const snapshot = await fetchCashMarginSnapshot(reference_qcode);
  const row = snapshot.strategies.find((r) => r.strategy === strategy);
  if (!row) {
    throw new Error(
      `No active '${strategy}' row found for reference_qcode ${reference_qcode}`,
    );
  }
  if (!row.has_equity_split || row.holdings <= 0) {
    throw new Error(
      `Reference client ${reference_qcode}/${strategy} has no equity split to copy Current ratios from`,
    );
  }
  return {
    gold: row.gold / row.holdings,
    momentum: row.momentum / row.holdings,
    lowvol: row.lowvol / row.holdings,
  };
}

async function computeQawDeploy(
  input: DeployInput,
  defaults: Awaited<ReturnType<typeof fetchStrategyDefaults>>,
): Promise<QawDeployResult> {
  if (!input.ratio_type) {
    throw new Error("ratio_type is required for this strategy");
  }
  if (input.account_value == null) {
    throw new Error("account_value is required for this strategy");
  }

  const equity_pct = input.equity_pct ?? defaults.equity_pct;
  if (equity_pct == null) {
    throw new Error(`equity_pct not configured for '${input.strategy}'`);
  }
  const { cash_pct, lc_pct } = resolveCashLiquidcaseSplit(
    equity_pct,
    defaults.cash_pct,
    input.cash_pct,
    input.lc_pct,
  );

  const subRatios = await resolveQawSubRatios(
    input.ratio_type,
    input.strategy,
    input.reference_qcode,
    defaults,
  );

  const ltps = await fetchLtps([
    ETF_SYMBOLS.gold,
    ETF_SYMBOLS.momentum,
    ETF_SYMBOLS.lowvol,
    ETF_SYMBOLS.liquidcase,
  ]);

  const equityBookValue = input.account_value * equity_pct;
  const liquidcaseValue = input.account_value * lc_pct;
  const cashValue = input.account_value * cash_pct;

  const goldTarget = equityBookValue * subRatios.gold;
  const momentumTarget = equityBookValue * subRatios.momentum;
  const lowvolTarget = equityBookValue * subRatios.lowvol;

  const gold = buildPricedSleeve(
    "Gold",
    subRatios.gold * equity_pct,
    goldTarget,
    ltps.get(ETF_SYMBOLS.gold),
  );
  const momentum = buildPricedSleeve(
    "Momentum",
    subRatios.momentum * equity_pct,
    momentumTarget,
    ltps.get(ETF_SYMBOLS.momentum),
  );
  const lowvol = buildPricedSleeve(
    "Low Vol",
    subRatios.lowvol * equity_pct,
    lowvolTarget,
    ltps.get(ETF_SYMBOLS.lowvol),
  );
  const liquidcase = buildPricedSleeve(
    "Liquidcase",
    lc_pct,
    liquidcaseValue,
    ltps.get(ETF_SYMBOLS.liquidcase),
  );

  // rounding dust swept into Cash — the one row with no unit-size constraint
  const dust = gold.dust + momentum.dust + lowvol.dust + liquidcase.dust;

  const equityRollup: DeploySleeve = {
    particular: "Equity - Stock",
    target_pct: equity_pct,
    target_value: round(equityBookValue, 2)!,
    actual_value: round(equityBookValue, 2)!, // rollup itself is never rounded — only its Gold/Momentum/Low Vol components are
    ltp: null,
    quantity: null,
  };
  const cashTarget = round(cashValue, 2)!;
  const cashSleeve: DeploySleeve = {
    particular: "Cash",
    target_pct: cash_pct,
    target_value: cashTarget, // pure target — same meaning as every other sleeve's target_value
    actual_value: round(cashValue + dust, 2)!, // what Cash genuinely ends up holding, once it absorbs the other sleeves' rounding dust
    ltp: null,
    quantity: null,
  };

  return {
    ratio_type: input.ratio_type,
    strategy: input.strategy,
    account_value: input.account_value,
    sleeves: [
      equityRollup,
      gold.sleeve,
      momentum.sleeve,
      lowvol.sleeve,
      liquidcase.sleeve,
      cashSleeve,
    ],
  };
}

// ── QYE ───────────────────────────────────────────────────────────────────

export interface QyeDeployResult {
  input_mode: "holdings" | "account_value" | "cash";
  strategy: string;
  account_value: number;
  sleeves: DeploySleeve[]; // Holdings (Mutual Funds), Liquidcase, Cash
}

async function computeQyeDeploy(
  input: DeployInput,
  defaults: Awaited<ReturnType<typeof fetchStrategyDefaults>>,
): Promise<QyeDeployResult> {
  if (!input.input_mode) {
    throw new Error("input_mode is required for this strategy");
  }
  if (input.value == null) {
    throw new Error("value is required for this strategy");
  }

  const equity_pct = input.equity_pct ?? defaults.equity_pct;
  if (equity_pct == null) {
    throw new Error(`equity_pct not configured for '${input.strategy}'`);
  }
  const { cash_pct, lc_pct } = resolveCashLiquidcaseSplit(
    equity_pct,
    defaults.cash_pct,
    input.cash_pct,
    input.lc_pct,
  );

  let account_value: number;
  if (input.input_mode === "holdings") {
    account_value = input.value / equity_pct;
  } else if (input.input_mode === "cash") {
    account_value = input.value / cash_pct;
  } else {
    account_value = input.value;
  }

  const ltps = await fetchLtps([ETF_SYMBOLS.liquidcase]);

  const holdingsValue = account_value * equity_pct;
  const liquidcaseValue = account_value * lc_pct;
  const cashValue = account_value * cash_pct;

  const liquidcase = buildPricedSleeve(
    "Liquidcase",
    lc_pct,
    liquidcaseValue,
    ltps.get(ETF_SYMBOLS.liquidcase),
  );

  const holdingsSleeve: DeploySleeve = {
    particular: "Mutual Funds",
    target_pct: equity_pct,
    target_value: round(holdingsValue, 2)!,
    actual_value: round(holdingsValue, 2)!, // no rounding involved for this sleeve — no LTP/quantity constraint
    ltp: null,
    quantity: null,
  };
  const cashTarget = round(cashValue, 2)!;
  const cashSleeve: DeploySleeve = {
    particular: "Cash",
    target_pct: cash_pct,
    target_value: cashTarget, // pure target — same meaning as every other sleeve's target_value
    actual_value: round(cashValue + liquidcase.dust, 2)!, // absorbs Liquidcase's rounding dust
    ltp: null,
    quantity: null,
  };

  return {
    input_mode: input.input_mode,
    strategy: input.strategy,
    account_value: round(account_value, 2)!,
    sleeves: [holdingsSleeve, liquidcase.sleeve, cashSleeve],
  };
}

// ── Real-client scenarios (qcode present) ───────────────────────────────────
// re-derived independently, not ported from reference code

// solve for Account Value at ideal ratio; distinct from row.excess_cash
function computeAdditionalHoldingsGap(
  cashComponent: number,
  accountValue: number,
  derivBookPct: number,
): number {
  return cashComponent / derivBookPct - accountValue;
}

// Scenario 2 — mirror: Holdings fixed, solve for the ideal Cash Component
function computeAdditionalCashRequired(
  holdingsValue: number,
  cashComponent: number,
  eqBookPct: number,
  derivBookPct: number,
): number {
  const idealAccountValue = holdingsValue / eqBookPct;
  const idealCashComponent = idealAccountValue * derivBookPct;
  return idealCashComponent - cashComponent;
}

// manual overlay on Cash only, scoped to Scenario 2/3/5
function applyTodayPnl(
  row: CashMarginSnapshotRow,
  todayPnl: number | undefined,
): CashMarginSnapshotRow {
  if (!todayPnl) return row;
  const account_value = row.account_value + todayPnl;
  const cash = row.cash + todayPnl;
  return {
    ...row,
    account_value,
    cash,
    cash_plus_liquidcase: cash + row.liquidcase,
  };
}

// Console total minus deployed, per symbol; assumes one symbol per strategy
async function resolveUndeployedValue(
  qcode: string,
  strategy: string,
): Promise<number> {
  const [latestConsoleEq, latestConsoleMf, latestBifEq, latestBifMf] =
    await Promise.all([
      prisma.console_equity_holdings.aggregate({
        where: { qcode },
        _max: { date: true },
      }),
      prisma.console_mf_holdings.aggregate({
        where: { qcode },
        _max: { date: true },
      }),
      prisma.bifurcated_equity_holding_test.aggregate({
        where: { qcode, strategy },
        _max: { date: true },
      }),
      prisma.bifurcated_mutual_fund_holding_sheet_test.aggregate({
        where: { qcode, strategy },
        _max: { as_of_date: true },
      }),
    ]);

  const [consoleEq, consoleMf, bifEq, bifMf] = await Promise.all([
    latestConsoleEq._max.date
      ? prisma.console_equity_holdings.findMany({
          where: { qcode, date: latestConsoleEq._max.date },
        })
      : Promise.resolve([]),
    latestConsoleMf._max.date
      ? prisma.console_mf_holdings.findMany({
          where: { qcode, date: latestConsoleMf._max.date },
        })
      : Promise.resolve([]),
    latestBifEq._max.date
      ? prisma.bifurcated_equity_holding_test.findMany({
          where: { qcode, strategy, date: latestBifEq._max.date },
        })
      : Promise.resolve([]),
    latestBifMf._max.as_of_date
      ? prisma.bifurcated_mutual_fund_holding_sheet_test.findMany({
          where: { qcode, strategy, as_of_date: latestBifMf._max.as_of_date },
        })
      : Promise.resolve([]),
  ]);

  const deployedEqBySymbol = new Map(
    bifEq.map((r) => [
      r.symbol,
      { qty: Number(r.quantity ?? 0), ltp: toNum(r.ltp) },
    ]),
  );
  const deployedMfByIsin = new Map(
    bifMf.map((r) => [
      r.isin ?? r.symbol,
      { qty: Number(r.quantity ?? 0), nav: toNum(r.nav) },
    ]),
  );

  let undeployedValue = 0;

  for (const c of consoleEq) {
    // pledged shares ADDITIVE for equity — don't skip collateral_quantity
    const consoleQty =
      (toNum(c.quantity) ?? 0) + (toNum(c.collateral_quantity) ?? 0);
    const deployed = deployedEqBySymbol.get(c.symbol);
    const undeployedQty = Math.max(0, consoleQty - (deployed?.qty ?? 0)); // floored — defensive, not expected in normal operation
    const price = deployed?.ltp ?? toNum(c.last_price) ?? 0;
    undeployedValue += undeployedQty * price;
  }

  for (const c of consoleMf) {
    // pledged units NOT additive for MF — quantity already includes them
    const consoleQty = toNum(c.quantity) ?? 0;
    const deployed = deployedMfByIsin.get(c.isin);
    const undeployedQty = Math.max(0, consoleQty - (deployed?.qty ?? 0));
    const price = deployed?.nav ?? toNum(c.last_price) ?? 0;
    undeployedValue += undeployedQty * price;
  }

  return round(undeployedValue, 2)!;
}

export interface GapDeploymentSleeve {
  particular: string;
  current_value: number;
  addition_target: number; // pure target — how much MORE should be bought
  addition_actual: number; // post-rounding — what will genuinely be bought
  new_value: number; // current_value + addition_actual
  ltp: number | null;
  quantity: number | null; // units being newly bought
}

// QAW only — splits gap across Gold/Momentum/Low Vol; Liquidcase/Cash untouched
async function computeGapSplitQaw(
  row: CashMarginSnapshotRow,
  qcode: string,
  targets: { equity_pct: number; cash_pct: number; lc_pct: number },
  defaults: Awaited<ReturnType<typeof fetchStrategyDefaults>>,
  amountToAdd: number,
  ratio_type: NonNullable<DeployInput["ratio_type"]>,
): Promise<{ new_account_value: number; sleeves: GapDeploymentSleeve[] }> {
  // "current" uses the client's own qcode as reference, same as D0
  const subRatios = await resolveQawSubRatios(
    ratio_type,
    row.strategy,
    qcode,
    defaults,
  );

  const ltps = await fetchLtps([
    ETF_SYMBOLS.gold,
    ETF_SYMBOLS.momentum,
    ETF_SYMBOLS.lowvol,
  ]);

  const buildGapSleeve = (
    particular: string,
    current: number,
    additionTarget: number,
    ltp: number | undefined,
  ): { sleeve: GapDeploymentSleeve; dust: number } => {
    const priced = buildPricedSleeve(particular, 0, additionTarget, ltp);
    return {
      sleeve: {
        particular,
        current_value: round(current, 2)!,
        addition_target: priced.sleeve.target_value,
        addition_actual: priced.sleeve.actual_value,
        new_value: round(current + priced.sleeve.actual_value, 2)!,
        ltp: priced.sleeve.ltp,
        quantity: priced.sleeve.quantity,
      },
      dust: priced.dust,
    };
  };

  const gold = buildGapSleeve(
    "Gold",
    row.gold,
    amountToAdd * subRatios.gold,
    ltps.get(ETF_SYMBOLS.gold),
  );
  const momentum = buildGapSleeve(
    "Momentum",
    row.momentum,
    amountToAdd * subRatios.momentum,
    ltps.get(ETF_SYMBOLS.momentum),
  );
  const lowvol = buildGapSleeve(
    "Low Vol",
    row.lowvol,
    amountToAdd * subRatios.lowvol,
    ltps.get(ETF_SYMBOLS.lowvol),
  );

  const liquidcaseSleeve: GapDeploymentSleeve = {
    particular: "Liquidcase",
    current_value: round(row.liquidcase, 2)!,
    addition_target: 0,
    addition_actual: 0,
    new_value: round(row.liquidcase, 2)!,
    ltp: null,
    quantity: null,
  };
  // flooring remainder swept into Cash so new_account_value reconciles exactly
  const dust = gold.dust + momentum.dust + lowvol.dust;
  const cashSleeve: GapDeploymentSleeve = {
    particular: "Cash",
    current_value: round(row.cash, 2)!,
    addition_target: 0,
    addition_actual: round(dust, 2)!,
    new_value: round(row.cash + dust, 2)!,
    ltp: null,
    quantity: null,
  };

  const actualTotal =
    gold.sleeve.addition_actual +
    momentum.sleeve.addition_actual +
    lowvol.sleeve.addition_actual +
    dust;

  return {
    new_account_value: round(row.account_value + actualTotal, 2)!,
    sleeves: [
      gold.sleeve,
      momentum.sleeve,
      lowvol.sleeve,
      liquidcaseSleeve,
      cashSleeve,
    ],
  };
}

// QYE — single bucket, no LTP (only Liquidcase is ever priced)
function computeGapSplitQye(
  row: CashMarginSnapshotRow,
  amountToAdd: number,
): { new_account_value: number; sleeves: GapDeploymentSleeve[] } {
  const holdingsSleeve: GapDeploymentSleeve = {
    particular: "Mutual Funds",
    current_value: round(row.mutual_funds, 2)!,
    addition_target: round(amountToAdd, 2)!,
    addition_actual: round(amountToAdd, 2)!,
    new_value: round(row.mutual_funds + amountToAdd, 2)!,
    ltp: null,
    quantity: null,
  };
  const liquidcaseSleeve: GapDeploymentSleeve = {
    particular: "Liquidcase",
    current_value: round(row.liquidcase, 2)!,
    addition_target: 0,
    addition_actual: 0,
    new_value: round(row.liquidcase, 2)!,
    ltp: null,
    quantity: null,
  };
  const cashSleeve: GapDeploymentSleeve = {
    particular: "Cash",
    current_value: round(row.cash, 2)!,
    addition_target: 0,
    addition_actual: 0,
    new_value: round(row.cash, 2)!,
    ltp: null,
    quantity: null,
  };

  return {
    new_account_value: round(row.account_value + amountToAdd, 2)!,
    sleeves: [holdingsSleeve, liquidcaseSleeve, cashSleeve],
  };
}

// ── Excess Cash Deployment — genuinely different mechanism from the gap
// Account Value stays fixed — Cash snaps to target, Liquidcase is the plug
function computeExcessCashAvailable(
  accountValue: number,
  holdings: number,
  equityPct: number,
): number {
  return accountValue * equityPct - holdings;
}

async function computeExcessCashSplitQaw(
  row: CashMarginSnapshotRow,
  qcode: string,
  targets: { equity_pct: number; cash_pct: number; lc_pct: number },
  defaults: Awaited<ReturnType<typeof fetchStrategyDefaults>>,
  amountDeployed: number,
  ratio_type: NonNullable<DeployInput["ratio_type"]>,
): Promise<{ sleeves: GapDeploymentSleeve[] }> {
  const subRatios = await resolveQawSubRatios(
    ratio_type,
    row.strategy,
    qcode,
    defaults,
  );
  const ltps = await fetchLtps([
    ETF_SYMBOLS.gold,
    ETF_SYMBOLS.momentum,
    ETF_SYMBOLS.lowvol,
    ETF_SYMBOLS.liquidcase,
  ]);

  const buildEquitySleeve = (
    particular: string,
    current: number,
    target: number,
    ltp: number | undefined,
  ) => {
    const priced = buildPricedSleeve(particular, 0, target, ltp);
    const sleeve: GapDeploymentSleeve = {
      particular,
      current_value: round(current, 2)!,
      addition_target: priced.sleeve.target_value,
      addition_actual: priced.sleeve.actual_value,
      new_value: round(current + priced.sleeve.actual_value, 2)!,
      ltp: priced.sleeve.ltp,
      quantity: priced.sleeve.quantity,
    };
    return { sleeve, target: priced.sleeve.target_value };
  };

  const gold = buildEquitySleeve(
    "Gold",
    row.gold,
    amountDeployed * subRatios.gold,
    ltps.get(ETF_SYMBOLS.gold),
  );
  const momentum = buildEquitySleeve(
    "Momentum",
    row.momentum,
    amountDeployed * subRatios.momentum,
    ltps.get(ETF_SYMBOLS.momentum),
  );
  const lowvol = buildEquitySleeve(
    "Low Vol",
    row.lowvol,
    amountDeployed * subRatios.lowvol,
    ltps.get(ETF_SYMBOLS.lowvol),
  );
  // target vs actual kept separate — using actual for both leaked dust into addition_target
  const targetEquityTotal = gold.target + momentum.target + lowvol.target;
  const actualEquityTotal =
    gold.sleeve.addition_actual +
    momentum.sleeve.addition_actual +
    lowvol.sleeve.addition_actual;

  // Liquidcase priced via LTP too, matching specific_deployment; Cash absorbs its dust
  const newCashSnapped = targets.cash_pct * row.account_value;
  const cashChangeTarget = newCashSnapped - row.cash;
  const liquidcaseChangeTarget = -(targetEquityTotal + cashChangeTarget); // pure — for display only
  const liquidcaseReconcileTarget = -(actualEquityTotal + cashChangeTarget); // what actually gets floored/transacted
  const lcPriced = buildPricedSleeve(
    "Liquidcase",
    0,
    liquidcaseReconcileTarget,
    ltps.get(ETF_SYMBOLS.liquidcase),
  );
  const liquidcaseChangeActual = lcPriced.sleeve.actual_value;
  const liquidcaseDust = lcPriced.dust;
  const cashChangeActual = cashChangeTarget + liquidcaseDust;

  const liquidcaseSleeve: GapDeploymentSleeve = {
    particular: "Liquidcase",
    current_value: round(row.liquidcase, 2)!,
    addition_target: round(liquidcaseChangeTarget, 2)!,
    addition_actual: round(liquidcaseChangeActual, 2)!,
    new_value: round(row.liquidcase + liquidcaseChangeActual, 2)!,
    ltp: lcPriced.sleeve.ltp,
    quantity: lcPriced.sleeve.quantity,
  };
  const cashSleeve: GapDeploymentSleeve = {
    particular: "Cash",
    current_value: round(row.cash, 2)!,
    addition_target: round(cashChangeTarget, 2)!,
    addition_actual: round(cashChangeActual, 2)!,
    new_value: round(row.cash + cashChangeActual, 2)!,
    ltp: null,
    quantity: null,
  };

  return {
    sleeves: [
      gold.sleeve,
      momentum.sleeve,
      lowvol.sleeve,
      liquidcaseSleeve,
      cashSleeve,
    ],
  };
}

async function computeExcessCashSplitQye(
  row: CashMarginSnapshotRow,
  targets: { cash_pct: number },
  amountDeployed: number,
): Promise<{ sleeves: GapDeploymentSleeve[] }> {
  const ltps = await fetchLtps([ETF_SYMBOLS.liquidcase]);

  const holdingsSleeve: GapDeploymentSleeve = {
    particular: "Mutual Funds",
    current_value: round(row.mutual_funds, 2)!,
    addition_target: round(amountDeployed, 2)!,
    addition_actual: round(amountDeployed, 2)!,
    new_value: round(row.mutual_funds + amountDeployed, 2)!,
    ltp: null,
    quantity: null,
  };

  const newCashSnapped = targets.cash_pct * row.account_value;
  const cashChangeTarget = newCashSnapped - row.cash;
  const liquidcaseChangeTarget = -(amountDeployed + cashChangeTarget);
  const lcPriced = buildPricedSleeve(
    "Liquidcase",
    0,
    liquidcaseChangeTarget,
    ltps.get(ETF_SYMBOLS.liquidcase),
  );
  const liquidcaseChangeActual = lcPriced.sleeve.actual_value;
  const cashChangeActual = cashChangeTarget + lcPriced.dust;

  const liquidcaseSleeve: GapDeploymentSleeve = {
    particular: "Liquidcase",
    current_value: round(row.liquidcase, 2)!,
    addition_target: round(liquidcaseChangeTarget, 2)!,
    addition_actual: round(liquidcaseChangeActual, 2)!,
    new_value: round(row.liquidcase + liquidcaseChangeActual, 2)!,
    ltp: lcPriced.sleeve.ltp,
    quantity: lcPriced.sleeve.quantity,
  };
  const cashSleeve: GapDeploymentSleeve = {
    particular: "Cash",
    current_value: round(row.cash, 2)!,
    addition_target: round(cashChangeTarget, 2)!,
    addition_actual: round(cashChangeActual, 2)!,
    new_value: round(row.cash + cashChangeActual, 2)!,
    ltp: null,
    quantity: null,
  };

  return { sleeves: [holdingsSleeve, liquidcaseSleeve, cashSleeve] };
}

// ── Specific Deployment — FIXED. Was wrongly reusing the gap-split
// splits Eq Book/Deriv Book by equity_pct; Liquidcase/Cash share Deriv Book by their own ratio
async function computeSpecificDeploymentQaw(
  row: CashMarginSnapshotRow,
  qcode: string,
  targets: { equity_pct: number; cash_pct: number; lc_pct: number },
  defaults: Awaited<ReturnType<typeof fetchStrategyDefaults>>,
  amount: number,
  ratio_type: NonNullable<DeployInput["ratio_type"]>,
): Promise<{
  eq_book_amount: number;
  deriv_book_amount: number;
  new_account_value: number;
  sleeves: GapDeploymentSleeve[];
}> {
  const eqBookAmount = amount * targets.equity_pct;
  const derivBookAmount = amount * (1 - targets.equity_pct);

  const subRatios = await resolveQawSubRatios(
    ratio_type,
    row.strategy,
    qcode,
    defaults,
  );
  const ltps = await fetchLtps([
    ETF_SYMBOLS.gold,
    ETF_SYMBOLS.momentum,
    ETF_SYMBOLS.lowvol,
    ETF_SYMBOLS.liquidcase,
  ]);

  const buildSleeve = (
    particular: string,
    current: number,
    target: number,
    ltp: number | undefined,
  ) => {
    const priced = buildPricedSleeve(particular, 0, target, ltp);
    const sleeve: GapDeploymentSleeve = {
      particular,
      current_value: round(current, 2)!,
      addition_target: priced.sleeve.target_value,
      addition_actual: priced.sleeve.actual_value,
      new_value: round(current + priced.sleeve.actual_value, 2)!,
      ltp: priced.sleeve.ltp,
      quantity: priced.sleeve.quantity,
    };
    return { sleeve, dust: priced.dust };
  };

  const gold = buildSleeve(
    "Gold",
    row.gold,
    eqBookAmount * subRatios.gold,
    ltps.get(ETF_SYMBOLS.gold),
  );
  const momentum = buildSleeve(
    "Momentum",
    row.momentum,
    eqBookAmount * subRatios.momentum,
    ltps.get(ETF_SYMBOLS.momentum),
  );
  const lowvol = buildSleeve(
    "Low Vol",
    row.lowvol,
    eqBookAmount * subRatios.lowvol,
    ltps.get(ETF_SYMBOLS.lowvol),
  );

  const lcTarget =
    derivBookAmount * (targets.lc_pct / (targets.lc_pct + targets.cash_pct));
  const cashTarget =
    derivBookAmount * (targets.cash_pct / (targets.lc_pct + targets.cash_pct));
  const lc = buildSleeve(
    "Liquidcase",
    row.liquidcase,
    lcTarget,
    ltps.get(ETF_SYMBOLS.liquidcase),
  );

  // dust from every priced sleeve swept into Cash, the one unpriced bucket
  const dust = gold.dust + momentum.dust + lowvol.dust + lc.dust;
  const cashActual = round(cashTarget + dust, 2)!;
  const cashSleeve: GapDeploymentSleeve = {
    particular: "Cash",
    current_value: round(row.cash, 2)!,
    addition_target: round(cashTarget, 2)!,
    addition_actual: cashActual,
    new_value: round(row.cash + cashActual, 2)!,
    ltp: null,
    quantity: null,
  };

  const actualTotal =
    gold.sleeve.addition_actual +
    momentum.sleeve.addition_actual +
    lowvol.sleeve.addition_actual +
    lc.sleeve.addition_actual +
    cashActual;

  return {
    eq_book_amount: round(eqBookAmount, 2)!,
    deriv_book_amount: round(derivBookAmount, 2)!,
    new_account_value: round(row.account_value + actualTotal, 2)!,
    sleeves: [
      gold.sleeve,
      momentum.sleeve,
      lowvol.sleeve,
      lc.sleeve,
      cashSleeve,
    ],
  };
}

async function computeSpecificDeploymentQye(
  row: CashMarginSnapshotRow,
  targets: { equity_pct: number; cash_pct: number; lc_pct: number },
  amount: number,
): Promise<{
  eq_book_amount: null;
  deriv_book_amount: null;
  new_account_value: number;
  sleeves: GapDeploymentSleeve[];
}> {
  const eqBookAmount = amount * targets.equity_pct;
  const derivBookAmount = amount * (1 - targets.equity_pct);
  const lcTarget =
    derivBookAmount * (targets.lc_pct / (targets.lc_pct + targets.cash_pct));
  const cashTarget =
    derivBookAmount * (targets.cash_pct / (targets.lc_pct + targets.cash_pct));

  const holdingsSleeve: GapDeploymentSleeve = {
    particular: "Mutual Funds",
    current_value: round(row.mutual_funds, 2)!,
    addition_target: round(eqBookAmount, 2)!,
    addition_actual: round(eqBookAmount, 2)!,
    new_value: round(row.mutual_funds + eqBookAmount, 2)!,
    ltp: null,
    quantity: null,
  };

  // Liquidcase priced via LTP too, dust swept into Cash
  const ltps = await fetchLtps([ETF_SYMBOLS.liquidcase]);
  const lcPriced = buildPricedSleeve(
    "Liquidcase",
    0,
    lcTarget,
    ltps.get(ETF_SYMBOLS.liquidcase),
  );
  const liquidcaseSleeve: GapDeploymentSleeve = {
    particular: "Liquidcase",
    current_value: round(row.liquidcase, 2)!,
    addition_target: lcPriced.sleeve.target_value,
    addition_actual: lcPriced.sleeve.actual_value,
    new_value: round(row.liquidcase + lcPriced.sleeve.actual_value, 2)!,
    ltp: lcPriced.sleeve.ltp,
    quantity: lcPriced.sleeve.quantity,
  };

  const cashActual = round(cashTarget + lcPriced.dust, 2)!;
  const cashSleeve: GapDeploymentSleeve = {
    particular: "Cash",
    current_value: round(row.cash, 2)!,
    addition_target: round(cashTarget, 2)!,
    addition_actual: cashActual,
    new_value: round(row.cash + cashActual, 2)!,
    ltp: null,
    quantity: null,
  };

  const actualTotal = eqBookAmount + lcPriced.sleeve.actual_value + cashActual;

  return {
    eq_book_amount: null,
    deriv_book_amount: null,
    new_account_value: round(row.account_value + actualTotal, 2)!,
    sleeves: [holdingsSleeve, liquidcaseSleeve, cashSleeve],
  };
}

// ── D6 — Buy Liquid Case from Excess Cash. Never built before now. Cash
// D6 — Cash snaps to ideal, Liquidcase absorbs the diff; Holdings/AV untouched
async function computeLiquidCaseFromExcessCash(
  row: CashMarginSnapshotRow,
  cashPct: number,
): Promise<{
  ideal_cash: number;
  excess_cash_over_ideal: number;
  blocked: boolean;
  sleeves: GapDeploymentSleeve[];
}> {
  const idealCash = row.account_value * cashPct;
  const excessOverIdeal = round(row.cash - idealCash, 2)!;

  // action request — "nothing to move" is a hard stop here, unlike Scenario 2/3
  if (excessOverIdeal <= 0) {
    return {
      ideal_cash: round(idealCash, 2)!,
      excess_cash_over_ideal: excessOverIdeal,
      blocked: true,
      sleeves: [],
    };
  }

  const ltps = await fetchLtps([ETF_SYMBOLS.liquidcase]);
  const lcPriced = buildPricedSleeve(
    "Liquidcase",
    0,
    excessOverIdeal,
    ltps.get(ETF_SYMBOLS.liquidcase),
  );
  const liquidcaseActual = lcPriced.sleeve.actual_value;
  // dust from Liquidcase's own flooring swept into Cash, same convention as everywhere else
  const cashActual = -excessOverIdeal + lcPriced.dust;

  const liquidcaseSleeve: GapDeploymentSleeve = {
    particular: "Liquidcase",
    current_value: round(row.liquidcase, 2)!,
    addition_target: round(excessOverIdeal, 2)!,
    addition_actual: round(liquidcaseActual, 2)!,
    new_value: round(row.liquidcase + liquidcaseActual, 2)!,
    ltp: lcPriced.sleeve.ltp,
    quantity: lcPriced.sleeve.quantity,
  };
  const cashSleeve: GapDeploymentSleeve = {
    particular: "Cash",
    current_value: round(row.cash, 2)!,
    addition_target: round(-excessOverIdeal, 2)!,
    addition_actual: round(cashActual, 2)!,
    new_value: round(row.cash + cashActual, 2)!,
    ltp: null,
    quantity: null,
  };

  return {
    ideal_cash: round(idealCash, 2)!,
    excess_cash_over_ideal: excessOverIdeal,
    blocked: false,
    sleeves: [liquidcaseSleeve, cashSleeve],
  };
}

export interface AdditionalCashRequiredResult {
  ideal_account_value: number;
  additional_cash_required: number; // negative = already above ideal — shown plainly, never blocked
  // Liquidcase/Cash can move opposite directions — the aggregate alone hides that
  liquidcase_ideal: number;
  liquidcase_inflow: number; // negative = already above ideal
  cash_ideal: number;
  cash_inflow: number; // negative = already above ideal
}

export interface AdditionalHoldingsRequiredResult {
  gap: number; // negative = a reduction, not blocked
  ratio_type: "current" | "ideal" | "model" | null; // null for QYE — no ratio choice
  new_account_value: number;
  sleeves: GapDeploymentSleeve[];
  // QYE only; always computed even on a negative gap
  undeployed_stock_value: number | null;
  stock_deployed: number | null;
  remaining_gap_after_stock: number | null;
}

export interface SpecificDeploymentResult {
  amount: number;
  ratio_type: "current" | "ideal" | "model" | null;
  eq_book_amount: number | null; // null for QYE — no separate eq/deriv book split label, Holdings IS the eq book
  deriv_book_amount: number | null;
  new_account_value: number;
  sleeves: GapDeploymentSleeve[];
}

export interface ExcessCashDeploymentResult {
  // Account Value never changes here — money moves Liquidcase/Cash into equity
  amount_available: number;
  // blocks when nothing's available — action request, not a diagnostic
  blocked: boolean;
  ratio_type: "current" | "ideal" | "model" | null;
  full: { amount_deployed: number; sleeves: GapDeploymentSleeve[] } | null;
  // populated only when `amount` is given and not blocked
  partial: {
    amount_deployed: number;
    capped: boolean;
    sleeves: GapDeploymentSleeve[];
  } | null;
}

export interface LiquidCaseFromExcessCashResult {
  // D6 — Cash snaps to ideal, Liquidcase absorbs the diff; Holdings/AV untouched
  ideal_cash: number;
  excess_cash_over_ideal: number; // negative = Cash is already below ideal, shown plainly
  blocked: boolean; // action request — true and sleeves empty when there's nothing to move
  sleeves: GapDeploymentSleeve[]; // Liquidcase + Cash only — Holdings isn't included since it never moves
}

export interface RealClientDeployResult {
  snapshot: CashMarginSnapshotRow; // current real state, as fetched — never reflects today_pnl, see applyTodayPnl
  additional_cash_required: AdditionalCashRequiredResult;
  // null for QAW when ratio_type wasn't given — skips just this section
  additional_holdings_required: AdditionalHoldingsRequiredResult | null;
  excess_cash_deployment: ExcessCashDeploymentResult;
  liquid_case_from_excess_cash: LiquidCaseFromExcessCashResult;
  specific_deployment: SpecificDeploymentResult | null; // only when amount is given
}

async function computeRealClientDeploy(
  input: DeployInput,
  has_equity_split: boolean,
  defaults: Awaited<ReturnType<typeof fetchStrategyDefaults>>,
): Promise<RealClientDeployResult> {
  const qcode = input.qcode!;
  const snapshot = await fetchCashMarginSnapshot(qcode);
  const row = snapshot.strategies.find((r) => r.strategy === input.strategy);
  if (!row) {
    throw new Error(`No active '${input.strategy}' row found for ${qcode}`);
  }

  const equity_pct = input.equity_pct ?? defaults.equity_pct;
  if (equity_pct == null) {
    throw new Error(`equity_pct not configured for '${input.strategy}'`);
  }
  const { cash_pct, lc_pct } = resolveCashLiquidcaseSplit(
    equity_pct,
    defaults.cash_pct,
    input.cash_pct,
    input.lc_pct,
  );
  const derivBookPct = cash_pct + lc_pct; // = 1 - equity_pct, resolved consistently with everything else in this file
  const targets = { equity_pct, cash_pct, lc_pct };

  // today_pnl scoped to Scenario 2/3/5 only
  const pnlRow = applyTodayPnl(row, input.today_pnl);
  const pnlCashComponent = pnlRow.cash + pnlRow.liquidcase;

  // Scenario 2 — always computed; per-bucket since Liquidcase/Cash can move opposite ways
  const idealAccountValue = pnlRow.holdings / equity_pct;
  const additionalCashRequired = computeAdditionalCashRequired(
    pnlRow.holdings,
    pnlCashComponent,
    equity_pct,
    derivBookPct,
  );
  const liquidcaseIdeal = idealAccountValue * lc_pct;
  const cashIdeal = idealAccountValue * cash_pct;
  const additional_cash_required: AdditionalCashRequiredResult = {
    ideal_account_value: round(idealAccountValue, 2)!,
    additional_cash_required: round(additionalCashRequired, 2)!,
    liquidcase_ideal: round(liquidcaseIdeal, 2)!,
    liquidcase_inflow: round(liquidcaseIdeal - pnlRow.liquidcase, 2)!,
    cash_ideal: round(cashIdeal, 2)!,
    cash_inflow: round(cashIdeal - pnlRow.cash, 2)!,
  };

  // Scenario 3/5 — never blocked; a negative gap is a reduction, not an error
  const gap = computeAdditionalHoldingsGap(
    pnlCashComponent,
    pnlRow.account_value,
    derivBookPct,
  );

  let additional_holdings_required: AdditionalHoldingsRequiredResult | null;
  if (has_equity_split && !input.ratio_type) {
    additional_holdings_required = null;
  } else if (has_equity_split) {
    const split = await computeGapSplitQaw(
      pnlRow,
      qcode,
      targets,
      defaults,
      gap,
      input.ratio_type!,
    );
    additional_holdings_required = {
      gap: round(gap, 2)!,
      ratio_type: input.ratio_type!,
      new_account_value: split.new_account_value,
      sleeves: split.sleeves,
      undeployed_stock_value: null,
      stock_deployed: null,
      remaining_gap_after_stock: null,
    };
  } else {
    // only Scenario 5's fields clamp at 0; the split below shows the real signed reduction
    const split = computeGapSplitQye(pnlRow, gap);
    // undeployed_stock_value is unconditional; only stock_deployed depends on sign
    const undeployedStockValue = await resolveUndeployedValue(
      qcode,
      input.strategy,
    );
    const stockDeployed = gap <= 0 ? 0 : Math.min(undeployedStockValue, gap);
    const remainingGap = gap - stockDeployed;
    additional_holdings_required = {
      gap: round(gap, 2)!,
      ratio_type: null,
      new_account_value: split.new_account_value,
      sleeves: split.sleeves,
      undeployed_stock_value: round(undeployedStockValue, 2)!,
      stock_deployed: round(stockDeployed, 2)!,
      remaining_gap_after_stock: round(remainingGap, 2)!,
    };
  }

  // uses the raw (non-P&L) row; blocks entirely when nothing's available
  const excessCashAvailable = computeExcessCashAvailable(
    row.account_value,
    row.holdings,
    equity_pct,
  );
  const excessCashBlocked = excessCashAvailable <= 0;
  let excess_cash_deployment: ExcessCashDeploymentResult;
  if (excessCashBlocked) {
    excess_cash_deployment = {
      amount_available: round(excessCashAvailable, 2)!,
      blocked: true,
      ratio_type: has_equity_split ? (input.ratio_type ?? null) : null,
      full: null,
      partial: null,
    };
  } else if (has_equity_split && !input.ratio_type) {
    // no ratio_type — amount_available still shown, only the split is skipped
    excess_cash_deployment = {
      amount_available: round(excessCashAvailable, 2)!,
      blocked: false,
      ratio_type: null,
      full: null,
      partial: null,
    };
  } else if (has_equity_split) {
    const full = await computeExcessCashSplitQaw(
      row,
      qcode,
      targets,
      defaults,
      excessCashAvailable,
      input.ratio_type!,
    );
    let partial: ExcessCashDeploymentResult["partial"] = null;
    if (input.amount != null) {
      const capped = input.amount > excessCashAvailable;
      const amountDeployed = capped ? excessCashAvailable : input.amount;
      const partialSplit = await computeExcessCashSplitQaw(
        row,
        qcode,
        targets,
        defaults,
        amountDeployed,
        input.ratio_type!,
      );
      partial = {
        amount_deployed: round(amountDeployed, 2)!,
        capped,
        sleeves: partialSplit.sleeves,
      };
    }
    excess_cash_deployment = {
      amount_available: round(excessCashAvailable, 2)!,
      blocked: false,
      ratio_type: input.ratio_type!,
      full: {
        amount_deployed: round(excessCashAvailable, 2)!,
        sleeves: full.sleeves,
      },
      partial,
    };
  } else {
    const full = await computeExcessCashSplitQye(
      row,
      targets,
      excessCashAvailable,
    );
    let partial: ExcessCashDeploymentResult["partial"] = null;
    if (input.amount != null) {
      const capped = input.amount > excessCashAvailable;
      const amountDeployed = capped ? excessCashAvailable : input.amount;
      const partialSplit = await computeExcessCashSplitQye(
        row,
        targets,
        amountDeployed,
      );
      partial = {
        amount_deployed: round(amountDeployed, 2)!,
        capped,
        sleeves: partialSplit.sleeves,
      };
    }
    excess_cash_deployment = {
      amount_available: round(excessCashAvailable, 2)!,
      blocked: false,
      ratio_type: null,
      full: {
        amount_deployed: round(excessCashAvailable, 2)!,
        sleeves: full.sleeves,
      },
      partial,
    };
  }

  // D6 — Buy Liquid Case from Excess Cash. Never touches Holdings, so QAW/QYE share one function.
  const liquid_case_from_excess_cash = await computeLiquidCaseFromExcessCash(
    row,
    cash_pct,
  );

  // FIXED to use the real Eq Book/Deriv Book split (was 100% into equity)
  let specific_deployment: SpecificDeploymentResult | null = null;
  if (input.amount != null) {
    if (has_equity_split && input.ratio_type) {
      const split = await computeSpecificDeploymentQaw(
        row,
        qcode,
        targets,
        defaults,
        input.amount,
        input.ratio_type,
      );
      specific_deployment = {
        amount: input.amount,
        ratio_type: input.ratio_type,
        eq_book_amount: split.eq_book_amount,
        deriv_book_amount: split.deriv_book_amount,
        new_account_value: split.new_account_value,
        sleeves: split.sleeves,
      };
    } else if (!has_equity_split) {
      const split = await computeSpecificDeploymentQye(
        row,
        targets,
        input.amount,
      );
      specific_deployment = {
        amount: input.amount,
        ratio_type: null,
        eq_book_amount: split.eq_book_amount,
        deriv_book_amount: split.deriv_book_amount,
        new_account_value: split.new_account_value,
        sleeves: split.sleeves,
      };
    }
  }

  return {
    snapshot: row,
    additional_cash_required,
    additional_holdings_required,
    excess_cash_deployment,
    liquid_case_from_excess_cash,
    specific_deployment,
  };
}

// ── unified entry point — one route, no scenario-name field anywhere.
// qcode presence picks D0 vs real-client; has_equity_split picks QAW vs QYE
export async function computeDeploy(
  input: DeployInput,
): Promise<QawDeployResult | QyeDeployResult | RealClientDeployResult> {
  const defaults = await fetchStrategyDefaults(input.strategy);
  const has_equity_split = defaults.gold_pct != null;

  if (input.qcode) {
    return computeRealClientDeploy(input, has_equity_split, defaults);
  }

  return has_equity_split
    ? computeQawDeploy(input, defaults)
    : computeQyeDeploy(input, defaults);
}
