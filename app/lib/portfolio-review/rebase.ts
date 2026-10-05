import type { NavPoint } from "@/app/lib/internal-utils";

export interface RebasedWindow {
  // Date of the real row the window was rebased off (last row strictly
  // before `from`), or null when the series has no row before `from`
  // (inception on/after the window start) — the caller then picks the
  // anchor date itself, see anchorDateBefore.
  anchorDate: Date | null;
  // In-window points only, rebased so the t-1 value is 100. The anchor row
  // itself is deliberately NOT included: its own pnl belongs to the day
  // before the window, and its date can fall in the previous month —
  // feeding it into calcSiPnl/calcMonthlyReturns would leak that day's P&L
  // and create a spurious 0% month. Instead prev_nav is chained (first
  // point's prev_nav = 100), which is exactly how those calcs already pick
  // up day 1's return from the DB's own prev_nav.
  points: NavPoint[];
}

const iso = (d: Date) => d.toISOString().split("T")[0];

/**
 * Rebases `nav` to 100 at t-1 for the window [from, to] — same reference
 * convention as computeBenchmarkMetrics (last value strictly before the
 * start date), so the portfolio and Nifty lines share one 100-point.
 *
 * When there's no row before `from`, the account started inside the window:
 * the base is the first row's own prev_nav (the value before its day-1
 * return, normally 100), so day 1's return isn't lost.
 *
 * Drawdown is recomputed by peak-tracking from the 100 baseline — the
 * stored `drawdown` column is relative to full account history and would
 * be wrong for a custom window.
 *
 * Returns null only when no data falls inside [from, to].
 */
export function rebaseNavWindow(
  nav: NavPoint[],
  from: Date,
  to: Date,
): RebasedWindow | null {
  const fromStr = iso(from);
  const toStr = iso(to);
  const inWindow = nav.filter((p) => {
    const d = iso(p.date);
    return d >= fromStr && d <= toStr;
  });
  if (inWindow.length === 0) return null;

  const earlier = nav.filter((p) => iso(p.date) < fromStr);
  let base: number;
  let anchorDate: Date | null;
  if (earlier.length > 0) {
    const ref = earlier[earlier.length - 1];
    base = ref.nav;
    anchorDate = ref.date;
  } else {
    const first = inWindow[0];
    base = first.prev_nav != null && first.prev_nav > 0 ? first.prev_nav : first.nav;
    anchorDate = null;
  }
  if (base <= 0) return null;

  let peak = 100;
  let prev = 100;
  const points = inWindow.map((p) => {
    const rebased = (p.nav / base) * 100;
    if (rebased > peak) peak = rebased;
    const point: NavPoint = {
      date: p.date,
      nav: rebased,
      prev_nav: prev,
      drawdown: peak > 0 ? ((rebased - peak) / peak) * 100 : 0,
      pnl: p.pnl,
      portfolio_value: p.portfolio_value,
    };
    prev = rebased;
    return point;
  });
  return { anchorDate, points };
}

/**
 * The 100-point's date for a line with no real t-1 row: the last benchmark
 * (Nifty) trading day before the line's first date, so both lines start on
 * the same day in the chart. Falls back to the previous calendar day when
 * no benchmark date precedes it (e.g. benchmark unavailable).
 */
export function anchorDateBefore(firstDate: Date, benchDates: string[]): string {
  const firstStr = iso(firstDate);
  let best: string | null = null;
  for (const d of benchDates) {
    if (d < firstStr) best = d;
    else break;
  }
  if (best) return best;
  const prev = new Date(firstDate);
  prev.setUTCDate(prev.getUTCDate() - 1);
  return iso(prev);
}

export function withAnchorPoint<T extends { series: { date: string; nav: number; drawdown: number }[] }>(
  metrics: T,
  anchorDate: string,
): T {
  return {
    ...metrics,
    series: [{ date: anchorDate, nav: 100, drawdown: 0 }, ...metrics.series],
  };
}
