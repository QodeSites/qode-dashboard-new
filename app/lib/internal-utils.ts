import { prisma } from "@/lib/prisma";

// ── Types ──────────────────────────────────────────────────────────────────

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

// ── DB ─────────────────────────────────────────────────────────────────────

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

// ── Math helpers ────────────────────────────────────────────────────────────

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

// ── Core metrics ────────────────────────────────────────────────────────────

export function calcSinceInception(nav: NavPoint[]): number | null {
  if (nav.length < 2) return null;
  const days =
    (nav[nav.length - 1].date.getTime() - nav[0].date.getTime()) / MS;
  // true inception has no prior day (null) — 100 is the indexed starting point.
  // a windowed start_date does have a real prior day; use it as the base
  // instead, same fallback calcMonthlyReturns already uses for its first bucket
  const baseNav =
    nav[0].prev_nav != null && nav[0].prev_nav > 0 ? nav[0].prev_nav : 100;
  const startNav = nav[0].nav;
  const endNav = nav[nav.length - 1].nav;
  if (endNav <= 0 || startNav <= 0 || days <= 0) return null;
  // < 365 days: simple return from baseNav
  // >= 365 days: CAGR using actual first recorded NAV
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

// raw price fetch only — no metrics math, so it can be shared across many
// clients' date ranges with a single external call instead of one per client
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

// pure — slices/derives metrics for one [startDate, endDate] window from an
// already-fetched raw series, so N clients only cost 1 external fetch total
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
      drawdown: round(dd, 4),
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
  effective_to: string | null;
}

interface SeriesPoint {
  date: string;
  value: number;
}

function toNum(v: unknown): number | null {
  return v != null ? Number(v) : null;
}

// one row per (qcode, strategy), latest config revision wins.
// suffixField picks which tag family: exposure (AUM) or profit (NAV/returns).
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
      effective_to: c.effective_to
        ? c.effective_to.toISOString().split("T")[0]
        : null,
    });
  }
  return [...map.values()];
}

// carry-forward sum across N series onto a shared date axis — single pass.
// each series stops contributing once `d` passes its own `until` (if set) —
// prevents lapsed/switched strategies from being counted forever. `dates` is
// shared across all callers so a strategy with no currently active clients
// still resolves to 0 today instead of freezing at its last real value.
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

// drop the trailing zero run once a strategy has no active clients left —
// keeps the real history, cuts the redundant "still 0" repeats out to today
function trimTrailingZeros(series: AumPoint[]): AumPoint[] {
  let end = series.length;
  while (end > 0 && series[end - 1].aum === 0) end--;
  return series.slice(0, end);
}

// drop the leading zero run before a strategy's first real client — same no-signal
// padding as the trailing case, just mirrored at the start of the array
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

  // shared axis so every strategy resolves to 0 (not a frozen stale value) once its clients lapse
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

// resolves payload override → global_config, no hardcoded fallback — shared
// by every route that needs an rfr instead of each duplicating the lookup
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

// top-level query window — distinct from each row's own end_date (that
// client-strategy pair's own effective_to, unrelated to the request filter)
export interface StrategyBreakupResult {
  start_date: string | null;
  end_date: string;
  clients: StrategyBreakupRow[];
}

// batched nav/prev_nav/drawdown/pnl fetch for any list of (qcode, tag) pairs —
// same unnest-join pattern as Portfolio Summary, one round trip total
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

// parses an optional "YYYY-MM-DD" date — undefined if omitted, null if invalid.
// shared by start_date and end_date on every endpoint below
export function parseOptionalDate(input?: string): Date | null | undefined {
  if (!input) return undefined;
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

// month-end value per calendar bucket, keyed by "YYYY-MM" — lets portfolio and
// benchmark monthly returns be aligned by actual calendar month rather than by
// position, which avoids misalignment when the two series start on different days
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

// benchmark-relative ratios not covered by calcRatios — monthly basis, since
// Capture Ratios above has no daily equivalent and these pair naturally with it
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

    // Sharpe/Sortino/Calmar/Vol reuse the existing daily-basis calcRatios —
    // keeps this tab consistent with Client Dashboards (see commit discussion)
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

// fixed instrument-category tag suffixes — these describe what bifurcation
// always produces, not a per-client business setting, so unlike
// exposure/profit tags they aren't sourced from client_strategy_configs
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
    });
  }
  return result;
}

