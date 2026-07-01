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
  series: { date: string; nav: number }[];
}

// ── DB ─────────────────────────────────────────────────────────────────────

// Fetch summary (non-numbered) tags filtered by strategy or combined view
export async function fetchTagData(
  qcode: string,
  strategy: string, // strategy name e.g. "QYE++" or "combined"
  allPrefixes: string[], // all known strategy prefixes for this client
): Promise<Record<string, NavPoint[]>> {
  let rows: any[];

  if (strategy === "combined") {
    if (allPrefixes.length === 0) {
      rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT system_tag, date, nav, prev_nav, drawdown, pnl, portfolio_value
         FROM bifurcated_master_sheet_test
         WHERE qcode = $1 AND nav IS NOT NULL
         ORDER BY system_tag, date ASC`,
        qcode,
      );
    } else {
      const excludes = allPrefixes
        .map((_, i) => `system_tag NOT LIKE $${i + 2}`)
        .join(" AND ");
      rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT system_tag, date, nav, prev_nav, drawdown, pnl, portfolio_value
         FROM bifurcated_master_sheet_test
         WHERE qcode = $1 AND nav IS NOT NULL AND ${excludes}
         ORDER BY system_tag, date ASC`,
        qcode,
        ...allPrefixes.map((p) => `${p} %`),
      );
    }
  } else {
    rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT system_tag, date, nav, prev_nav, drawdown, pnl, portfolio_value
       FROM bifurcated_master_sheet_test
       WHERE qcode = $1 AND nav IS NOT NULL
         AND system_tag LIKE $2
       ORDER BY system_tag, date ASC`,
      qcode,
      `${strategy} %`,
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
  const startNav = nav[0].nav;
  const endNav = nav[nav.length - 1].nav;
  if (endNav <= 0 || startNav <= 0 || days <= 0) return null;
  // < 365 days: simple return from base 100 (NAV is indexed to 100 at inception)
  // >= 365 days: CAGR using actual first recorded NAV
  return round(
    days < 365 ? endNav / 100 - 1 : (endNav / startNav) ** (365 / days) - 1,
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
  for (const p of clipped) {
    if (p.nav > peak) peak = p.nav;
    const dd = peak > 0 ? (p.nav - peak) / peak : 0;
    if (dd < maxDD) maxDD = dd;
  }

  return {
    since_inception: round(si, 4),
    max_drawdown: round(maxDD, 4),
    current_drawdown: round(peak > 0 ? (last.nav - peak) / peak : 0, 4),
    series: clipped.map((p) => ({
      date: p.date,
      nav: parseFloat(((p.nav / refPrice) * 100).toFixed(4)),
    })),
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
}

interface SeriesPoint {
  date: string;
  value: number;
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
    });
  }
  return [...map.values()];
}

// carry-forward sum across N series onto the union of their dates — single pass
function mergeFfillSum(seriesList: SeriesPoint[][]): AumPoint[] {
  const dateSet = new Set<string>();
  for (const s of seriesList) for (const p of s) dateSet.add(p.date);
  const dates = [...dateSet].sort();

  const idx = new Array(seriesList.length).fill(0);
  const last = new Array(seriesList.length).fill(0);
  const out: AumPoint[] = [];

  for (const d of dates) {
    let sum = 0;
    for (let i = 0; i < seriesList.length; i++) {
      const s = seriesList[i];
      while (idx[i] < s.length && s[idx[i]].date <= d) {
        last[i] = s[idx[i]].value;
        idx[i]++;
      }
      sum += last[i];
    }
    out.push({ date: d, aum: sum });
  }
  return out;
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
  const allSeries: SeriesPoint[][] = [];
  const strategySeries = new Map<string, SeriesPoint[][]>();

  for (const pair of pairs) {
    const series = seriesMap.get(`${pair.qcode}|${pair.tag}`);
    if (!series || series.length === 0) continue; // no data — nothing to report

    investors.push({
      qcode: pair.qcode,
      account_name: pair.account_name,
      strategy: pair.strategy,
      since: series[0].date,
      aum: series[series.length - 1].value,
    });

    allSeries.push(series);
    if (!strategySeries.has(pair.strategy))
      strategySeries.set(pair.strategy, []);
    strategySeries.get(pair.strategy)!.push(series);
  }

  const aum_daily = mergeFfillSum(allSeries);
  const strategy_aum_daily: Record<string, AumPoint[]> = {};
  for (const [strategy, list] of strategySeries) {
    strategy_aum_daily[strategy] = mergeFfillSum(list);
  }

  return {
    total_investors: investors.length,
    total_aum: investors.reduce((s, inv) => s + inv.aum, 0),
    mom: computeMom(aum_daily),
    investors,
    aum_daily,
    strategy_aum_daily,
  };
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
}

// batched nav/prev_nav/drawdown/pnl fetch for every (qcode, profit_tag) pair —
// same unnest-join pattern as Portfolio Summary, one round trip total
async function fetchBulkNavSeries(
  pairs: StrategyPair[],
): Promise<Map<string, NavPoint[]>> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT b.qcode, b.system_tag, b.date, b.nav, b.prev_nav, b.drawdown, b.pnl
     FROM bifurcated_master_sheet_test b
     JOIN unnest($1::text[], $2::text[]) AS v(qcode, tag)
       ON b.qcode = v.qcode AND b.system_tag = v.tag
     WHERE b.nav IS NOT NULL
     ORDER BY b.qcode, b.system_tag, b.date ASC`,
    pairs.map((p) => p.qcode),
    pairs.map((p) => p.tag),
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
      portfolio_value: 0, // unused for this tab's metrics
    });
  }
  return seriesMap;
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
): Promise<StrategyBreakupRow[]> {
  const pairs = await fetchStrategyPairs("profit_tag_suffix");
  if (pairs.length === 0) return [];

  const seriesMap = await fetchBulkNavSeries(pairs);

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
    });
  }

  return rows;
}
