import { prisma } from "@/lib/prisma";
import YahooFinance from "yahoo-finance2";

export interface NavPoint {
  date: Date;
  nav: number;
  prev_nav: number | null;
  drawdown: number;
  pnl: number;
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

export async function fetchTagData(
  qcode: string,
  strategy: string,
  allPrefixes: string[],
  asOf?: Date,
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

export function calcSinceInception(nav: NavPoint[]): number | null {
  if (nav.length < 2) return null;
  const days =
    (nav[nav.length - 1].date.getTime() - nav[0].date.getTime()) / MS;
  const baseNav =
    nav[0].prev_nav != null && nav[0].prev_nav > 0 ? nav[0].prev_nav : 100;
  const startNav = nav[0].nav;
  const endNav = nav[nav.length - 1].nav;
  if (endNav <= 0 || startNav <= 0 || days <= 0) return null;
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

const NIFTY_URL =
  "https://qode360-backend.qodeinvest.com/api/v1/returns/indices/?downloadNav=true";

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

function computeBenchmarkMetrics(
  raw: { date: string; nav: number }[],
  startDate: Date,
  endDate: Date,
): BenchmarkResult | null {
  const startStr = startDate.toISOString().split("T")[0];
  const endStr = endDate.toISOString().split("T")[0];

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

export interface AumPoint {
  date: string;
  aum: number;
}

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

function trimTrailingZeros(series: AumPoint[]): AumPoint[] {
  let end = series.length;
  while (end > 0 && series[end - 1].aum === 0) end--;
  return series.slice(0, end);
}

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
    if (!series || series.length === 0) continue;

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

  const dateSet = new Set<string>();
  for (const { series } of allSeries)
    for (const p of series) dateSet.add(p.date);
  const dates = [...dateSet].sort();

  const activeInvestors = investors.filter((inv) => isActive(inv.until, today));
  const activeClients = new Set(activeInvestors.map((inv) => inv.qcode));
  const activeStrategies = new Set(activeInvestors.map((inv) => inv.strategy));

  const aum_daily = mergeFfillSum(allSeries, dates);
  const strategy_aum_daily: Record<string, AumPoint[]> = {};
  for (const [strategy, list] of strategySeries) {
    const series = trimLeadingZeros(mergeFfillSum(list, dates));
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

export async function resolveRiskFreeRate(
  payloadValue?: number | null,
): Promise<number | null> {
  if (payloadValue != null) return payloadValue;
  const cfg = await prisma.global_config.findUnique({
    where: { key: "RISK_FREE_RATE" },
  });
  return cfg ? parseFloat(cfg.value) : null;
}

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

export interface StrategyBreakupResult {
  start_date: string | null;
  end_date: string;
  clients: StrategyBreakupRow[];
}

async function fetchBulkNavSeries(
  pairs: { qcode: string; tag: string }[],
  end?: Date,
  start?: Date,
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
      portfolio_value: 0,
    });
  }
  return seriesMap;
}

export function parseOptionalDate(input?: string): Date | null | undefined {
  if (!input) return undefined;
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

function toMonthlyReturnMap(
  series: { date: string; nav: number }[],
): Map<string, number> {
  const monthEnd = new Map<string, number>();
  for (const p of series) monthEnd.set(p.date.slice(0, 7), p.nav);
  const keys = [...monthEnd.keys()].sort();

  const out = new Map<string, number>();
  for (let i = 1; i < keys.length; i++) {
    const prev = monthEnd.get(keys[i - 1])!;
    const cur = monthEnd.get(keys[i])!;
    if (prev > 0) out.set(keys[i], (cur / prev - 1) * 100);
  }
  return out;
}

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
      niftyRaw = null;
    }
  }