// latest portfolio_value per (qcode, tag) across every client × every tag
// (total + 7 components) in one query — DISTINCT ON, no history fetched,
// since this endpoint is a point-in-time snapshot, not a time series
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

    // gate purely on resolved config — never a strategy-name check. A strategy
    // whose gold/lowvol/momentum split isn't defined (client override AND
    // strategy_defaults both null) simply has no equity sub-breakdown to show.
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

  // build every (qcode, tag) this response could possibly need, once, so the
  // NAV fetch is a single batched round trip regardless of section count
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

// per-day nav ratio — same formula calcMonthlyReturns chains across a month,
// applied to a single day instead
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

  // dedupe requested selections before the unnest join — same lesson as
  // computeCompare's duplication fix, applied here proactively
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

// every COMPLETED run, newest first — cached briefly; a stale cache on a
// transient fetch failure beats returning nothing
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

// one option's full combined-metrics payload — immutable once COMPLETED, so
// this sits in cache far longer than the run-id list above
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

// tries every COMPLETED run newest-first for this option, stopping at the
// first one with usable data — a bad/incomplete latest run for one option
// doesn't have to sink that option for the whole request
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

// client's own strategy field -> research dashboard's scheme option. QTF has
// no scheme here at all — absent on purpose, any QTF tag just finds nothing
const SCHEME_OPTION: Record<string, string> = {
  "QAW+": "qaw_plus",
  "QAW++": "qaw_plus_plus",
  "QYE+": "qye_plus",
  "QYE++": "qye_plus_plus",
};

// mastersheet tag -> where its curve lives inside a scheme's combined-metrics
// payload. Locked in against Cross_check.xlsx + the real response: PSAR/BTST's
// ALL-tab curves are columns in the scheme-level nav_curve, not a nested
// psar.nav_curve/btst.nav_curve — that nested path doesn't exist in the data
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

// bare tags with NO scheme prefix (a client running the strategy directly,
// not bifurcated under QAW/QYE) — Section 3's standalone options
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

// pulls the raw {date, nav} pairs a tag's source points at, out of an
// already-fetched scheme payload — no network I/O here
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

  // dedupe before querying — a repeated pair would otherwise double-match
  // rows in fetchBulkNavSeries' unnest join, corrupting that series with
  // doubled NAV points, not just wasting a redundant compute pass
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

  // overview card per unique pair: rebased at THAT pair's own start — cached
  // so a repeated pair reuses this instead of re-slicing the raw series
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

  // rebuild in the ORIGINAL request order/count — duplicates in the request
  // still get one result entry each, just reusing the cached computation
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
  // like Nifty. Selections sharing a tag merge into a single curve rebased
  // at the earliest of their starts; different tags never merge, even if
  // one client's start is earlier than another's for a different tag
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
      // one combined-metrics fetch (with fallback) per distinct scheme,
      // reused across every tag group that scheme covers
      const schemeCache = new Map<string, any | null>();
      for (const [systemTag, members] of tagGroups) {
        const trimmed = systemTag.trim();
        const spaceIdx = trimmed.indexOf(" ");

        let option: string | undefined;
        let source: BacktestSource | undefined;
        if (spaceIdx === -1) {
          // no scheme prefix — a client running the strategy directly, not
          // bifurcated under QAW/QYE. Section 3's standalone option, Compounded tab
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

// distinct tags for a qcode + strategy. "combined" mirrors fetchTagData's
// combined branch — tags matching none of the client's known strategy prefixes
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
