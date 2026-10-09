import { round, MS, mean, std, toDisplayDate } from "@/lib/utils";
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
  // Blended: pure absolute below 1yr tenure, CAGR at/above — see
  // calcSinceInception. No separate XIRR field any more: this is now the
  // single displayed return figure everywhere TagMetrics is used.
  since_inception: number | null;
  since_inception_pnl: number;
  cagr: number | null;
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
 * tenure crosses a year. Only used internally as the annualized-ish return
 * in calcRatios (Calmar/Sortino) — never as a displayed "Since Inception"
 * figure: every since_inception field shown on the dashboard is the pure
 * absolute return (calcSinceInceptionAbsolute), with XIRR as its own
 * separate field, so the two are never blended into one number.
 *
 * UPDATE: this is now what buildTagMetrics' `since_inception` actually
 * sends — XIRR (cash-flow/money-weighted) has been retired in favor of
 * this NAV-based blend everywhere. calcSinceInceptionAbsolute below is kept
 * only as a building block for calcTrailingReturns-style callers that want
 * pure absolute explicitly; it is no longer a separately displayed field.
 */
export function calcSinceInception(nav: NavPoint[]): number | null {
  if (nav.length < 2) return null;
  // baseNav's date is ALWAYS one day before nav[0].date when it comes from
  // a real prev_nav — "prev" means the prior trading day's value, by
  // definition — so the days-count must anchor there too, not at
  // nav[0].date. Using nav[0].date regardless of where baseNav came from
  // (the previous version of this function) undercounted the period by one
  // day whenever prev_nav was real, which is the common case. With no real
  // prev_nav (brand-new series, nothing before it), there's no earlier date
  // to anchor to, so day 0 stays nav[0].date itself. This also reproduces
  // the client-facing dashboard's (portfolio-utils.ts) number exactly: it
  // prepends a synthetic nav=100 point dated firstRow.date - 1 and anchors
  // its own days-count there, which is the same date this lands on here.
  const hasRealPrevNav = nav[0].prev_nav != null && nav[0].prev_nav > 0;
  const baseNav = hasRealPrevNav ? nav[0].prev_nav! : 100;
  const anchorTime = hasRealPrevNav
    ? nav[0].date.getTime() - MS
    : nav[0].date.getTime();
  const days = (nav[nav.length - 1].date.getTime() - anchorTime) / MS;
  const endNav = nav[nav.length - 1].nav;
  if (endNav <= 0 || baseNav <= 0 || days <= 0) return null;
  return round(
    days < 365 ? endNav / baseNav - 1 : (endNav / baseNav) ** (365 / days) - 1,
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
  // Same baseline + anchor-date convention as calcSinceInception — see its
  // comment.
  const hasRealPrevNav = nav[0].prev_nav != null && nav[0].prev_nav > 0;
  const baseNav = hasRealPrevNav ? nav[0].prev_nav! : 100;
  const anchorTime = hasRealPrevNav
    ? nav[0].date.getTime() - MS
    : nav[0].date.getTime();
  const days = (nav[nav.length - 1].date.getTime() - anchorTime) / MS;
  const endNav = nav[nav.length - 1].nav;
  if (endNav <= 0 || baseNav <= 0 || days <= 0) return null;
  return round((endNav / baseNav) ** (365 / days) - 1, 4);
}

export interface TrailingReturnPoint {
  pct: number | null;
  pnl_inr: number | null;
}

// since-inception is intentionally not part of this set — it's already a
// first-class field alongside trailing_returns on every row (since_inception /
// since_inception_absolute), so repeating it here was pure duplication.
export interface TrailingReturns {
  five_day: TrailingReturnPoint;
  ten_day: TrailingReturnPoint;
  fifteen_day: TrailingReturnPoint;
  one_month: TrailingReturnPoint;
  three_month: TrailingReturnPoint;
  six_month: TrailingReturnPoint;
  one_year: TrailingReturnPoint;
  two_year: TrailingReturnPoint;
  three_year: TrailingReturnPoint;
  four_year: TrailingReturnPoint;
  five_year: TrailingReturnPoint;
}

const TRAILING_PERIODS: {
  key: keyof TrailingReturns;
  days: number;
}[] = [
  { key: "five_day", days: 5 },
  { key: "ten_day", days: 10 },
  { key: "fifteen_day", days: 15 },
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
 * null rather than approximated from a shorter window. `pnl_inr` is the
 * rupee P&L actually booked inside that window (sum of each NAV point's
 * own `pnl` after the window's start), alongside the existing % figure.
 */
export function calcTrailingReturns(nav: NavPoint[]): TrailingReturns {
  const empty: TrailingReturnPoint = { pct: null, pnl_inr: null };
  const result: TrailingReturns = {
    five_day: { ...empty },
    ten_day: { ...empty },
    fifteen_day: { ...empty },
    one_month: { ...empty },
    three_month: { ...empty },
    six_month: { ...empty },
    one_year: { ...empty },
    two_year: { ...empty },
    three_year: { ...empty },
    four_year: { ...empty },
    five_year: { ...empty },
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

  const pnlAfter = (target: Date): number =>
    parseFloat(
      nav
        .filter((p) => p.date.getTime() > target.getTime())
        .reduce((s, p) => s + p.pnl, 0)
        .toFixed(2),
    );

  for (const period of TRAILING_PERIODS) {
    const windowStart = new Date(end.date.getTime() - period.days * MS);
    if (windowStart.getTime() < firstDate.getTime()) continue;
    const startNav = navAtOrBefore(windowStart);
    if (startNav == null || startNav <= 0 || end.nav <= 0) continue;
    result[period.key] = {
      pct: round(
        period.days < 365
          ? end.nav / startNav - 1
          : (end.nav / startNav) ** (365 / period.days) - 1,
        4,
      ),
      pnl_inr: pnlAfter(windowStart),
    };
  }
  return result;
}

/**
 * Drawdown path (fractions, ≤ 0) by peak-tracking on NAV from the period's
 * own starting value — the first row's prev_nav (its t-1 value), else its
 * own nav. One rule for every page: over full history this matches the DB
 * `drawdown` column (verified ≤ 0.005pp), but unlike that column it also
 * stays correct when the series is windowed by a start date — the stored
 * column keeps remembering peaks from before the window.
 */
function drawdownPath(nav: NavPoint[]): number[] {
  const first = nav[0];
  let peak = first.prev_nav != null && first.prev_nav > 0 ? first.prev_nav : first.nav;
  return nav.map((p) => {
    if (p.nav > peak) peak = p.nav;
    return peak > 0 ? (p.nav - peak) / peak : 0;
  });
}

export function calcMaxDrawdown(nav: NavPoint[]): number | null {
  if (nav.length === 0) return null;
  return round(Math.min(0, ...drawdownPath(nav)), 4);
}

export function calcCurrentDrawdown(nav: NavPoint[]): number | null {
  if (nav.length === 0) return null;
  const path = drawdownPath(nav);
  return round(path[path.length - 1], 4);
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

  // Annualized on 365 calendar days, not 252 trading days — matches every
  // other annualization in this file (calcSinceInception, calcCagr,
  // calcTrailingReturns all use 365), so Sharpe/Sortino/vol don't silently
  // run on a different calendar than since_inception/CAGR.
  const rfDaily = (1 + rfr) ** (1 / 365) - 1;
  const s = std(daily);
  const annVol = s > 0 ? s * Math.sqrt(365) : null;
  const sharpe =
    s > 0
      ? round((mean(daily.map((r) => r - rfDaily)) / s) * Math.sqrt(365), 3)
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
    downsideDev = std(down) * Math.sqrt(365);
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
): TagMetrics {
  const monthly = calcMonthlyReturns(nav);
  const quarterly = calcQuarterlyReturns(monthly);
  const yearly = calcYearlyReturns(monthly);
  return {
    // Display-only (rendered as raw text on Client Dashboard) — DD-MM-YYYY.
    // `series[].date` below stays ISO: it's re-parsed/sorted by the frontend.
    start_date: toDisplayDate(nav[0].date.toISOString().split("T")[0]),
    end_date: toDisplayDate(nav[nav.length - 1].date.toISOString().split("T")[0]),
    // Blended NAV-based return (absolute <1yr, CAGR >=1yr) — replaces the
    // old cash-flow XIRR as the single displayed return figure.
    since_inception: calcSinceInception(nav),
    since_inception_pnl: calcSiPnl(nav),
    cagr: calcCagr(nav),
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
