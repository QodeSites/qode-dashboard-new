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

export async function fetchBenchmark(
  startDate: Date,
  endDate: Date,
): Promise<BenchmarkResult | null> {
  const buf = new Date(startDate);
  buf.setDate(buf.getDate() - 10);

  // Use ISO date strings for comparison to avoid timezone drift
  const startStr = startDate.toISOString().split("T")[0];
  const endStr = endDate.toISOString().split("T")[0];

  try {
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
    if (!Array.isArray(raw) || raw.length === 0) return null;

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
  } catch {
    return null;
  }
}