  const rows: StrategyBreakupRow[] = [];
  for (const pair of pairs) {
    const nav = seriesMap.get(`${pair.qcode}|${pair.tag}`);
    if (!nav || nav.length === 0) continue;

    const monthly = calcMonthlyReturns(nav);
    const clientStart = nav[0].date;
    const clientEnd = nav[nav.length - 1].date;

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
    if (total === 0) continue;

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
    const eqBk = legSum > 0 ? legSum : equity_book;

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

interface SubStrategySectionDef {
  label: string;
  tag: string;
  existsField:
    | "long_opt_pct"
    | "psar_leverage"
    | "gold_pct"
    | "lowvol_pct"
    | "momentum_pct";
  tier: 1 | 2 | null;
}

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
      if (!nav || nav.length === 0) continue;

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

export interface DailyPnlSelection {
  qcode: string;
  strategy: string;
}

export interface DailyPnlPoint {
  date: string;
  return_pct: number | null;
  pnl_inr: number;
}

export interface DailyPnlSeries {
  qcode: string;
  account_name: string;
  strategy: string;
  section: string;
  points: DailyPnlPoint[];
}

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
    if (!nav || nav.length === 0) continue;

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
    if (!nav || nav.length === 0) continue;

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

const SCHEDULE_RUNS_URL = "https://research.qodeinvest.com/api/schedule-runs";
const LIVE_RUN_BASE_URL = "https://research.qodeinvest.com/api/live-runs";

const LIVE_RUN_ID_TTL_MS = 15 * 60 * 1000;
const COMBINED_METRICS_TTL_MS = 24 * 60 * 60 * 1000;

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

const SCHEME_OPTION: Record<string, string> = {
  "QAW+": "qaw_plus",
  "QAW++": "qaw_plus_plus",
  "QYE+": "qye_plus",
  "QYE++": "qye_plus_plus",
};

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
  | { kind: "standalone"; tab: "all" | "nifty" | "sensex" };

const TOTAL_PORTFOLIO_SOURCE: BacktestSource = {
  kind: "scheme",
  array: "nav_curve",
  field: "normalized_nav",
};

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

  const uniquePairs = new Map<string, CompareSelection>();
  for (const s of selections) uniquePairs.set(`${s.qcode}|${s.system_tag}`, s);
  const unique = [...uniquePairs.values()];

  const seriesMap = await fetchBulkNavSeries(
    unique.map((s) => ({ qcode: s.qcode, tag: s.system_tag })),
  );

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

  const chartBenchmark =
    niftyRaw && minStart && maxEnd
      ? computeBenchmarkMetrics(niftyRaw, minStart, maxEnd)
      : null;

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
      const schemeCache = new Map<string, any | null>();
      for (const [systemTag, members] of tagGroups) {
        const trimmed = systemTag.trim();
        const spaceIdx = trimmed.indexOf(" ");

        let option: string | undefined;
        let source: BacktestSource | undefined;
        if (spaceIdx === -1) {
          option = UNPREFIXED_OPTION[trimmed];
          source = UNPREFIXED_SOURCE[trimmed];
        } else {
          const strategy = trimmed.slice(0, spaceIdx).trim();
          const tag = trimmed.slice(spaceIdx + 1).trim();
          option = SCHEME_OPTION[strategy];
          source = BACKTEST_TAG_SOURCE[tag];
        }
        if (!option || !source) continue;

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

async function fetchClientStrategies(qcode: string): Promise<string[]> {
  const configs = await prisma.client_strategy_configs.findMany({
    where: { qcode },
    select: { strategy: true },
  });
  return [...new Set(configs.map((c) => c.strategy))];
}

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

export interface CashMarginSnapshotRow {
  account_name: string;
  strategy: string;
  account_value: number;
  equity_groups: EquityGroupSnapshot[];
  equity_book_total: number;
  liquid_group: EquityGroupSnapshot;
  mutual_funds: number;
  bond_stock_holdings: number;
  holdings: number;
  has_equity_split: boolean;
  liquid_component_total: number;
  cash: number;
  cash_plus_liquid_component: number;
  excess_cash: number;
  excess_cash_pct: number;
  cash_drift: number | null;
  holdings_drift: number | null;
  cash_component_drift: number | null;
  snapshot_below_floor: boolean | null;
}

export interface CashMarginSnapshotResult {
  strategies: CashMarginSnapshotRow[];
  combined: CashMarginSnapshotRow | null;
}

function calcExcessCash(
  holdings: number,
  cashPlusLc: number,
  equityPct: number | null,
): number {
  if (!equityPct) return cashPlusLc;
  const requiredBuffer = holdings / equityPct - holdings;
  return cashPlusLc - requiredBuffer;
}

async function fetchCashMarginContext(qcode: string): Promise<{
  pairs: StrategyPair[];
  valueMap: Map<string, number>;
  splitMap: Map<string, SplitConfig>;
}> {
  const today = new Date().toISOString().split("T")[0];
  const allPairs = await fetchStrategyPairs("exposure_tag_suffix");
  const pairs = allPairs.filter(
    (p) => p.qcode === qcode && isActive(p.effective_to, today),
  );
  if (pairs.length === 0) {
    return { pairs, valueMap: new Map(), splitMap: new Map() };
  }
  const [valueMap, splitEntries] = await Promise.all([
    fetchLatestTagValues(pairs),
    (async () => {
      const oldDefaultsMap = new Map(
        (await prisma.strategy_defaults.findMany()).map((d) => [
          d.strategy_name,
          d,
        ]),
      );
      return Promise.all(
        pairs.map(
          async (pair) =>
            [
              `${pair.qcode}|${pair.strategy}`,
              await resolveStrategyConfig(
                pair.qcode,
                pair.strategy,
                pair,
                oldDefaultsMap.get(pair.strategy) ?? null,
                new Date(),
              ),
            ] as const,
        ),
      );
    })(),
  ]);
  const splitMap = new Map(splitEntries);
  return { pairs, valueMap, splitMap };
}

export interface EquityLeaf {
  config_key: string;
  label: string;
  ltp_symbol: string;
  console_symbol: string;
  value: number;
}

interface EquityGroupDef {
  config_key: string;
  label: string;
  tag_suffix: string | null;
  leaves: {
    config_key: string;
    label: string;
    ltp_symbol: string;
    console_symbol: string;
  }[];
}

export interface EquityGroupSnapshot {
  config_key: string;
  label: string;
  total: number;
  leaves: EquityLeaf[];
}

function resolveGroupFromNodes(
  groupKey: string,
  nodes: Awaited<ReturnType<typeof prisma.config_catalog.findMany>>,
): EquityGroupDef {
  const group = nodes.find((n) => n.config_key === groupKey)!;
  const children = nodes.filter(
    (n) =>
      n.parent_key === groupKey &&
      n.ltp_symbol != null &&
      n.console_symbol != null,
  );
  const leaves =
    children.length > 0
      ? children.map((c) => ({
          config_key: c.config_key,
          label: c.label,
          ltp_symbol: c.ltp_symbol!,
          console_symbol: c.console_symbol!,
        }))
      : group.ltp_symbol && group.console_symbol
        ? [
            {
              config_key: group.config_key,
              label: group.label,
              ltp_symbol: group.ltp_symbol,
              console_symbol: group.console_symbol,
            },
          ]
        : [];
  return {
    config_key: group.config_key,
    label: group.label,
    tag_suffix: group.tag_suffix,
    leaves,
  };
}

async function resolveEquityGroups(): Promise<EquityGroupDef[]> {
  const nodes = await prisma.config_catalog.findMany();
  const topLevel = nodes.filter((n) => n.parent_key === "equity_book");
  return topLevel.map((g) => resolveGroupFromNodes(g.config_key, nodes));
}

async function resolveLiquidGroup(): Promise<EquityGroupDef> {
  const nodes = await prisma.config_catalog.findMany();
  return resolveGroupFromNodes("liquid_component", nodes);
}

async function resolveHasEquitySplit(
  strategy: string,
  asOfDate: Date,
): Promise<boolean> {
  const groups = await resolveEquityGroups();
  const leafKeys = groups.flatMap((g) => g.leaves.map((l) => l.config_key));
  if (leafKeys.length === 0) return false;
  const row = await prisma.strategy_config_defaults.findFirst({
    where: {
      strategy_name: strategy,
      config_key: { in: leafKeys },
      ratio_type: "ideal",
      as_of_date: { lte: asOfDate },
    },
  });
  return row != null;
}

async function fetchConsoleHoldingsValue(
  qcode: string,
  symbols: string[],
): Promise<Map<string, number>> {
  const latest = await prisma.console_equity_holdings.findFirst({
    where: { qcode },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  if (!latest) return new Map();
  const rows = await prisma.console_equity_holdings.findMany({
    where: { qcode, date: latest.date, symbol: { in: symbols } },
  });
  const values = new Map<string, number>();
  for (const r of rows) {
    const qty = Number(r.quantity ?? 0) + Number(r.collateral_quantity ?? 0);
    values.set(r.symbol, qty * Number(r.last_price ?? 0));
  }
  return values;
}

async function resolveGroupSplit(
  qcode: string,
  total: number,
  groups: EquityGroupDef[],
): Promise<EquityGroupSnapshot[]> {
  const allLeaves = groups.flatMap((g) => g.leaves);
  if (allLeaves.length === 0) return [];

  const symbols = allLeaves.map((l) => l.console_symbol);
  const values = await fetchConsoleHoldingsValue(qcode, symbols);
  const weights = allLeaves.map((l) => values.get(l.console_symbol) ?? 0);
  const allocated = allocateWithRounding(total, weights);
  const valueByKey = new Map<string, number>();
  allLeaves.forEach((l, i) => valueByKey.set(l.config_key, allocated[i]));

  return groups.map((group) => {
    const leaves = group.leaves.map((l) => ({
      config_key: l.config_key,
      label: l.label,
      ltp_symbol: l.ltp_symbol,
      console_symbol: l.console_symbol,
      value: valueByKey.get(l.config_key) ?? 0,
    }));
    return {
      config_key: group.config_key,
      label: group.label,
      total: leaves.reduce((s, l) => s + l.value, 0),
      leaves,
    };
  });
}

async function fetchOwnValues(
  configKeys: string[],
  ratioType: "ideal" | "model" | "value",
  strategy: string,
  qcode: string,
  asOfDate: Date,
): Promise<Map<string, number>> {
  if (configKeys.length === 0) return new Map();
  const [clientRows, defaultRows] = await Promise.all([
    prisma.client_config_values.findMany({
      where: {
        qcode,
        strategy,
        ratio_type: ratioType,
        config_key: { in: configKeys },
        as_of_date: { lte: asOfDate },
      },
      orderBy: { as_of_date: "desc" },
    }),
    prisma.strategy_config_defaults.findMany({
      where: {
        strategy_name: strategy,
        ratio_type: ratioType,
        config_key: { in: configKeys },
        as_of_date: { lte: asOfDate },
      },
      orderBy: { as_of_date: "desc" },
    }),
  ]);
  const latestClient = new Map<string, number | null>();
  for (const r of clientRows) {
    if (!latestClient.has(r.config_key)) {
      latestClient.set(r.config_key, r.value != null ? Number(r.value) : null);
    }
  }
  const latestDefault = new Map<string, number>();
  for (const r of defaultRows) {
    if (!latestDefault.has(r.config_key) && r.value != null) {
      latestDefault.set(r.config_key, Number(r.value));
    }
  }
  const result = new Map<string, number>();
  for (const key of configKeys) {
    const v = latestClient.get(key) ?? latestDefault.get(key);
    if (v != null) result.set(key, v);
  }
  return result;
}

function resolveChainValue(
  leafKey: string,
  ownValues: Map<string, number>,
  nodes: Awaited<ReturnType<typeof prisma.config_catalog.findMany>>,
  stopAtKey: string | null,
): number | null {
  if (!ownValues.has(leafKey)) return null;
  let weight = ownValues.get(leafKey)!;
  let current = nodes.find((n) => n.config_key === leafKey)?.parent_key ?? null;
  while (current && current !== stopAtKey) {
    const v = ownValues.get(current);
    if (v != null) weight *= v;
    current = nodes.find((n) => n.config_key === current)?.parent_key ?? null;
  }
  return weight;
}

async function resolveEquityGroupTargets(
  qcode: string,
  strategy: string,
  ratioType: "ideal" | "model",
  groups: EquityGroupDef[],
  asOfDate: Date,
): Promise<Record<string, number | null>> {
  const allLeafKeys = groups.flatMap((g) => g.leaves.map((l) => l.config_key));
  if (allLeafKeys.length === 0) return {};

  const nodes = await prisma.config_catalog.findMany();
  const groupRootKeys = new Set(groups.map((g) => g.config_key));

  const chainKeys = new Set<string>();
  for (const leafKey of allLeafKeys) {
    chainKeys.add(leafKey);
    if (groupRootKeys.has(leafKey)) continue;
    let current: string | null =
      nodes.find((n) => n.config_key === leafKey)?.parent_key ?? null;
    while (current && !groupRootKeys.has(current)) {
      chainKeys.add(current);
      const node = nodes.find((n) => n.config_key === current);
      current = node?.parent_key ?? null;
    }
  }

  const ownValues = await fetchOwnValues(
    Array.from(chainKeys),
    ratioType,
    strategy,
    qcode,
    asOfDate,
  );

  const groupTotals: Record<string, number | null> = {};
  for (const group of groups) {
    const resolvedLeaves = group.leaves.map((l) =>
      resolveChainValue(l.config_key, ownValues, nodes, group.config_key),
    );
    const anyConfigured = resolvedLeaves.some((v) => v != null);
    groupTotals[group.config_key] = anyConfigured
      ? resolvedLeaves.reduce((s: number, v) => s + (v ?? 0), 0)
      : null;
  }
  return groupTotals;
}

export interface ConfigCatalogRow {
  config_key: string;
  parent_key: string | null;
  label: string;
  tag_suffix: string | null;
  ltp_symbol: string | null;
  console_symbol: string | null;
  allowed_ratio_types: string[];
  updated_by: string | null;
  updated_at: Date | null;
}

export async function fetchConfigCatalog(): Promise<ConfigCatalogRow[]> {
  const nodes = await prisma.config_catalog.findMany();
  return nodes.map((n) => ({
    config_key: n.config_key,
    parent_key: n.parent_key,
    label: n.label,
    tag_suffix: n.tag_suffix,
    ltp_symbol: n.ltp_symbol,
    console_symbol: n.console_symbol,
    allowed_ratio_types: (n.allowed_ratio_types as string[] | null) ?? [],
    updated_by: n.updated_by ?? null,
    updated_at: n.updated_at ?? null,
  }));
}

export interface CreateConfigCatalogInput {
  config_key: string;
  parent_key: string | null;
  label: string;
  tag_suffix?: string | null;
  ltp_symbol?: string | null;
  console_symbol?: string | null;
  allowed_ratio_types?: string[];
  updated_by: string;
}

async function verifyLeafSymbols(
  ltp_symbol: string,
  console_symbol: string,
): Promise<void> {
  const ltps = await fetchLtps([ltp_symbol]);
  if (!ltps.has(ltp_symbol)) {
    throw new Error(
      `ltp_symbol '${ltp_symbol}' did not resolve to a live price`,
    );
  }
  const consoleRow = await prisma.console_equity_holdings.findFirst({
    where: { symbol: console_symbol },
  });
  if (!consoleRow) {
    throw new Error(
      `console_symbol '${console_symbol}' not found in console_equity_holdings`,
    );
  }
}

export async function createConfigCatalogEntry(
  input: CreateConfigCatalogInput,
  isElevated: boolean,
): Promise<ConfigCatalogRow> {
  const existing = await prisma.config_catalog.findUnique({
    where: { config_key: input.config_key },
  });
  if (existing) {
    throw new Error(`config_key '${input.config_key}' already exists`);
  }
  if (input.parent_key) {
    const parent = await prisma.config_catalog.findUnique({
      where: { config_key: input.parent_key },
    });
    if (!parent) {
      throw new Error(`parent_key '${input.parent_key}' does not exist`);
    }
  }

  const isLeaf = input.ltp_symbol != null && input.console_symbol != null;
  if (isLeaf) {
    if (!isElevated) {
      throw new Error(
        "Creating a new tradeable leaf (ltp_symbol/console_symbol) requires elevated permission -- this is structurally load-bearing for every Deploy/Withdrawal calculation touching this strategy.",
      );
    }
    await verifyLeafSymbols(input.ltp_symbol!, input.console_symbol!);
  }

  const created = await prisma.config_catalog.create({
    data: {
      config_key: input.config_key,
      parent_key: input.parent_key,
      label: input.label,
      tag_suffix: input.tag_suffix ?? null,
      ltp_symbol: input.ltp_symbol ?? null,
      console_symbol: input.console_symbol ?? null,
      allowed_ratio_types: input.allowed_ratio_types ?? [],
      updated_by: input.updated_by,
      updated_at: new Date(),
    },
  });

  return {
    config_key: created.config_key,
    parent_key: created.parent_key,
    label: created.label,
    tag_suffix: created.tag_suffix,
    ltp_symbol: created.ltp_symbol,
    console_symbol: created.console_symbol,
    allowed_ratio_types: (created.allowed_ratio_types as string[] | null) ?? [],
    updated_by: created.updated_by ?? null,
    updated_at: created.updated_at ?? null,
  };
}

export interface UpdateConfigCatalogInput {
  label?: string;
  tag_suffix?: string | null;
  ltp_symbol?: string | null;
  console_symbol?: string | null;
  allowed_ratio_types?: string[];
  updated_by: string;
}

export async function updateConfigCatalogEntry(
  configKey: string,
  input: UpdateConfigCatalogInput,
): Promise<ConfigCatalogRow> {
  const existing = await prisma.config_catalog.findUnique({
    where: { config_key: configKey },
  });
  if (!existing) {
    throw new Error(`config_key '${configKey}' not found`);
  }

  const newLtp =
    input.ltp_symbol !== undefined ? input.ltp_symbol : existing.ltp_symbol;
  const newConsole =
    input.console_symbol !== undefined
      ? input.console_symbol
      : existing.console_symbol;
  if (
    (input.ltp_symbol !== undefined || input.console_symbol !== undefined) &&
    newLtp &&
    newConsole
  ) {
    await verifyLeafSymbols(newLtp, newConsole);
  }

  const updated = await prisma.config_catalog.update({
    where: { config_key: configKey },
    data: {
      label: input.label ?? undefined,
      tag_suffix: input.tag_suffix !== undefined ? input.tag_suffix : undefined,
      ltp_symbol: input.ltp_symbol !== undefined ? input.ltp_symbol : undefined,
      console_symbol:
        input.console_symbol !== undefined ? input.console_symbol : undefined,
      allowed_ratio_types: input.allowed_ratio_types ?? undefined,
      updated_by: input.updated_by,
      updated_at: new Date(),
    },
  });

  return {
    config_key: updated.config_key,
    parent_key: updated.parent_key,
    label: updated.label,
    tag_suffix: updated.tag_suffix,
    ltp_symbol: updated.ltp_symbol,
    console_symbol: updated.console_symbol,
    allowed_ratio_types: (updated.allowed_ratio_types as string[] | null) ?? [],
    updated_by: updated.updated_by ?? null,
    updated_at: updated.updated_at ?? null,
  };
}

export async function deleteConfigCatalogEntry(
  configKey: string,
): Promise<{ deleted: true }> {
  const children = await prisma.config_catalog.findMany({
    where: { parent_key: configKey },
  });
  if (children.length > 0) {
    throw new Error(
      `Cannot delete '${configKey}' -- ${children.length} node(s) still reference it as parent_key: ${children.map((c) => c.config_key).join(", ")}`,
    );
  }
  await prisma.config_catalog.delete({ where: { config_key: configKey } });
  return { deleted: true };
}

export interface ResolvedStrategyConfig {
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

async function resolveStrategyConfig(
  qcode: string,
  strategy: string,
  pair: StrategyPair | null,
  oldDefaults: Awaited<
    ReturnType<typeof prisma.strategy_defaults.findUnique>
  > | null,
  asOfDate: Date,
): Promise<ResolvedStrategyConfig> {
  const groups = await resolveEquityGroups();
  const nodes = await prisma.config_catalog.findMany();

  const flatKeys = [
    "equity_pct",
    "psar_leverage",
    "psar_multiplier",
    "long_opt_pct",
    "cash_pct_healthy",
    "liquidcase_pct_gate",
  ];
  const flatValues = await fetchOwnValues(
    flatKeys,
    "value",
    strategy,
    qcode,
    asOfDate,
  );

  const debtRelValues = await fetchOwnValues(
    ["cash_pct", "lc_pct", "debt_pct"],
    "value",
    strategy,
    qcode,
    asOfDate,
  );
  const newDebtPct = debtRelValues.get("debt_pct") ?? null;
  const newCashPct = resolveChainValue("cash_pct", debtRelValues, nodes, null);
  const newLcPct = resolveChainValue("lc_pct", debtRelValues, nodes, null);

  const idealTargets = await resolveEquityGroupTargets(
    qcode,
    strategy,
    "ideal",
    groups,
    asOfDate,
  );
  const modelTargets = await resolveEquityGroupTargets(
    qcode,
    strategy,
    "model",
    groups,
    asOfDate,
  );

  return {
    equity_pct:
      flatValues.get("equity_pct") ??
      toNum(pair?.equity_pct) ??
      toNum(oldDefaults?.equity_pct) ??
      null,
    debt_pct:
      newDebtPct ??
      toNum(pair?.debt_pct) ??
      toNum(oldDefaults?.debt_pct) ??
      null,
    lc_pct:
      newLcPct ?? toNum(pair?.lc_pct) ?? toNum(oldDefaults?.lc_pct) ?? null,
    cash_pct:
      newCashPct ??
      toNum(pair?.cash_pct) ??
      toNum(oldDefaults?.cash_pct) ??
      null,
    gold_pct:
      idealTargets["gold"] ??
      toNum(pair?.gold_pct) ??
      toNum(oldDefaults?.gold_pct) ??
      null,
    lowvol_pct:
      idealTargets["lowvol"] ??
      toNum(pair?.lowvol_pct) ??
      toNum(oldDefaults?.lowvol_pct) ??
      null,
    momentum_pct:
      idealTargets["momentum"] ??
      toNum(pair?.momentum_pct) ??
      toNum(oldDefaults?.momentum_pct) ??
      null,
    psar_leverage:
      flatValues.get("psar_leverage") ??
      toNum(pair?.psar_leverage) ??
      toNum(oldDefaults?.psar_leverage) ??
      null,
    psar_multiplier:
      flatValues.get("psar_multiplier") ??
      toNum(pair?.psar_multiplier) ??
      toNum(oldDefaults?.psar_multiplier) ??
      null,
    long_opt_pct:
      flatValues.get("long_opt_pct") ??
      toNum(pair?.long_opt_pct) ??
      toNum(oldDefaults?.long_opt_pct) ??
      null,
    gold_model_pct:
      modelTargets["gold"] ??
      toNum(pair?.gold_model_pct) ??
      toNum(oldDefaults?.gold_model_pct) ??
      null,
    momentum_model_pct:
      modelTargets["momentum"] ??
      toNum(pair?.momentum_model_pct) ??
      toNum(oldDefaults?.momentum_model_pct) ??
      null,
    lowvol_model_pct:
      modelTargets["lowvol"] ??
      toNum(pair?.lowvol_model_pct) ??
      toNum(oldDefaults?.lowvol_model_pct) ??
      null,
    cash_pct_healthy:
      flatValues.get("cash_pct_healthy") ??
      toNum(pair?.cash_pct_healthy) ??
      toNum(oldDefaults?.cash_pct_healthy) ??
      null,
    liquidcase_pct_gate:
      flatValues.get("liquidcase_pct_gate") ??
      toNum(pair?.liquidcase_pct_gate) ??
      toNum(oldDefaults?.liquidcase_pct_gate) ??
      null,
  };
}

function applyGroupSplitOverride(
  computed: Record<string, number>,
  override: Record<string, number> | undefined,
): { fractions: Record<string, number>; usedOverride: boolean } {
  if (!override || Object.keys(override).length === 0) {
    return { fractions: computed, usedOverride: false };
  }
  const merged: Record<string, number> = {};
  for (const key of Object.keys(computed)) {
    merged[key] = override[key] ?? computed[key];
  }
  const total = Object.values(merged).reduce((s, v) => s + v, 0);
  const normalized: Record<string, number> = {};
  for (const key of Object.keys(merged)) {
    normalized[key] = total > 0 ? merged[key] / total : 0;
  }
  return { fractions: normalized, usedOverride: true };
}

function splitGroupChange(
  leaves: EquityLeaf[],
  amount: number,
  overrideWeights?: Record<string, number>,
): number[] {
  const usingOverride =
    overrideWeights != null &&
    leaves.some((l) => overrideWeights[l.config_key] != null);
  const currentTotal = leaves.reduce((s, l) => s + l.value, 0);
  const weights = usingOverride
    ? leaves.map(
        (l) =>
          overrideWeights![l.config_key] ??
          (currentTotal > 0 ? l.value / currentTotal : 1 / leaves.length),
      )
    : leaves.map((l) => l.value);
  return allocateWithRounding(amount, weights);
}

function buildGroupSleeve(
  group: { label: string; leaves: EquityLeaf[] },
  newGroupTotal: number,
  newAccountValue: number,
  ltps: Map<string, number>,
  overrideWeights?: Record<string, number>,
): WithdrawalSleeve {
  const { leaves } = group;
  const oldGroupTotal = leaves.reduce((s, l) => s + l.value, 0);
  const change = oldGroupTotal - newGroupTotal;
  const shares = splitGroupChange(leaves, change, overrideWeights);
  const usingOverride =
    overrideWeights != null &&
    leaves.some((l) => overrideWeights[l.config_key] != null);

  const instruments = leaves.map((leaf, i) =>
    buildWithdrawalSleeve(
      leaf.console_symbol,
      leaf.value,
      leaf.value - shares[i],
      newAccountValue,
      "sell_buy",
      ltps.get(leaf.ltp_symbol),
    ),
  );

  const { ltp, quantity, ...groupSleeve } = buildWithdrawalSleeve(
    group.label,
    oldGroupTotal,
    newGroupTotal,
    newAccountValue,
    "sell_buy",
  );
  return {
    ...groupSleeve,
    instruments,
    split_source: usingOverride ? "override" : "computed",
  };
}

async function buildCashMarginSnapshot(
  pairs: StrategyPair[],
  valueMap: Map<string, number>,
  splitMap: Map<string, SplitConfig>,
): Promise<CashMarginSnapshotResult> {
  const strategies: CashMarginSnapshotRow[] = [];
  for (const pair of pairs) {
    const account_value = valueMap.get(`${pair.qcode}|${pair.tag}`) ?? 0;
    if (account_value === 0) continue;

    const split = splitMap.get(`${pair.qcode}|${pair.strategy}`)!;
    const asOfDate = new Date();

    const mutual_funds =
      valueMap.get(`${pair.qcode}|${pair.strategy} Mutual Funds`) ?? 0;
    const bond_stock_holdings =
      valueMap.get(`${pair.qcode}|${pair.strategy} Bond Stock Holdings`) ?? 0;

    const has_equity_split = await resolveHasEquitySplit(
      pair.strategy,
      asOfDate,
    );

    const equity_book_total =
      valueMap.get(`${pair.qcode}|${pair.strategy} Equity Stock Holdings`) ?? 0;
    let equity_groups: EquityGroupSnapshot[] = [];
    if (has_equity_split) {
      const groups = await resolveEquityGroups();
      equity_groups = await resolveGroupSplit(
        pair.qcode,
        equity_book_total,
        groups,
      );
    }

    const holdings = equity_book_total + mutual_funds + bond_stock_holdings;

    const liquidGroupDef = await resolveLiquidGroup();
    const liquidTagTotal =
      valueMap.get(
        `${pair.qcode}|${pair.strategy} Liquidcase Stock Holdings`,
      ) ?? 0;
    const liquidSplit = await resolveGroupSplit(pair.qcode, liquidTagTotal, [
      liquidGroupDef,
    ]);
    const liquid_group = liquidSplit[0] ?? {
      config_key: "liquid_component",
      label: "Liquidcase",
      total: liquidTagTotal,
      leaves: [],
    };
    const liquid_component_total = liquid_group.total;

    const cash = account_value - holdings - liquid_component_total;
    const cash_plus_liquid_component = cash + liquid_component_total;

    const excess_cash = calcExcessCash(
      holdings,
      cash_plus_liquid_component,
      split.equity_pct,
    );

    const cashPctActual = cash / account_value;
    const holdingsPctActual = holdings / account_value;
    const cashLcPctActual = cash_plus_liquid_component / account_value;

    strategies.push({
      account_name: pair.account_name,
      strategy: pair.strategy,
      account_value,
      equity_groups,
      equity_book_total,
      liquid_group,
      mutual_funds,
      bond_stock_holdings,
      holdings,
      has_equity_split,
      liquid_component_total,
      cash,
      cash_plus_liquid_component,
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
          ? cash_plus_liquid_component < split.cash_pct * account_value
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
    equity_groups: [],
    equity_book_total: sum((r) => r.equity_book_total),
    liquid_group: {
      config_key: "liquid_component",
      label: "Liquidcase",
      total: sum((r) => r.liquid_component_total),
      leaves: [],
    },
    mutual_funds: sum((r) => r.mutual_funds),
    bond_stock_holdings: sum((r) => r.bond_stock_holdings),
    holdings: sum((r) => r.holdings),
    has_equity_split: strategies.some((r) => r.has_equity_split),
    liquid_component_total: sum((r) => r.liquid_component_total),
    cash: sum((r) => r.cash),
    cash_plus_liquid_component: sum((r) => r.cash_plus_liquid_component),
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
  return await buildCashMarginSnapshot(pairs, valueMap, splitMap);
}

const EPSILON = 0.01;

export interface WithdrawalTargets {
  equity_pct: number;
  cash_pct: number;
  lc_pct: number;
  cash_pct_healthy: number | null;
  liquidcase_pct_gate: number | null;
  targets_source: {
    equity_pct: "override" | "computed";
    cash_pct: "override" | "computed";
    lc_pct: "override" | "computed";
  };
}

const RATIO_EPSILON = 0.0001;

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
  return { cash_pct, lc_pct: 1 - equity_pct - cash_pct };
}

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
    targets_source: {
      equity_pct: equityPctOverride != null ? "override" : "computed",
      cash_pct: cashPctOverride != null ? "override" : "computed",
      lc_pct: liquidcasePctOverride != null ? "override" : "computed",
    },
  };
}

function allocateWithRounding(total: number, weights: number[]): number[] {
  const sumWeights = weights.reduce((a, b) => a + b, 0);
  const effectiveWeights = sumWeights > 0 ? weights : weights.map(() => 1);
  const effectiveSum = sumWeights > 0 ? sumWeights : weights.length;
  const amounts = effectiveWeights.map(
    (w) => round((total * w) / effectiveSum, 2)!,
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
  change_amount: number;
  direction: WithdrawalDirection;
  ltp?: number | null;
  quantity?: number | null;
  new_pct: number;
  instruments?: WithdrawalSleeve[];
  split_source?: "override" | "computed";
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

async function resolveWithdrawalEqSplit(
  row: CashMarginSnapshotRow,
  qcode: string,
  strategy: string,
  ratioType: "current" | "ideal" | "model",
  override?: Record<string, number>,
): Promise<{ fractions: Record<string, number>; usedOverride: boolean }> {
  if (ratioType === "current") {
    const fractions: Record<string, number> = {};
    for (const g of row.equity_groups) {
      fractions[g.config_key] =
        row.equity_book_total > 0 ? g.total / row.equity_book_total : 0;
    }
    return applyGroupSplitOverride(fractions, override);
  }
  const groups = await resolveEquityGroups();
  const targets = await resolveEquityGroupTargets(
    qcode,
    strategy,
    ratioType,
    groups,
    new Date(),
  );
  const total = Object.values(targets).reduce<number>(
    (s, v) => s + (v ?? 0),
    0,
  );
  const fractions: Record<string, number> = {};
  for (const group of groups) {
    fractions[group.config_key] =
      total > 0 ? (targets[group.config_key] ?? 0) / total : 0;
  }
  return applyGroupSplitOverride(fractions, override);
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

interface WithdrawalOverrides {
  equity_group_split?: Record<string, number>;
  equity_leaf_splits?: Record<string, Record<string, number>>;
  liquid_component_split?: Record<string, number>;
}

async function computeBalanced(
  row: CashMarginSnapshotRow,
  targets: WithdrawalTargets,
  amountToWithdraw: number,
  excessCashBeforeWithdrawal: number,
  ratioType: "current" | "ideal" | "model" | undefined,
  qcode: string,
  strategy: string,
  ltps: Map<string, number>,
  overrides: WithdrawalOverrides,
): Promise<WithdrawalViewResult> {
  const newAccountValue = row.account_value - amountToWithdraw;
  const isRegimeB = amountToWithdraw > excessCashBeforeWithdrawal;

  const sleeves: WithdrawalSleeve[] = [];
  let newLiquidcaseBudget: number;

  if (row.has_equity_split) {
    let newEquityBookTotal = row.equity_book_total;
    let newGroupTotals: Record<string, number> = {};
    row.equity_groups.forEach((g) => (newGroupTotals[g.config_key] = g.total));

    if (isRegimeB) {
      const { fractions: subRatios } = await resolveWithdrawalEqSplit(
        row,
        qcode,
        strategy,
        ratioType!,
        overrides.equity_group_split,
      );
      newEquityBookTotal = newAccountValue * targets.equity_pct;
      const equityReduction = row.equity_book_total - newEquityBookTotal;
      const groupKeys = row.equity_groups.map((g) => g.config_key);
      const reductions = allocateWithRounding(
        equityReduction,
        groupKeys.map((k) => subRatios[k] ?? 0),
      );
      row.equity_groups.forEach((g, i) => {
        newGroupTotals[g.config_key] = g.total - reductions[i];
      });
    }

    for (const g of row.equity_groups) {
      sleeves.push(
        buildGroupSleeve(
          g,
          newGroupTotals[g.config_key],
          newAccountValue,
          ltps,
          overrides.equity_leaf_splits?.[g.config_key],
        ),
      );
    }
    if (row.mutual_funds !== 0) {
      sleeves.push(
        buildWithdrawalSleeve(
          "Mutual Funds",
          row.mutual_funds,
          row.mutual_funds,
          newAccountValue,
          "sell_buy",
        ),
      );
    }
    if (row.bond_stock_holdings !== 0) {
      sleeves.push(
        buildWithdrawalSleeve(
          "Bond Stock Holdings",
          row.bond_stock_holdings,
          row.bond_stock_holdings,
          newAccountValue,
          "sell_buy",
        ),
      );
    }
    newLiquidcaseBudget =
      newEquityBookTotal + row.mutual_funds + row.bond_stock_holdings;
  } else {
    const newHoldings = isRegimeB
      ? newAccountValue * targets.equity_pct
      : row.holdings;
    sleeves.push(
      buildWithdrawalSleeve(
        "Holdings",
        row.holdings,
        newHoldings,
        newAccountValue,
        "sell_buy",
      ),
    );
    newLiquidcaseBudget = newHoldings;
  }

  const newCash = newAccountValue * targets.cash_pct;
  const newLiquidcase = newAccountValue - newLiquidcaseBudget - newCash;

  sleeves.push(
    buildGroupSleeve(
      row.liquid_group,
      newLiquidcase,
      newAccountValue,
      ltps,
      overrides.liquid_component_split,
    ),
  );
  sleeves.push(
    buildWithdrawalSleeve(
      "Cash",
      row.cash,
      newCash,
      newAccountValue,
      "withdraw_deposit",
    ),
  );

  return { new_account_value: round(newAccountValue, 2)!, sleeves };
}

function computeHoldingsFrozen(
  row: CashMarginSnapshotRow,
  targets: WithdrawalTargets,
  amountToWithdraw: number,
  ltps: Map<string, number>,
  overrides: WithdrawalOverrides,
): WithdrawalViewResult {
  const newAccountValue = row.account_value - amountToWithdraw;
  const newCash = newAccountValue * targets.cash_pct;
  const newLiquidcase = newAccountValue - row.holdings - newCash;

  const sleeves: WithdrawalSleeve[] = [];
  if (row.has_equity_split) {
    for (const g of row.equity_groups) {
      sleeves.push(
        buildGroupSleeve(
          g,
          g.total,
          newAccountValue,
          ltps,
          overrides.equity_leaf_splits?.[g.config_key],
        ),
      );
    }
    if (row.mutual_funds !== 0) {
      sleeves.push(
        buildWithdrawalSleeve(
          "Mutual Funds",
          row.mutual_funds,
          row.mutual_funds,
          newAccountValue,
          "sell_buy",
        ),
      );
    }
    if (row.bond_stock_holdings !== 0) {
      sleeves.push(
        buildWithdrawalSleeve(
          "Bond Stock Holdings",
          row.bond_stock_holdings,
          row.bond_stock_holdings,
          newAccountValue,
          "sell_buy",
        ),
      );
    }
  } else {
    sleeves.push(
      buildWithdrawalSleeve(
        "Holdings",
        row.holdings,
        row.holdings,
        newAccountValue,
        "sell_buy",
      ),
    );
  }

  sleeves.push(
    buildGroupSleeve(
      row.liquid_group,
      newLiquidcase,
      newAccountValue,
      ltps,
      overrides.liquid_component_split,
    ),
  );
  sleeves.push(
    buildWithdrawalSleeve(
      "Cash",
      row.cash,
      newCash,
      newAccountValue,
      "withdraw_deposit",
    ),
  );

  return { new_account_value: round(newAccountValue, 2)!, sleeves };
}

async function computeCashFrozen(
  row: CashMarginSnapshotRow,
  targets: WithdrawalTargets,
  amountToWithdraw: number,
  ratioType: "current" | "ideal" | "model" | undefined,
  qcode: string,
  strategy: string,
  ltps: Map<string, number>,
  overrides: WithdrawalOverrides,
): Promise<WithdrawalViewResult> {
  const newAccountValue = row.account_value - amountToWithdraw;
  const sleeves: WithdrawalSleeve[] = [];

  if (row.has_equity_split) {
    const { fractions: subRatios } = await resolveWithdrawalEqSplit(
      row,
      qcode,
      strategy,
      ratioType!,
      overrides.equity_group_split,
    );
    const groupKeys = row.equity_groups.map((g) => g.config_key);
    const reductions = allocateWithRounding(
      amountToWithdraw,
      groupKeys.map((k) => subRatios[k] ?? 0),
    );
    const newGroupTotals: Record<string, number> = {};
    row.equity_groups.forEach((g, i) => {
      newGroupTotals[g.config_key] = g.total - reductions[i];
    });
    for (const g of row.equity_groups) {
      sleeves.push(
        buildGroupSleeve(
          g,
          newGroupTotals[g.config_key],
          newAccountValue,
          ltps,
          overrides.equity_leaf_splits?.[g.config_key],
        ),
      );
    }
    if (row.mutual_funds !== 0) {
      sleeves.push(
        buildWithdrawalSleeve(
          "Mutual Funds",
          row.mutual_funds,
          row.mutual_funds,
          newAccountValue,
          "sell_buy",
        ),
      );
    }
    if (row.bond_stock_holdings !== 0) {
      sleeves.push(
        buildWithdrawalSleeve(
          "Bond Stock Holdings",
          row.bond_stock_holdings,
          row.bond_stock_holdings,
          newAccountValue,
          "sell_buy",
        ),
      );
    }
  } else {
    const newHoldings = row.holdings - amountToWithdraw;
    sleeves.push(
      buildWithdrawalSleeve(
        "Holdings",
        row.holdings,
        newHoldings,
        newAccountValue,
        "sell_buy",
      ),
    );
  }

  sleeves.push(
    buildGroupSleeve(
      row.liquid_group,
      row.liquid_component_total,
      newAccountValue,
      ltps,
      overrides.liquid_component_split,
    ),
  );
  sleeves.push(
    buildWithdrawalSleeve(
      "Cash",
      row.cash,
      row.cash,
      newAccountValue,
      "withdraw_deposit",
    ),
  );

  return { new_account_value: round(newAccountValue, 2)!, sleeves };
}

export interface WithdrawalInput {
  qcode: string;
  strategy?: string;
  source?: "all_profits" | "specific" | "fees" | "excess_cash";
  total_profits?: number;
  amount?: number;
  ratio_type?: "current" | "ideal" | "model";
  equity_pct?: number;
  cash_pct?: number;
  lc_pct?: number;
  equity_group_split?: Record<string, number>;
  equity_leaf_splits?: Record<string, Record<string, number>>;
  liquid_component_split?: Record<string, number>;
}

export interface CashMarginWithdrawalResult {
  snapshot: CashMarginSnapshotResult;
  blocked: boolean;
  warning: string | null;
  amount_to_withdraw: number | null;
  excess_cash_before_withdrawal: number | null;
  ratio_type: "current" | "ideal" | "model" | null;
  targets_source: WithdrawalTargets["targets_source"] | null;
  balanced: WithdrawalViewResult | null;
  holdings_frozen: WithdrawalViewResult | null;
  cash_frozen: WithdrawalViewResult | null;
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
      : await buildCashMarginSnapshot(pairs, valueMap, splitMap);

  const empty = {
    blocked: false,
    warning: null,
    amount_to_withdraw: null,
    excess_cash_before_withdrawal: null,
    ratio_type: null,
    targets_source: null,
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

  const excessCashBeforeWithdrawal = calcExcessCash(
    row.holdings,
    row.cash_plus_liquid_component,
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
      targets_source: targets.targets_source,
    };
  }
  const amountToWithdraw = resolved.amount!;

  if (amountToWithdraw >= row.account_value) {
    return {
      snapshot,
      ...empty,
      blocked: true,
      warning: "Withdrawal amount cannot meet or exceed the Account Value",
      amount_to_withdraw: round(amountToWithdraw, 2)!,
      excess_cash_before_withdrawal: round(excessCashBeforeWithdrawal, 2)!,
      ratio_type: input.ratio_type ?? null,
      targets_source: targets.targets_source,
    };
  }

  let balanced: WithdrawalViewResult;
  let holdings_frozen: WithdrawalViewResult;
  let cash_frozen: WithdrawalViewResult | null;
  let cash_frozen_unavailable_reason: string | null = null;

  const equityLeafSymbols = row.equity_groups.flatMap((g) =>
    g.leaves.map((l) => l.ltp_symbol),
  );
  const liquidLeafSymbols = row.liquid_group.leaves.map((l) => l.ltp_symbol);
  const ltps = await fetchLtps([...equityLeafSymbols, ...liquidLeafSymbols]);

  const cashFrozenAvailable = amountToWithdraw <= row.holdings;
  if (!cashFrozenAvailable) {
    cash_frozen_unavailable_reason = `Cash-Frozen can't fund this withdrawal without also selling Holdings — ₹${round(row.holdings, 2)} available, ₹${round(amountToWithdraw, 2)} requested.`;
  }

  if (row.has_equity_split && !input.ratio_type) {
    throw new Error("ratio_type is required for this strategy");
  }

  const overrides: WithdrawalOverrides = {
    equity_group_split: input.equity_group_split,
    equity_leaf_splits: input.equity_leaf_splits,
    liquid_component_split: input.liquid_component_split,
  };

  balanced = await computeBalanced(
    row,
    targets,
    amountToWithdraw,
    excessCashBeforeWithdrawal,
    input.ratio_type,
    input.qcode,
    input.strategy,
    ltps,
    overrides,
  );
  holdings_frozen = computeHoldingsFrozen(
    row,
    targets,
    amountToWithdraw,
    ltps,
    overrides,
  );
  cash_frozen = cashFrozenAvailable
    ? await computeCashFrozen(
        row,
        targets,
        amountToWithdraw,
        input.ratio_type,
        input.qcode,
        input.strategy,
        ltps,
        overrides,
      )
    : null;

  return {
    snapshot,
    blocked: false,
    warning: null,
    amount_to_withdraw: round(amountToWithdraw, 2)!,
    excess_cash_before_withdrawal: round(excessCashBeforeWithdrawal, 2)!,
    ratio_type: input.ratio_type ?? null,
    targets_source: targets.targets_source,
    balanced,
    holdings_frozen,
    cash_frozen,
    cash_frozen_unavailable_reason,
  };
}

const yahooFinance = new YahooFinance();

const ETF_SYMBOLS = {
  gold: "GOLDBEES.NS",
  momentum: "MOMENTUM50.NS",
  lowvol: "LOWVOLIETF.NS",
  liquidcase: "LIQUIDCASE.NS",
} as const;

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

async function fetchStrategyDefaults(strategy: string): Promise<{
  equity_pct: number | null;
  cash_pct: number | null;
  gold_pct: number | null;
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
  target_value: number;
  actual_value: number;
  ltp: number | null;
  quantity: number | null;
  instruments?: DeploySleeve[];
  split_source?: "override" | "computed";
}

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

export interface DeployInput {
  qcode?: string;
  strategy: string;
  ratio_type?: "current" | "ideal" | "model";
  account_value?: number;
  reference_qcode?: string;
  liquid_component_split?: Record<string, number>;
  equity_leaf_splits?: Record<string, Record<string, number>>;
  equity_group_split?: Record<string, number>;
  input_mode?: "holdings" | "account_value" | "cash";
  value?: number;
  amount?: number;
  today_pnl?: number;
  equity_pct?: number;
  cash_pct?: number;
  lc_pct?: number;
}

type Level1TargetsSource = {
  equity_pct: "override" | "computed";
  cash_pct: "override" | "computed";
  lc_pct: "override" | "computed";
};

export interface NewClientSplitDeployResult {
  ratio_type: "current" | "ideal" | "model";
  strategy: string;
  account_value: number;
  sleeves: DeploySleeve[];
  targets_source: Level1TargetsSource;
}

async function resolveDeployEquitySplit(
  ratio_type: NonNullable<DeployInput["ratio_type"]>,
  strategy: string,
  qcode: string | undefined,
  reference_qcode: string | undefined,
  override?: Record<string, number>,
): Promise<{ fractions: Record<string, number>; usedOverride: boolean }> {
  if (ratio_type === "ideal" || ratio_type === "model") {
    const groups = await resolveEquityGroups();
    const targets = await resolveEquityGroupTargets(
      qcode ?? "",
      strategy,
      ratio_type,
      groups,
      new Date(),
    );
    const total = Object.values(targets).reduce<number>(
      (s, v) => s + (v ?? 0),
      0,
    );
    if (total <= 0) {
      throw new Error(`${ratio_type} ratios not configured for '${strategy}'`);
    }
    const fractions: Record<string, number> = {};
    for (const group of groups) {
      fractions[group.config_key] = (targets[group.config_key] ?? 0) / total;
    }
    return applyGroupSplitOverride(fractions, override);
  }

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
  if (!row.has_equity_split || row.equity_book_total <= 0) {
    throw new Error(
      `Reference client ${reference_qcode}/${strategy} has no equity split to copy Current ratios from`,
    );
  }
  const fractions: Record<string, number> = {};
  for (const g of row.equity_groups) {
    fractions[g.config_key] =
      row.equity_book_total > 0 ? g.total / row.equity_book_total : 0;
  }
  return applyGroupSplitOverride(fractions, override);
}

async function resolveLeafSplitForNewClient(
  groupKey: string,
  ratioType: "current" | "ideal" | "model",
  strategy: string,
  qcode: string,
  reference_qcode: string | undefined,
  asOfDate: Date,
  explicitSplit: Record<string, number> | undefined,
  hasStoredTargetConcept: boolean,
): Promise<
  {
    label: string;
    ltp_symbol: string;
    console_symbol: string;
    weight: number;
  }[]
> {
  const nodes = await prisma.config_catalog.findMany();
  let leaves = nodes.filter(
    (n) =>
      n.parent_key === groupKey &&
      n.ltp_symbol != null &&
      n.console_symbol != null,
  );
  if (leaves.length === 0) {
    const self = nodes.find((n) => n.config_key === groupKey);
    leaves = self && self.ltp_symbol && self.console_symbol ? [self] : [];
  }
  if (leaves.length === 0) return [];
  const equalSplit = () =>
    leaves.map((l) => ({
      label: l.label,
      ltp_symbol: l.ltp_symbol!,
      console_symbol: l.console_symbol!,
      weight: 1 / leaves.length,
    }));

  if (
    explicitSplit &&
    leaves.every((l) => explicitSplit[l.config_key] != null)
  ) {
    return leaves.map((l) => ({
      label: l.label,
      ltp_symbol: l.ltp_symbol!,
      console_symbol: l.console_symbol!,
      weight: explicitSplit[l.config_key],
    }));
  }

  if (ratioType === "ideal" || ratioType === "model") {
    const ownValues = await fetchOwnValues(
      leaves.map((l) => l.config_key),
      ratioType,
      strategy,
      qcode,
      asOfDate,
    );
    if (leaves.every((l) => ownValues.has(l.config_key))) {
      return leaves.map((l) => ({
        label: l.label,
        ltp_symbol: l.ltp_symbol!,
        console_symbol: l.console_symbol!,
        weight: ownValues.get(l.config_key)!,
      }));
    }
  }

  if (reference_qcode) {
    const snapshot = await fetchCashMarginSnapshot(reference_qcode);
    const row = snapshot.strategies.find((r) => r.strategy === strategy);
    const group =
      row?.equity_groups.find((g) => g.config_key === groupKey) ??
      (row?.liquid_group.config_key === groupKey
        ? row.liquid_group
        : undefined);
    if (group && group.leaves.length > 0 && group.total > 0) {
      return group.leaves.map((l) => ({
        label: l.label,
        ltp_symbol: l.ltp_symbol,
        console_symbol: l.console_symbol,
        weight: l.value,
      }));
    }
  }

  if (!hasStoredTargetConcept) {
    const placeholderValues = await fetchOwnValues(
      leaves.map((l) => l.config_key),
      "value",
      strategy,
      qcode,
      asOfDate,
    );
    if (leaves.every((l) => placeholderValues.has(l.config_key))) {
      return leaves.map((l) => ({
        label: l.label,
        ltp_symbol: l.ltp_symbol!,
        console_symbol: l.console_symbol!,
        weight: placeholderValues.get(l.config_key)!,
      }));
    }
    return equalSplit();
  }

  throw new Error(
    `No way to resolve the split across ${leaves.map((l) => l.label).join("/")} for '${strategy}' -- ` +
      `this group is expected to have a stored ideal/model target, but none was found, no reference_qcode, and no explicit split.`,
  );
}

function buildTargetGroupSleeve(
  groupLabel: string,
  groupTargetPct: number,
  groupTargetValue: number,
  leaves: { label: string; ltp_symbol: string; weight: number }[],
  ltps: Map<string, number>,
): { sleeve: DeploySleeve; dust: number } {
  const rawTotalWeight = leaves.reduce((s, l) => s + l.weight, 0);
  const effectiveWeights =
    rawTotalWeight > 0 ? leaves.map((l) => l.weight) : leaves.map(() => 1);
  const totalWeight = rawTotalWeight > 0 ? rawTotalWeight : leaves.length;
  let dust = 0;
  const instruments: DeploySleeve[] = leaves.map((leaf, i) => {
    const leafValue =
      totalWeight > 0
        ? groupTargetValue * (effectiveWeights[i] / totalWeight)
        : 0;
    const leafPct =
      groupTargetValue > 0
        ? groupTargetPct * (leafValue / groupTargetValue)
        : 0;
    const priced = buildPricedSleeve(
      leaf.label,
      leafPct,
      leafValue,
      ltps.get(leaf.ltp_symbol),
    );
    dust += priced.dust;
    return priced.sleeve;
  });
  const parent: DeploySleeve = {
    particular: groupLabel,
    target_pct: groupTargetPct,
    target_value: round(groupTargetValue, 2)!,
    actual_value: round(groupTargetValue, 2)!,
    ltp: null,
    quantity: null,
    instruments,
  };
  return { sleeve: parent, dust };
}

async function computeNewClientSplitDeploy(
  input: DeployInput,
): Promise<NewClientSplitDeployResult> {
  if (!input.ratio_type) {
    throw new Error("ratio_type is required for this strategy");
  }
  if (input.account_value == null) {
    throw new Error("account_value is required for this strategy");
  }

  const oldDefaults = await prisma.strategy_defaults.findUnique({
    where: { strategy_name: input.strategy },
  });
  const config = await resolveStrategyConfig(
    input.qcode ?? "",
    input.strategy,
    null,
    oldDefaults,
    new Date(),
  );

  const equity_pct = input.equity_pct ?? config.equity_pct;
  if (equity_pct == null) {
    throw new Error(`equity_pct not configured for '${input.strategy}'`);
  }
  const { cash_pct, lc_pct } = resolveCashLiquidcaseSplit(
    equity_pct,
    config.cash_pct,
    input.cash_pct,
    input.lc_pct,
  );
  const targetsSource: Level1TargetsSource = {
    equity_pct: input.equity_pct != null ? "override" : "computed",
    cash_pct: input.cash_pct != null ? "override" : "computed",
    lc_pct: input.lc_pct != null ? "override" : "computed",
  };

  const { fractions: subRatios } = await resolveDeployEquitySplit(
    input.ratio_type,
    input.strategy,
    input.qcode,
    input.reference_qcode,
    input.equity_group_split,
  );
  const equityGroups = await resolveEquityGroups();
  const equityLeavesByGroup = await Promise.all(
    equityGroups.map((g) =>
      resolveLeafSplitForNewClient(
        g.config_key,
        input.ratio_type!,
        input.strategy,
        input.qcode ?? "",
        input.reference_qcode,
        new Date(),
        input.equity_leaf_splits?.[g.config_key],
        true,
      ),
    ),
  );
  const liquidLeaves = await resolveLeafSplitForNewClient(
    "liquid_component",
    input.ratio_type,
    input.strategy,
    input.qcode ?? "",
    input.reference_qcode,
    new Date(),
    input.liquid_component_split,
    false,
  );

  const ltps = await fetchLtps([
    ...equityLeavesByGroup.flatMap((leaves) => leaves.map((l) => l.ltp_symbol)),
    ...liquidLeaves.map((l) => l.ltp_symbol),
  ]);

  const equityBookValue = input.account_value * equity_pct;
  const liquidcaseValue = input.account_value * lc_pct;
  const cashValue = input.account_value * cash_pct;

  const equitySleeves = equityGroups.map((g, i) => {
    const groupFraction = subRatios[g.config_key] ?? 0;
    return buildTargetGroupSleeve(
      g.label,
      groupFraction * equity_pct,
      equityBookValue * groupFraction,
      equityLeavesByGroup[i],
      ltps,
    );
  });
  const liquidcase = buildTargetGroupSleeve(
    "Liquidcase",
    lc_pct,
    liquidcaseValue,
    liquidLeaves,
    ltps,
  );

  const dust = equitySleeves.reduce((s, e) => s + e.dust, 0) + liquidcase.dust;

  const equityRollup: DeploySleeve = {
    particular: "Equity - Stock",
    target_pct: equity_pct,
    target_value: round(equityBookValue, 2)!,
    actual_value: round(equityBookValue, 2)!,
    ltp: null,
    quantity: null,
  };
  const cashTarget = round(cashValue, 2)!;
  const cashSleeve: DeploySleeve = {
    particular: "Cash",
    target_pct: cash_pct,
    target_value: cashTarget,
    actual_value: round(cashValue + dust, 2)!,
    ltp: null,
    quantity: null,
  };

  return {
    ratio_type: input.ratio_type,
    strategy: input.strategy,
    account_value: input.account_value,
    targets_source: targetsSource,
    sleeves: [
      equityRollup,
      ...equitySleeves.map((e) => e.sleeve),
      liquidcase.sleeve,
      cashSleeve,
    ],
  };
}

export interface NewClientFlatDeployResult {
  input_mode: "holdings" | "account_value" | "cash";
  strategy: string;
  account_value: number;
  sleeves: DeploySleeve[];
  targets_source: Level1TargetsSource;
}

async function computeNewClientFlatDeploy(
  input: DeployInput,
): Promise<NewClientFlatDeployResult> {
  if (!input.input_mode) {
    throw new Error("input_mode is required for this strategy");
  }
  if (input.value == null) {
    throw new Error("value is required for this strategy");
  }

  const oldDefaults = await prisma.strategy_defaults.findUnique({
    where: { strategy_name: input.strategy },
  });
  const config = await resolveStrategyConfig(
    input.qcode ?? "",
    input.strategy,
    null,
    oldDefaults,
    new Date(),
  );

  const equity_pct = input.equity_pct ?? config.equity_pct;
  if (equity_pct == null) {
    throw new Error(`equity_pct not configured for '${input.strategy}'`);
  }
  const { cash_pct, lc_pct } = resolveCashLiquidcaseSplit(
    equity_pct,
    config.cash_pct,
    input.cash_pct,
    input.lc_pct,
  );
  const targetsSource: Level1TargetsSource = {
    equity_pct: input.equity_pct != null ? "override" : "computed",
    cash_pct: input.cash_pct != null ? "override" : "computed",
    lc_pct: input.lc_pct != null ? "override" : "computed",
  };

  let account_value: number;
  if (input.input_mode === "holdings") {
    account_value = input.value / equity_pct;
  } else if (input.input_mode === "cash") {
    account_value = input.value / cash_pct;
  } else {
    account_value = input.value;
  }

  const liquidLeaves = await resolveLeafSplitForNewClient(
    "liquid_component",
    "current",
    input.strategy,
    input.qcode ?? "",
    input.reference_qcode,
    new Date(),
    input.liquid_component_split,
    false,
  );
  const ltps = await fetchLtps(liquidLeaves.map((l) => l.ltp_symbol));

  const holdingsValue = account_value * equity_pct;
  const liquidcaseValue = account_value * lc_pct;
  const cashValue = account_value * cash_pct;

  const liquidcase = buildTargetGroupSleeve(
    "Liquidcase",
    lc_pct,
    liquidcaseValue,
    liquidLeaves,
    ltps,
  );

  const holdingsSleeve: DeploySleeve = {
    particular: "Holdings",
    target_pct: equity_pct,
    target_value: round(holdingsValue, 2)!,
    actual_value: round(holdingsValue, 2)!,
    ltp: null,
    quantity: null,
  };
  const cashTarget = round(cashValue, 2)!;
  const cashSleeve: DeploySleeve = {
    particular: "Cash",
    target_pct: cash_pct,
    target_value: cashTarget,
    actual_value: round(cashValue + liquidcase.dust, 2)!,
    ltp: null,
    quantity: null,
  };

  return {
    input_mode: input.input_mode,
    strategy: input.strategy,
    account_value: round(account_value, 2)!,
    targets_source: targetsSource,
    sleeves: [holdingsSleeve, liquidcase.sleeve, cashSleeve],
  };
}

function computeAdditionalHoldingsGap(
  cashComponent: number,
  accountValue: number,
  derivBookPct: number,
): number {
  return cashComponent / derivBookPct - accountValue;
}

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
    cash_plus_liquid_component: cash + row.liquid_component_total,
  };
}

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
    const consoleQty =
      (toNum(c.quantity) ?? 0) + (toNum(c.collateral_quantity) ?? 0);
    const deployed = deployedEqBySymbol.get(c.symbol);
    const undeployedQty = Math.max(0, consoleQty - (deployed?.qty ?? 0));
    const price = deployed?.ltp ?? toNum(c.last_price) ?? 0;
    undeployedValue += undeployedQty * price;
  }

  for (const c of consoleMf) {
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
  addition_target: number;
  addition_actual: number;
  new_value: number;
  ltp: number | null;
  quantity: number | null;
  instruments?: GapDeploymentSleeve[];
  split_source?: "override" | "computed";
}

function buildGapGroupSleeve(
  groupLabel: string,
  leaves: EquityLeaf[],
  additionTarget: number,
  ltps: Map<string, number>,
  overrideWeights?: Record<string, number>,
): { sleeve: GapDeploymentSleeve; dust: number } {
  const currentTotal = leaves.reduce((s, l) => s + l.value, 0);
  const usingOverride =
    overrideWeights != null &&
    leaves.some((l) => overrideWeights[l.config_key] != null);
  const splitWeights = usingOverride
    ? leaves.map(
        (l) =>
          overrideWeights![l.config_key] ??
          (currentTotal > 0 ? l.value / currentTotal : 1 / leaves.length),
      )
    : leaves.map((l) => l.value);
  const shares =
    leaves.length > 0 ? allocateWithRounding(additionTarget, splitWeights) : [];
  let dust = 0;
  const instruments: GapDeploymentSleeve[] = leaves.map((leaf, i) => {
    const priced = buildPricedSleeve(
      leaf.console_symbol,
      0,
      shares[i] ?? 0,
      ltps.get(leaf.ltp_symbol),
    );
    dust += priced.dust;
    return {
      particular: leaf.console_symbol,
      current_value: round(leaf.value, 2)!,
      addition_target: priced.sleeve.target_value,
      addition_actual: priced.sleeve.actual_value,
      new_value: round(leaf.value + priced.sleeve.actual_value, 2)!,
      ltp: priced.sleeve.ltp,
      quantity: priced.sleeve.quantity,
    };
  });
  const totalActual = instruments.reduce(
    (s, inst) => s + inst.addition_actual,
    0,
  );
  return {
    sleeve: {
      particular: groupLabel,
      current_value: round(currentTotal, 2)!,
      addition_target: round(additionTarget, 2)!,
      addition_actual: round(totalActual, 2)!,
      new_value: round(currentTotal + totalActual, 2)!,
      ltp: null,
      quantity: null,
      instruments,
      split_source: usingOverride ? "override" : "computed",
    },
    dust,
  };
}

interface DeployOverrides {
  equity_group_split?: Record<string, number>;
  equity_leaf_splits?: Record<string, Record<string, number>>;
  liquid_component_split?: Record<string, number>;
}

async function computeGapSplit(
  row: CashMarginSnapshotRow,
  amountToAdd: number,
  qcode?: string,
  ratio_type?: NonNullable<DeployInput["ratio_type"]>,
  overrides: DeployOverrides = {},
): Promise<{ new_account_value: number; sleeves: GapDeploymentSleeve[] }> {
  const liquidLtps = await fetchLtps(
    row.liquid_group.leaves.map((l) => l.ltp_symbol),
  );

  if (!row.has_equity_split) {
    const holdingsSleeve: GapDeploymentSleeve = {
      particular: "Holdings",
      current_value: round(row.holdings, 2)!,
      addition_target: round(amountToAdd, 2)!,
      addition_actual: round(amountToAdd, 2)!,
      new_value: round(row.holdings + amountToAdd, 2)!,
      ltp: null,
      quantity: null,
    };
    const liquidcase = buildGapGroupSleeve(
      "Liquidcase",
      row.liquid_group.leaves,
      0,
      liquidLtps,
      overrides.liquid_component_split,
    );
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
      sleeves: [holdingsSleeve, liquidcase.sleeve, cashSleeve],
    };
  }

  const { fractions: subRatios } = await resolveDeployEquitySplit(
    ratio_type!,
    row.strategy,
    qcode!,
    qcode!,
    overrides.equity_group_split,
  );

  const equityLeafSymbols = row.equity_groups.flatMap((g) =>
    g.leaves.map((l) => l.ltp_symbol),
  );
  const ltps = await fetchLtps(equityLeafSymbols);

  const equitySleeves = row.equity_groups.map((g) =>
    buildGapGroupSleeve(
      g.label,
      g.leaves,
      amountToAdd * (subRatios[g.config_key] ?? 0),
      ltps,
      overrides.equity_leaf_splits?.[g.config_key],
    ),
  );
  const liquidcase = buildGapGroupSleeve(
    "Liquidcase",
    row.liquid_group.leaves,
    0,
    liquidLtps,
    overrides.liquid_component_split,
  );

  const equityDust = equitySleeves.reduce((s, e) => s + e.dust, 0);
  const dust = equityDust + liquidcase.dust;
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
    equitySleeves.reduce((s, e) => s + e.sleeve.addition_actual, 0) + dust;

  return {
    new_account_value: round(row.account_value + actualTotal, 2)!,
    sleeves: [
      ...equitySleeves.map((e) => e.sleeve),
      liquidcase.sleeve,
      cashSleeve,
    ],
  };
}

function computeExcessCashAvailable(
  accountValue: number,
  holdings: number,
  equityPct: number,
): number {
  return accountValue * equityPct - holdings;
}

async function computeExcessCashSplit(
  row: CashMarginSnapshotRow,
  targets: { equity_pct: number; cash_pct: number; lc_pct: number },
  amountDeployed: number,
  qcode?: string,
  ratio_type?: NonNullable<DeployInput["ratio_type"]>,
  overrides: DeployOverrides = {},
): Promise<{ sleeves: GapDeploymentSleeve[] }> {
  if (!row.has_equity_split) {
    const holdingsSleeve: GapDeploymentSleeve = {
      particular: "Holdings",
      current_value: round(row.holdings, 2)!,
      addition_target: round(amountDeployed, 2)!,
      addition_actual: round(amountDeployed, 2)!,
      new_value: round(row.holdings + amountDeployed, 2)!,
      ltp: null,
      quantity: null,
    };
    const newCashSnapped = targets.cash_pct * row.account_value;
    const cashChangeTarget = newCashSnapped - row.cash;
    const liquidcaseChangeTarget = -(amountDeployed + cashChangeTarget);
    const liquidLtps = await fetchLtps(
      row.liquid_group.leaves.map((l) => l.ltp_symbol),
    );
    const liquidcase = buildGapGroupSleeve(
      "Liquidcase",
      row.liquid_group.leaves,
      liquidcaseChangeTarget,
      liquidLtps,
      overrides.liquid_component_split,
    );
    const cashChangeActual = cashChangeTarget + liquidcase.dust;
    const cashSleeve: GapDeploymentSleeve = {
      particular: "Cash",
      current_value: round(row.cash, 2)!,
      addition_target: round(cashChangeTarget, 2)!,
      addition_actual: round(cashChangeActual, 2)!,
      new_value: round(row.cash + cashChangeActual, 2)!,
      ltp: null,
      quantity: null,
    };
    return { sleeves: [holdingsSleeve, liquidcase.sleeve, cashSleeve] };
  }

  const { fractions: subRatios } = await resolveDeployEquitySplit(
    ratio_type!,
    row.strategy,
    qcode!,
    qcode!,
    overrides.equity_group_split,
  );
  const equityLeafSymbols = row.equity_groups.flatMap((g) =>
    g.leaves.map((l) => l.ltp_symbol),
  );
  const liquidLeafSymbols = row.liquid_group.leaves.map((l) => l.ltp_symbol);
  const ltps = await fetchLtps([...equityLeafSymbols, ...liquidLeafSymbols]);

  const equitySleeves = row.equity_groups.map((g) =>
    buildGapGroupSleeve(
      g.label,
      g.leaves,
      amountDeployed * (subRatios[g.config_key] ?? 0),
      ltps,
      overrides.equity_leaf_splits?.[g.config_key],
    ),
  );

  const targetEquityTotal = equitySleeves.reduce(
    (s, e) => s + e.sleeve.addition_target,
    0,
  );
  const actualEquityTotal = equitySleeves.reduce(
    (s, e) => s + e.sleeve.addition_actual,
    0,
  );

  const newCashSnapped = targets.cash_pct * row.account_value;
  const cashChangeTarget = newCashSnapped - row.cash;
  const liquidcaseChangeTarget = -(targetEquityTotal + cashChangeTarget);
  const liquidcaseReconcileTarget = -(actualEquityTotal + cashChangeTarget);
  const liquidcase = buildGapGroupSleeve(
    "Liquidcase",
    row.liquid_group.leaves,
    liquidcaseReconcileTarget,
    ltps,
    overrides.liquid_component_split,
  );
  const cashChangeActual = cashChangeTarget + liquidcase.dust;

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
      ...equitySleeves.map((e) => e.sleeve),
      {
        ...liquidcase.sleeve,
        addition_target: round(liquidcaseChangeTarget, 2)!,
      },
      cashSleeve,
    ],
  };
}

async function computeSpecificDeployment(
  row: CashMarginSnapshotRow,
  targets: { equity_pct: number; cash_pct: number; lc_pct: number },
  amount: number,
  qcode?: string,
  ratio_type?: NonNullable<DeployInput["ratio_type"]>,
  overrides: DeployOverrides = {},
): Promise<{
  eq_book_amount: number | null;
  deriv_book_amount: number | null;
  new_account_value: number;
  sleeves: GapDeploymentSleeve[];
}> {
  const eqBookAmount = amount * targets.equity_pct;
  const derivBookAmount = amount * (1 - targets.equity_pct);
  const lcTarget =
    derivBookAmount * (targets.lc_pct / (targets.lc_pct + targets.cash_pct));
  const cashTarget =
    derivBookAmount * (targets.cash_pct / (targets.lc_pct + targets.cash_pct));

  if (!row.has_equity_split) {
    const holdingsSleeve: GapDeploymentSleeve = {
      particular: "Holdings",
      current_value: round(row.holdings, 2)!,
      addition_target: round(eqBookAmount, 2)!,
      addition_actual: round(eqBookAmount, 2)!,
      new_value: round(row.holdings + eqBookAmount, 2)!,
      ltp: null,
      quantity: null,
    };
    const liquidLtps = await fetchLtps(
      row.liquid_group.leaves.map((l) => l.ltp_symbol),
    );
    const liquidcase = buildGapGroupSleeve(
      "Liquidcase",
      row.liquid_group.leaves,
      lcTarget,
      liquidLtps,
      overrides.liquid_component_split,
    );
    const cashActual = round(cashTarget + liquidcase.dust, 2)!;
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
      eqBookAmount + liquidcase.sleeve.addition_actual + cashActual;
    return {
      eq_book_amount: null,
      deriv_book_amount: null,
      new_account_value: round(row.account_value + actualTotal, 2)!,
      sleeves: [holdingsSleeve, liquidcase.sleeve, cashSleeve],
    };
  }

  const { fractions: subRatios } = await resolveDeployEquitySplit(
    ratio_type!,
    row.strategy,
    qcode!,
    qcode!,
    overrides.equity_group_split,
  );
  const equityLeafSymbols = row.equity_groups.flatMap((g) =>
    g.leaves.map((l) => l.ltp_symbol),
  );
  const liquidLeafSymbols = row.liquid_group.leaves.map((l) => l.ltp_symbol);
  const ltps = await fetchLtps([...equityLeafSymbols, ...liquidLeafSymbols]);

  const equitySleeves = row.equity_groups.map((g) =>
    buildGapGroupSleeve(
      g.label,
      g.leaves,
      eqBookAmount * (subRatios[g.config_key] ?? 0),
      ltps,
      overrides.equity_leaf_splits?.[g.config_key],
    ),
  );
  const lc = buildGapGroupSleeve(
    "Liquidcase",
    row.liquid_group.leaves,
    lcTarget,
    ltps,
    overrides.liquid_component_split,
  );

  const dust = equitySleeves.reduce((s, e) => s + e.dust, 0) + lc.dust;
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
    equitySleeves.reduce((s, e) => s + e.sleeve.addition_actual, 0) +
    lc.sleeve.addition_actual +
    cashActual;

  return {
    eq_book_amount: round(eqBookAmount, 2)!,
    deriv_book_amount: round(derivBookAmount, 2)!,
    new_account_value: round(row.account_value + actualTotal, 2)!,
    sleeves: [...equitySleeves.map((e) => e.sleeve), lc.sleeve, cashSleeve],
  };
}

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

  if (excessOverIdeal <= 0) {
    return {
      ideal_cash: round(idealCash, 2)!,
      excess_cash_over_ideal: excessOverIdeal,
      blocked: true,
      sleeves: [],
    };
  }

  const liquidLtps = await fetchLtps(
    row.liquid_group.leaves.map((l) => l.ltp_symbol),
  );
  const liquidcase = buildGapGroupSleeve(
    "Liquidcase",
    row.liquid_group.leaves,
    excessOverIdeal,
    liquidLtps,
  );
  const cashActual = -excessOverIdeal + liquidcase.dust;

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
    sleeves: [liquidcase.sleeve, cashSleeve],
  };
}

export interface AdditionalCashRequiredResult {
  ideal_account_value: number;
  additional_cash_required: number;
  liquidcase_ideal: number;
  liquidcase_inflow: number;
  cash_ideal: number;
  cash_inflow: number;
}

export interface AdditionalHoldingsRequiredResult {
  gap: number;
  ratio_type: "current" | "ideal" | "model" | null;
  new_account_value: number;
  sleeves: GapDeploymentSleeve[];
  undeployed_stock_value: number | null;
  stock_deployed: number | null;
  remaining_gap_after_stock: number | null;
  partial_new_account_value: number | null;
  partial_sleeves: GapDeploymentSleeve[] | null;
}

export interface SpecificDeploymentResult {
  amount: number;
  ratio_type: "current" | "ideal" | "model" | null;
  eq_book_amount: number | null;
  deriv_book_amount: number | null;
  new_account_value: number;
  sleeves: GapDeploymentSleeve[];
}

export interface ExcessCashDeploymentResult {
  amount_available: number;
  blocked: boolean;
  ratio_type: "current" | "ideal" | "model" | null;
  full: { amount_deployed: number; sleeves: GapDeploymentSleeve[] } | null;
  partial: {
    amount_deployed: number;
    capped: boolean;
    sleeves: GapDeploymentSleeve[];
  } | null;
}

export interface LiquidCaseFromExcessCashResult {
  ideal_cash: number;
  excess_cash_over_ideal: number;
  blocked: boolean;
  sleeves: GapDeploymentSleeve[];
}

export interface RealClientDeployResult {
  targets_source: Level1TargetsSource;
  snapshot: CashMarginSnapshotRow;
  additional_cash_required: AdditionalCashRequiredResult;
  additional_holdings_required: AdditionalHoldingsRequiredResult | null;
  excess_cash_deployment: ExcessCashDeploymentResult;
  liquid_case_from_excess_cash: LiquidCaseFromExcessCashResult;
  specific_deployment: SpecificDeploymentResult | null;
}

async function computeRealClientDeploy(
  input: DeployInput,
  has_equity_split: boolean,
  oldDefaults: Awaited<ReturnType<typeof fetchStrategyDefaults>>,
): Promise<RealClientDeployResult> {
  const qcode = input.qcode!;
  const snapshot = await fetchCashMarginSnapshot(qcode);
  const row = snapshot.strategies.find((r) => r.strategy === input.strategy);
  if (!row) {
    throw new Error(`No active '${input.strategy}' row found for ${qcode}`);
  }

  const today = new Date().toISOString().split("T")[0];
  const allPairs = await fetchStrategyPairs("exposure_tag_suffix");
  const pair =
    allPairs.find(
      (p) =>
        p.qcode === qcode &&
        p.strategy === input.strategy &&
        isActive(p.effective_to, today),
    ) ?? null;
  const oldDefaultsRow = await prisma.strategy_defaults.findUnique({
    where: { strategy_name: input.strategy },
  });
  const config = await resolveStrategyConfig(
    qcode,
    input.strategy,
    pair,
    oldDefaultsRow,
    new Date(),
  );

  const equity_pct = input.equity_pct ?? config.equity_pct;
  if (equity_pct == null) {
    throw new Error(`equity_pct not configured for '${input.strategy}'`);
  }
  const { cash_pct, lc_pct } = resolveCashLiquidcaseSplit(
    equity_pct,
    config.cash_pct,
    input.cash_pct,
    input.lc_pct,
  );
  const derivBookPct = cash_pct + lc_pct;
  const targets = { equity_pct, cash_pct, lc_pct };
  const targetsSource: Level1TargetsSource = {
    equity_pct: input.equity_pct != null ? "override" : "computed",
    cash_pct: input.cash_pct != null ? "override" : "computed",
    lc_pct: input.lc_pct != null ? "override" : "computed",
  };
  const overrides: DeployOverrides = {
    equity_group_split: input.equity_group_split,
    equity_leaf_splits: input.equity_leaf_splits,
    liquid_component_split: input.liquid_component_split,
  };

  const pnlRow = applyTodayPnl(row, input.today_pnl);
  const pnlCashComponent = pnlRow.cash + pnlRow.liquid_component_total;

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
    liquidcase_inflow: round(
      liquidcaseIdeal - pnlRow.liquid_component_total,
      2,
    )!,
    cash_ideal: round(cashIdeal, 2)!,
    cash_inflow: round(cashIdeal - pnlRow.cash, 2)!,
  };

