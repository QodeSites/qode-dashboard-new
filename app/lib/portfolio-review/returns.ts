import { round, MS, mean, std } from "@/lib/utils";
import type { NavPoint } from "@/app/lib/internal-utils";

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
  since_inception_absolute: number | null;
  cagr: number | null;
  xirr: number | null;
  max_drawdown: number | null;
  current_drawdown: number | null;
  ratios: Ratios;
  monthly: MonthlyReturn[];
  quarterly: QuarterlyReturn[];
  yearly: YearlyReturn[];
  series: { date: string; nav: number; drawdown: number }[];
}

/**
 * <1yr/≥1yr branching return: plain absolute below 1yr tenure, CAGR once
 * tenure crosses a year. Unchanged/untouched — TagMetrics.since_inception
 * keeps exactly this value, same as every other consumer of this function
 * (Calmar in calcRatios, StrategyBreakupRow, StrategyMonthlyRow, etc.).
 * `cagr` below is purely additive, not a replacement for this field.
 */
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

/** Pure absolute since-inception return — ((endNav/baseNav) - 1), never
 * annualized/CAGR'd regardless of tenure. Distinct from calcSinceInception
 * above, which branches to CAGR past 1yr; this one is for callers that
 * explicitly want "Since Inception (Absolute)" as its own column alongside
 * XIRR, not a tenure-dependent blend of the two. */
export function calcSinceInceptionAbsolute(nav: NavPoint[]): number | null {
  if (nav.length < 1) return null;
  const baseNav =
    nav[0].prev_nav != null && nav[0].prev_nav > 0 ? nav[0].prev_nav : 100;
  const endNav = nav[nav.length - 1].nav;
  if (endNav <= 0 || baseNav <= 0) return null;
  return round(endNav / baseNav - 1, 4);
}

/** Compound Annual Growth Rate, always annualized regardless of tenure —
 * new, additive field alongside since_inception (which stays as-is above).
 * For <1yr tenure this will look inflated (annualizing a short period
 * always does); that's expected for a metric explicitly labeled CAGR. */
export function calcCagr(nav: NavPoint[]): number | null {
  if (nav.length < 2) return null;
  const days =
    (nav[nav.length - 1].date.getTime() - nav[0].date.getTime()) / MS;
  const startNav = nav[0].nav;
  const endNav = nav[nav.length - 1].nav;
  if (endNav <= 0 || startNav <= 0 || days <= 0) return null;
  return round((endNav / startNav) ** (365 / days) - 1, 4);
}

export interface TrailingReturns {
  one_month: number | null;
  three_month: number | null;
  six_month: number | null;
  one_year: number | null;
  two_year: number | null;
  three_year: number | null;
  four_year: number | null;
  five_year: number | null;
  since_inception: number | null;
}

const TRAILING_PERIODS: {
  key: Exclude<keyof TrailingReturns, "since_inception">;
  days: number;
}[] = [
  { key: "one_month", days: 30 },
  { key: "three_month", days: 90 },
  { key: "six_month", days: 180 },
  { key: "one_year", days: 365 },
  { key: "two_year", days: 730 },
  { key: "three_year", days: 1095 },
  { key: "four_year", days: 1460 },
  { key: "five_year", days: 1825 },
];

/**
 * Point-in-time trailing returns as of the NAV series' last date — same
 * <1yr absolute / ≥1yr CAGR convention as calcSinceInception (and the
 * frontend's own trailing-returns-table.tsx). A period whose window would
 * start before the series' first point (not enough history yet) is left
 * null rather than approximated from a shorter window.
 */
export function calcTrailingReturns(nav: NavPoint[]): TrailingReturns {
  const result: TrailingReturns = {
    one_month: null,
    three_month: null,
    six_month: null,
    one_year: null,
    two_year: null,
    three_year: null,
    four_year: null,
    five_year: null,
    since_inception: calcSinceInception(nav),
  };
  if (nav.length < 2) return result;

  const end = nav[nav.length - 1];
  const firstDate = nav[0].date;

  const navAtOrBefore = (target: Date): number | null => {
    let candidate: NavPoint | null = null;
    for (const p of nav) {
      if (p.date.getTime() > target.getTime()) break;
      candidate = p;
    }
    return candidate ? candidate.nav : null;
  };

  for (const period of TRAILING_PERIODS) {
    const windowStart = new Date(end.date.getTime() - period.days * MS);
    if (windowStart.getTime() < firstDate.getTime()) continue;
    const startNav = navAtOrBefore(windowStart);
    if (startNav == null || startNav <= 0 || end.nav <= 0) continue;
    result[period.key] = round(
      period.days < 365
        ? end.nav / startNav - 1
        : (end.nav / startNav) ** (365 / period.days) - 1,
      4,
    );
  }
  return result;
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

export const MONTHS = [
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

export function buildTagMetrics(
  nav: NavPoint[],
  rfr: number,
  xirr: number | null = null,
): TagMetrics {
  const monthly = calcMonthlyReturns(nav);
  const quarterly = calcQuarterlyReturns(monthly);
  const yearly = calcYearlyReturns(monthly);
  return {
    start_date: nav[0].date.toISOString().split("T")[0],
    end_date: nav[nav.length - 1].date.toISOString().split("T")[0],
    since_inception: calcSinceInception(nav),
    since_inception_pnl: calcSiPnl(nav),
    since_inception_absolute: calcSinceInceptionAbsolute(nav),
    cagr: calcCagr(nav),
    xirr,
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