  const gap = computeAdditionalHoldingsGap(
    pnlCashComponent,
    pnlRow.account_value,
    derivBookPct,
  );

  let additional_holdings_required: AdditionalHoldingsRequiredResult | null;
  if (has_equity_split && !input.ratio_type) {
    additional_holdings_required = null;
  } else if (has_equity_split) {
    const split = await computeGapSplit(
      pnlRow,
      gap,
      qcode,
      input.ratio_type!,
      overrides,
    );
    additional_holdings_required = {
      gap: round(gap, 2)!,
      ratio_type: input.ratio_type!,
      new_account_value: split.new_account_value,
      sleeves: split.sleeves,
      undeployed_stock_value: null,
      stock_deployed: null,
      remaining_gap_after_stock: null,
      partial_new_account_value: null,
      partial_sleeves: null,
    };
  } else {
    const split = await computeGapSplit(
      pnlRow,
      gap,
      undefined,
      undefined,
      overrides,
    );
    const undeployedStockValue = await resolveUndeployedValue(
      qcode,
      input.strategy,
    );
    const stockDeployed = gap <= 0 ? 0 : Math.min(undeployedStockValue, gap);
    const remainingGap = gap - stockDeployed;
    const partialSplit = await computeGapSplit(
      pnlRow,
      stockDeployed,
      undefined,
      undefined,
      overrides,
    );
    additional_holdings_required = {
      gap: round(gap, 2)!,
      ratio_type: null,
      new_account_value: split.new_account_value,
      sleeves: split.sleeves,
      undeployed_stock_value: round(undeployedStockValue, 2)!,
      stock_deployed: round(stockDeployed, 2)!,
      remaining_gap_after_stock: round(remainingGap, 2)!,
      partial_new_account_value: partialSplit.new_account_value,
      partial_sleeves: partialSplit.sleeves,
    };
  }

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
    excess_cash_deployment = {
      amount_available: round(excessCashAvailable, 2)!,
      blocked: false,
      ratio_type: null,
      full: null,
      partial: null,
    };
  } else if (has_equity_split) {
    const full = await computeExcessCashSplit(
      row,
      targets,
      excessCashAvailable,
      qcode,
      input.ratio_type!,
      overrides,
    );
    let partial: ExcessCashDeploymentResult["partial"] = null;
    if (input.amount != null) {
      const capped = input.amount > excessCashAvailable;
      const amountDeployed = capped ? excessCashAvailable : input.amount;
      const partialSplit = await computeExcessCashSplit(
        row,
        targets,
        amountDeployed,
        qcode,
        input.ratio_type!,
        overrides,
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
    const full = await computeExcessCashSplit(
      row,
      targets,
      excessCashAvailable,
      undefined,
      undefined,
      overrides,
    );
    let partial: ExcessCashDeploymentResult["partial"] = null;
    if (input.amount != null) {
      const capped = input.amount > excessCashAvailable;
      const amountDeployed = capped ? excessCashAvailable : input.amount;
      const partialSplit = await computeExcessCashSplit(
        row,
        targets,
        amountDeployed,
        undefined,
        undefined,
        overrides,
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

  const liquid_case_from_excess_cash = await computeLiquidCaseFromExcessCash(
    row,
    cash_pct,
  );

  let specific_deployment: SpecificDeploymentResult | null = null;
  if (input.amount != null) {
    if (has_equity_split && input.ratio_type) {
      const split = await computeSpecificDeployment(
        row,
        targets,
        input.amount,
        qcode,
        input.ratio_type,
        overrides,
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
      const split = await computeSpecificDeployment(
        row,
        targets,
        input.amount,
        undefined,
        undefined,
        overrides,
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
    targets_source: targetsSource,
    snapshot: row,
    additional_cash_required,
    additional_holdings_required,
    excess_cash_deployment,
    liquid_case_from_excess_cash,
    specific_deployment,
  };
}

export async function computeDeploy(
  input: DeployInput,
): Promise<
  | NewClientSplitDeployResult
  | NewClientFlatDeployResult
  | RealClientDeployResult
> {
  const defaults = await fetchStrategyDefaults(input.strategy);
  const has_equity_split = await resolveHasEquitySplit(
    input.strategy,
    new Date(),
  );

  if (input.qcode) {
    return computeRealClientDeploy(input, has_equity_split, defaults);
  }

  return has_equity_split
    ? computeNewClientSplitDeploy(input)
    : computeNewClientFlatDeploy(input);
}

export interface ClientStrategyPairRow {
  id: number;
  qcode: string;
  account_name: string;
  strategy: string;
  exposure_tag_suffix: string;
  profit_tag_suffix: string;
  effective_from: string;
  effective_to: string | null;
}

export async function fetchClientStrategyPairs(filter: {
  qcode?: string;
  strategy?: string;
  as_of_date?: string;
}): Promise<ClientStrategyPairRow[]> {
  const rows = await prisma.client_strategy_configs.findMany({
    where: {
      qcode: filter.qcode ?? undefined,
      strategy: filter.strategy ?? undefined,
    },
    orderBy: [{ qcode: "asc" }, { strategy: "asc" }, { effective_from: "asc" }],
  });

  const asOf = filter.as_of_date;
  const filtered = asOf
    ? rows.filter((r) => {
        const from = r.effective_from
          ? new Date(r.effective_from).toISOString().slice(0, 10)
          : null;
        const to = r.effective_to
          ? new Date(r.effective_to).toISOString().slice(0, 10)
          : null;
        return (!from || from <= asOf) && (!to || to > asOf);
      })
    : rows;

  return filtered.map((r) => ({
    id: r.id,
    qcode: r.qcode,
    account_name: r.account_name,
    strategy: r.strategy,
    exposure_tag_suffix: r.exposure_tag_suffix,
    profit_tag_suffix: r.profit_tag_suffix,
    effective_from: r.effective_from
      ? new Date(r.effective_from).toISOString().slice(0, 10)
      : "",
    effective_to: r.effective_to
      ? new Date(r.effective_to).toISOString().slice(0, 10)
      : null,
  }));
}

export interface GroupedClientStrategyPairs {
  qcode: string;
  account_name: string;
  strategies: {
    id: number | null;
    strategy: string;
    effective_from: string;
    effective_to: string | null;
    profit_tag: string;
    exposure_tag: string;
  }[];
}

export async function fetchClientStrategyPairsGrouped(): Promise<
  GroupedClientStrategyPairs[]
> {
  const configs = await prisma.client_strategy_configs.findMany({
    orderBy: [{ qcode: "asc" }, { effective_from: "asc" }],
  });

  const today = new Date();

  const grouped = new Map<string, typeof configs>();
  for (const c of configs) {
    if (!grouped.has(c.qcode)) grouped.set(c.qcode, []);
    grouped.get(c.qcode)!.push(c);
  }

  const result: GroupedClientStrategyPairs[] = [];
  for (const [qcode, rows] of grouped) {
    const hasActive = rows.some(
      (r) => !r.effective_to || r.effective_to >= today,
    );
    if (!hasActive) continue;

    const minFrom = rows.reduce<Date>(
      (min, r) => (r.effective_from < min ? r.effective_from : min),
      rows[0].effective_from,
    );

    const hasZerodha = rows.some((r) =>
      r.exposure_tag_suffix.toLowerCase().includes("zerodha"),
    );

    result.push({
      qcode,
      account_name: rows[0].account_name,
      strategies: [
        ...rows.map((r) => ({
          id: r.id,
          strategy: r.strategy,
          effective_from: r.effective_from.toISOString().split("T")[0],
          effective_to: r.effective_to
            ? r.effective_to.toISOString().split("T")[0]
            : null,
          profit_tag: `${r.strategy} ${r.profit_tag_suffix}`,
          exposure_tag: `${r.strategy} ${r.exposure_tag_suffix}`,
        })),
        {
          id: null,
          strategy: "combined",
          effective_from: minFrom.toISOString().split("T")[0],
          effective_to: null,
          profit_tag: "Qode Total Portfolio",
          exposure_tag: hasZerodha
            ? "Zerodha Total Portfolio"
            : "Total Portfolio Exposure",
        },
      ],
    });
  }

  return result;
}

export interface CreateClientStrategyPairInput {
  qcode: string;
  account_name: string;
  strategy: string;
  exposure_tag_suffix: string;
  profit_tag_suffix: string;
  effective_from: string;
}

export async function createClientStrategyPair(
  input: CreateClientStrategyPairInput,
): Promise<ClientStrategyPairRow> {
  const account = await prisma.accounts.findUnique({
    where: { qcode: input.qcode },
  });
  if (!account) {
    throw new Error(
      `qcode '${input.qcode}' does not exist in accounts -- qcodes are auto-assigned when a real account is created, not chosen freely. Create the account first, or use an existing qcode.`,
    );
  }
  const existing = await prisma.client_strategy_configs.findFirst({
    where: {
      qcode: input.qcode,
      strategy: input.strategy,
      effective_from: new Date(input.effective_from),
    },
  });
  if (existing) {
    throw new Error(
      `A pair already exists for ${input.qcode}/${input.strategy} starting ${input.effective_from}`,
    );
  }
  const created = await prisma.client_strategy_configs.create({
    data: {
      qcode: input.qcode,
      account_name: input.account_name,
      strategy: input.strategy,
      exposure_tag_suffix: input.exposure_tag_suffix,
      profit_tag_suffix: input.profit_tag_suffix,
      effective_from: new Date(input.effective_from),
      effective_to: null,
    },
  });
  return {
    id: created.id,
    qcode: created.qcode,
    account_name: created.account_name,
    strategy: created.strategy,
    exposure_tag_suffix: created.exposure_tag_suffix,
    profit_tag_suffix: created.profit_tag_suffix,
    effective_from: new Date(created.effective_from).toISOString().slice(0, 10),
    effective_to: null,
  };
}

export interface UpdateClientStrategyPairInput {
  account_name?: string;
  exposure_tag_suffix?: string;
  profit_tag_suffix?: string;
}

export async function updateClientStrategyPair(
  qcode: string,
  strategy: string,
  effective_from: string,
  input: UpdateClientStrategyPairInput,
): Promise<ClientStrategyPairRow> {
  const existing = await prisma.client_strategy_configs.findFirst({
    where: { qcode, strategy, effective_from: new Date(effective_from) },
  });
  if (!existing) {
    throw new Error(
      `No pair found for ${qcode}/${strategy} starting ${effective_from}`,
    );
  }
  const updated = await prisma.client_strategy_configs.update({
    where: { id: existing.id },
    data: {
      account_name: input.account_name ?? undefined,
      exposure_tag_suffix: input.exposure_tag_suffix ?? undefined,
      profit_tag_suffix: input.profit_tag_suffix ?? undefined,
    },
  });
  return {
    id: updated.id,
    qcode: updated.qcode,
    account_name: updated.account_name,
    strategy: updated.strategy,
    exposure_tag_suffix: updated.exposure_tag_suffix,
    profit_tag_suffix: updated.profit_tag_suffix,
    effective_from: new Date(updated.effective_from).toISOString().slice(0, 10),
    effective_to: updated.effective_to
      ? new Date(updated.effective_to).toISOString().slice(0, 10)
      : null,
  };
}

export async function closeClientStrategyPair(
  qcode: string,
  strategy: string,
  effective_from: string,
  effective_to: string,
): Promise<ClientStrategyPairRow> {
  const existing = await prisma.client_strategy_configs.findFirst({
    where: { qcode, strategy, effective_from: new Date(effective_from) },
  });
  if (!existing) {
    throw new Error(
      `No pair found for ${qcode}/${strategy} starting ${effective_from}`,
    );
  }
  if (new Date(effective_to) < new Date(effective_from)) {
    throw new Error("effective_to cannot be before effective_from");
  }
  const updated = await prisma.client_strategy_configs.update({
    where: { id: existing.id },
    data: { effective_to: new Date(effective_to) },
  });
  return {
    id: updated.id,
    qcode: updated.qcode,
    account_name: updated.account_name,
    strategy: updated.strategy,
    exposure_tag_suffix: updated.exposure_tag_suffix,
    profit_tag_suffix: updated.profit_tag_suffix,
    effective_from: new Date(updated.effective_from).toISOString().slice(0, 10),
    effective_to: new Date(updated.effective_to!).toISOString().slice(0, 10),
  };
}

export async function deleteClientStrategyPair(
  qcode: string,
  strategy: string,
  effective_from: string,
  confirmed: boolean,
): Promise<{ deleted: true }> {
  if (!confirmed) {
    throw new Error(
      "Deleting a pair requires explicit confirmation that no computation has run against it since creation -- pass confirmed: true.",
    );
  }
  const existing = await prisma.client_strategy_configs.findFirst({
    where: { qcode, strategy, effective_from: new Date(effective_from) },
  });
  if (!existing) {
    throw new Error(
      `No pair found for ${qcode}/${strategy} starting ${effective_from}`,
    );
  }
  await prisma.client_strategy_configs.delete({ where: { id: existing.id } });
  return { deleted: true };
}

const THRESHOLD_KEYS = new Set([
  "psar_leverage",
  "psar_multiplier",
  "long_opt_pct",
  "drawdown_margin_pct",
  "cash_pct_healthy",
  "cash_pct_warning",
  "cash_pct_upside",
  "liquidcase_pct_gate",
  "cash_collateral_pct_healthy",
  "cash_collateral_pct_warning",
  "non_cash_collateral_pct_healthy",
  "non_cash_collateral_pct_warning",
]);

export interface ConfigValueRow {
  config_key: string;
  ratio_type: string;
  value: number | null;
  as_of_date: string;
  source: "client_override" | "strategy_default";
  updated_by: string | null;
  resolved_preview?: { as_of_today: number; note: string };
}

async function resolveParentChainPreview(
  configKey: string,
  ratioType: "ideal" | "model" | "value",
  strategy: string,
  qcode: string,
  value: number,
): Promise<{ as_of_today: number; note: string } | undefined> {
  const nodes = await prisma.config_catalog.findMany();
  const node = nodes.find((n) => n.config_key === configKey);
  if (!node || !node.parent_key) return undefined;

  const chainKeys: string[] = [];
  let current: string | null = node.parent_key;
  while (current) {
    chainKeys.push(current);
    current = nodes.find((n) => n.config_key === current)?.parent_key ?? null;
  }
  if (chainKeys.length === 0) return undefined;

  const ancestorValues = await fetchOwnValues(
    chainKeys,
    ratioType,
    strategy,
    qcode,
    new Date(),
  );
  let resolved = value;
  const parts: string[] = [`${value} is relative to ${node.parent_key}`];
  for (const key of chainKeys) {
    const v = ancestorValues.get(key);
    if (v != null) {
      resolved *= v;
      parts.push(`(currently ${v})`);
    }
  }
  return {
    as_of_today: round(resolved, 6)!,
    note: `${parts.join(" ")}. ${value} x ${chainKeys.map((k) => ancestorValues.get(k) ?? 1).join(" x ")} = ${round(resolved, 6)} of the ultimate root today -- will change if any ancestor changes.`,
  };
}

export async function fetchConfigValuesForStrategy(
  strategy: string,
  category: "ratio" | "threshold" | "all",
  as_of_date: string,
): Promise<ConfigValueRow[]> {
  const asOf = new Date(as_of_date);
  const defaultRows = await prisma.strategy_config_defaults.findMany({
    where: { strategy_name: strategy, as_of_date: { lte: asOf } },
    orderBy: { as_of_date: "desc" },
  });
  const latest = new Map<string, (typeof defaultRows)[number]>();
  for (const r of defaultRows) {
    const k = `${r.config_key}|${r.ratio_type}`;
    if (!latest.has(k)) latest.set(k, r);
  }
  const rows: ConfigValueRow[] = [];
  for (const r of latest.values()) {
    const isThreshold = THRESHOLD_KEYS.has(r.config_key);
    if (category === "ratio" && isThreshold) continue;
    if (category === "threshold" && !isThreshold) continue;
    const value = r.value != null ? Number(r.value) : null;
    const preview =
      value != null
        ? await resolveParentChainPreview(
            r.config_key,
            r.ratio_type as any,
            strategy,
            "",
            value,
          )
        : undefined;
    rows.push({
      config_key: r.config_key,
      ratio_type: r.ratio_type,
      value,
      as_of_date: r.as_of_date.toISOString().slice(0, 10),
      source: "strategy_default",
      updated_by: r.updated_by ?? null,
      resolved_preview: preview,
    });
  }
  return rows;
}

export async function fetchConfigValuesForClient(
  qcode: string,
  strategy: string,
  category: "ratio" | "threshold" | "all",
  as_of_date: string,
): Promise<ConfigValueRow[]> {
  const asOf = new Date(as_of_date);
  const [clientRows, defaultRows] = await Promise.all([
    prisma.client_config_values.findMany({
      where: { qcode, strategy, as_of_date: { lte: asOf } },
      orderBy: { as_of_date: "desc" },
    }),
    prisma.strategy_config_defaults.findMany({
      where: { strategy_name: strategy, as_of_date: { lte: asOf } },
      orderBy: { as_of_date: "desc" },
    }),
  ]);
  const latestClient = new Map<string, (typeof clientRows)[number]>();
  for (const r of clientRows) {
    const k = `${r.config_key}|${r.ratio_type}`;
    if (!latestClient.has(k)) latestClient.set(k, r);
  }
  const latestDefault = new Map<string, (typeof defaultRows)[number]>();
  for (const r of defaultRows) {
    const k = `${r.config_key}|${r.ratio_type}`;
    if (!latestDefault.has(k)) latestDefault.set(k, r);
  }
  const allKeys = new Set([...latestClient.keys(), ...latestDefault.keys()]);
  const rows: ConfigValueRow[] = [];
  for (const k of allKeys) {
    const [config_key, ratio_type] = k.split("|");
    const isThreshold = THRESHOLD_KEYS.has(config_key);
    if (category === "ratio" && isThreshold) continue;
    if (category === "threshold" && !isThreshold) continue;
    const clientRow = latestClient.get(k);
    const defaultRow = latestDefault.get(k);
    const source: ConfigValueRow["source"] = clientRow
      ? "client_override"
      : "strategy_default";
    const row = clientRow ?? defaultRow!;
    const value = row.value != null ? Number(row.value) : null;
    const preview =
      value != null
        ? await resolveParentChainPreview(
            config_key,
            ratio_type as any,
            strategy,
            qcode,
            value,
          )
        : undefined;
    rows.push({
      config_key,
      ratio_type,
      value,
      as_of_date: row.as_of_date.toISOString().slice(0, 10),
      source,
      updated_by: row.updated_by ?? null,
      resolved_preview: preview,
    });
  }
  return rows;
}

export interface WriteConfigValueInput {
  config_key: string;
  ratio_type: "ideal" | "model" | "value";
  value: number | null;
  as_of_date: string;
  updated_by: string;
}

async function validateRatioTypeAllowed(
  configKey: string,
  ratioType: string,
): Promise<void> {
  const node = await prisma.config_catalog.findUnique({
    where: { config_key: configKey },
  });
  if (!node) {
    throw new Error(`config_key '${configKey}' not found in catalog`);
  }
  const allowed = (node.allowed_ratio_types as string[] | null) ?? [];
  if (allowed.length > 0 && !allowed.includes(ratioType)) {
    throw new Error(
      `ratio_type '${ratioType}' is not valid for '${configKey}' -- allowed: ${allowed.join(", ") || "(none configured)"}`,
    );
  }
}

export async function writeStrategyConfigValue(
  strategy: string,
  input: WriteConfigValueInput,
): Promise<{ written: boolean; reason?: string; row?: ConfigValueRow }> {
  await validateRatioTypeAllowed(input.config_key, input.ratio_type);

  const latest = await prisma.strategy_config_defaults.findFirst({
    where: {
      strategy_name: strategy,
      config_key: input.config_key,
      ratio_type: input.ratio_type,
    },
    orderBy: { as_of_date: "desc" },
  });
  const latestValue = latest?.value != null ? Number(latest.value) : null;
  if (latestValue === input.value) {
    return {
      written: false,
      reason: `value unchanged from latest row (${latest?.as_of_date.toISOString().slice(0, 10)})`,
    };
  }

  await prisma.strategy_config_defaults.create({
    data: {
      strategy_name: strategy,
      config_key: input.config_key,
      ratio_type: input.ratio_type,
      value: input.value,
      as_of_date: new Date(input.as_of_date),
      updated_by: input.updated_by,
    },
  });

  const preview =
    input.value != null
      ? await resolveParentChainPreview(
          input.config_key,
          input.ratio_type,
          strategy,
          "",
          input.value,
        )
      : undefined;

  return {
    written: true,
    row: {
      config_key: input.config_key,
      ratio_type: input.ratio_type,
      value: input.value,
      as_of_date: input.as_of_date,
      source: "strategy_default",
      updated_by: input.updated_by,
      resolved_preview: preview,
    },
  };
}

export async function writeClientConfigValue(
  qcode: string,
  strategy: string,
  input: WriteConfigValueInput,
): Promise<{ written: boolean; reason?: string; row?: ConfigValueRow }> {
  await validateRatioTypeAllowed(input.config_key, input.ratio_type);

  const latest = await prisma.client_config_values.findFirst({
    where: {
      qcode,
      strategy,
      config_key: input.config_key,
      ratio_type: input.ratio_type,
    },
    orderBy: { as_of_date: "desc" },
  });
  const latestValue = latest?.value != null ? Number(latest.value) : null;
  if (latestValue === input.value) {
    return {
      written: false,
      reason: `value unchanged from latest row (${latest?.as_of_date.toISOString().slice(0, 10)})`,
    };
  }

  await prisma.client_config_values.create({
    data: {
      qcode,
      strategy,
      config_key: input.config_key,
      ratio_type: input.ratio_type,
      value: input.value,
      as_of_date: new Date(input.as_of_date),
      updated_by: input.updated_by,
    },
  });

  const preview =
    input.value != null
      ? await resolveParentChainPreview(
          input.config_key,
          input.ratio_type,
          strategy,
          qcode,
          input.value,
        )
      : undefined;

  return {
    written: true,
    row: {
      config_key: input.config_key,
      ratio_type: input.ratio_type,
      value: input.value,
      as_of_date: input.as_of_date,
      source: "client_override",
      updated_by: input.updated_by,
      resolved_preview: preview,
    },
  };
}

export interface ResolvedConfigTreeNode {
  config_key: string;
  label: string;
  ratio_type: string | null;
  own_value: number | null;
  source: "client_override" | "strategy_default" | "not_configured";
  children: ResolvedConfigTreeNode[];
}

async function resolveConfigTreeNode(
  node: { config_key: string; label: string; allowed_ratio_types: string[] },
  childrenByParent: Map<
    string,
    { config_key: string; label: string; allowed_ratio_types: string[] }[]
  >,
  strategy: string,
  qcode: string,
  preferredRatioType: "ideal" | "model",
  asOfDate: Date,
): Promise<ResolvedConfigTreeNode> {
  const allowed = node.allowed_ratio_types;
  let ratioType: "ideal" | "model" | "value" | null = null;
  if (allowed.includes(preferredRatioType)) {
    ratioType = preferredRatioType;
  } else if (allowed.includes("value")) {
    ratioType = "value";
  } else if (allowed.length > 0) {
    ratioType = allowed[0] as "ideal" | "model" | "value";
  }

  let own_value: number | null = null;
  let source: ResolvedConfigTreeNode["source"] = "not_configured";
  if (ratioType) {
    const clientRow = qcode
      ? await prisma.client_config_values.findFirst({
          where: {
            qcode,
            strategy,
            config_key: node.config_key,
            ratio_type: ratioType,
            as_of_date: { lte: asOfDate },
          },
          orderBy: { as_of_date: "desc" },
        })
      : null;
    if (clientRow && clientRow.value != null) {
      own_value = Number(clientRow.value);
      source = "client_override";
    } else {
      const defaultRow = await prisma.strategy_config_defaults.findFirst({
        where: {
          strategy_name: strategy,
          config_key: node.config_key,
          ratio_type: ratioType,
          as_of_date: { lte: asOfDate },
        },
        orderBy: { as_of_date: "desc" },
      });
      if (defaultRow && defaultRow.value != null) {
        own_value = Number(defaultRow.value);
        source = "strategy_default";
      }
    }
  }

  const childNodes = childrenByParent.get(node.config_key) ?? [];
  const children = await Promise.all(
    childNodes.map((c) =>
      resolveConfigTreeNode(
        c,
        childrenByParent,
        strategy,
        qcode,
        preferredRatioType,
        asOfDate,
      ),
    ),
  );

  return {
    config_key: node.config_key,
    label: node.label,
    ratio_type: own_value != null ? ratioType : null,
    own_value,
    source: own_value != null ? source : "not_configured",
    children,
  };
}

export async function fetchResolvedConfigTree(
  strategy: string,
  qcode: string,
  ratio_type: "ideal" | "model" = "ideal",
  as_of_date: string = new Date().toISOString().slice(0, 10),
): Promise<ResolvedConfigTreeNode[]> {
  const allNodes = await prisma.config_catalog.findMany();
  const childrenByParent = new Map<string, typeof allNodes>();
  for (const n of allNodes) {
    if (!n.parent_key) continue;
    if (!childrenByParent.has(n.parent_key))
      childrenByParent.set(n.parent_key, []);
    childrenByParent.get(n.parent_key)!.push(n);
  }
  const roots = allNodes.filter((n) => !n.parent_key);
  const asOf = new Date(as_of_date);

  return Promise.all(
    roots.map((r) =>
      resolveConfigTreeNode(
        {
          config_key: r.config_key,
          label: r.label,
          allowed_ratio_types: (r.allowed_ratio_types as string[] | null) ?? [],
        },
        childrenByParent as any,
        strategy,
        qcode,
        ratio_type,
        asOf,
      ),
    ),
  );
}

export interface TreePreviewInput {
  strategy: string;
  qcode?: string;
  ratio_type: "ideal" | "model";
  overrides: Record<string, number>;
}

export async function previewResolvedConfigTree(
  input: TreePreviewInput,
): Promise<ResolvedConfigTreeNode[]> {
  const tree = await fetchResolvedConfigTree(
    input.strategy,
    input.qcode ?? "",
    input.ratio_type,
  );
  const applyOverrides = (
    node: ResolvedConfigTreeNode,
  ): ResolvedConfigTreeNode => {
    const overridden = input.overrides[node.config_key];
    return {
      ...node,
      own_value: overridden ?? node.own_value,
      source: overridden != null ? "client_override" : node.source,
      children: node.children.map(applyOverrides),
    };
  };
  return tree.map(applyOverrides);
}

export interface GlobalConfigRow {
  key: string;
  value: string;
  data_type: string;
  updated_by: string | null;
  updated_at: string;
}

export async function fetchGlobalConfig(
  key?: string,
): Promise<GlobalConfigRow[]> {
  const rows = await prisma.global_config.findMany({
    where: key ? { key } : undefined,
    orderBy: { key: "asc" },
  });
  return rows.map((r) => ({
    key: r.key,
    value: r.value,
    data_type: r.data_type,
    updated_by: r.updated_by ?? null,
    updated_at: r.updated_at.toISOString(),
  }));
}

export interface CreateGlobalConfigInput {
  key: string;
  value: string;
  data_type?: string;
  updated_by: string;
}

export async function createGlobalConfigEntry(
  input: CreateGlobalConfigInput,
): Promise<GlobalConfigRow> {
  const existing = await prisma.global_config.findUnique({
    where: { key: input.key },
  });
  if (existing) {
    throw new Error(
      `global_config key '${input.key}' already exists -- use update instead`,
    );
  }
  const created = await prisma.global_config.create({
    data: {
      key: input.key,
      value: input.value,
      data_type: input.data_type ?? "string",
      updated_by: input.updated_by,
    },
  });
  return {
    key: created.key,
    value: created.value,
    data_type: created.data_type,
    updated_by: created.updated_by ?? null,
    updated_at: created.updated_at.toISOString(),
  };
}

export interface UpdateGlobalConfigInput {
  value?: string;
  data_type?: string;
  updated_by: string;
}

export async function updateGlobalConfigEntry(
  key: string,
  input: UpdateGlobalConfigInput,
): Promise<GlobalConfigRow> {
  const existing = await prisma.global_config.findUnique({ where: { key } });
  if (!existing) {
    throw new Error(`global_config key '${key}' not found`);
  }
  const updated = await prisma.global_config.update({
    where: { key },
    data: {
      value: input.value ?? undefined,
      data_type: input.data_type ?? undefined,
      updated_by: input.updated_by,
    },
  });
  return {
    key: updated.key,
    value: updated.value,
    data_type: updated.data_type,
    updated_by: updated.updated_by ?? null,
    updated_at: updated.updated_at.toISOString(),
  };
}

export async function deleteGlobalConfigEntry(
  key: string,
  confirmed: boolean,
): Promise<{ deleted: true }> {
  if (!confirmed) {
    throw new Error(
      `Deleting global_config key '${key}' requires explicit confirmation -- this table has no known consumer inventory, so the blast radius of removing a key that's actually in use elsewhere is unknown. Pass confirmed: true.`,
    );
  }
  const existing = await prisma.global_config.findUnique({ where: { key } });
  if (!existing) {
    throw new Error(`global_config key '${key}' not found`);
  }
  await prisma.global_config.delete({ where: { key } });
  return { deleted: true };
}
