// PURE value-weighted blend of multiple TWRR component series into one combined
// NAV curve (base 100). No DB / engine imports — unit-testable in isolation.
//
// Each component daily point carries its own unit NAV (already TWRR), its rupee
// value, and that day's pnl + cash-in. The combined daily return is the
// prior-day-value-weighted average of component daily returns; a component
// contributes only once it has a positive prior-day value (so a later-starting
// component enters with zero weight on its first day — correct TWRR treatment of
// new capital).

export interface BlendComponentDaily {
  date: string;     // YYYY-MM-DD
  value: number;
  nav: number;
  pnl: number;
  cashIn: number;
}
export interface BlendComponent {
  daily: BlendComponentDaily[];
}
export interface CombinedHistoricalPoint {
  date: Date;
  nav: number;
  prevNav: number | null;
  drawdown: number;   // filled by the engine's drawdown pass; 0 here
  pnl: number;
  capitalInOut: number;
}

export function buildCombinedHistorical(
  components: BlendComponent[]
): CombinedHistoricalPoint[] {
  // Per-component lookup by date.
  const maps = components.map((c) => {
    const m = new Map<string, BlendComponentDaily>();
    for (const d of c.daily) m.set(d.date, d);
    return m;
  });

  // Sorted union of all dates.
  const dateSet = new Set<string>();
  for (const c of components) for (const d of c.daily) dateSet.add(d.date);
  const dates = Array.from(dateSet).sort();
  if (dates.length === 0) return [];

  // Forward-filled value + nav per component (value persists across gaps; before
  // a component's first row both are null → it doesn't participate yet).
  const lastVal: (number | null)[] = components.map(() => null);
  const lastNav: (number | null)[] = components.map(() => null);

  const out: CombinedHistoricalPoint[] = [];
  let combinedNav = 100;

  for (let di = 0; di < dates.length; di++) {
    const date = dates[di];

    // Prior-day component values (weights) captured BEFORE applying today.
    const prevVals = lastVal.slice();
    const prevNavs = lastNav.slice();

    // Day pnl / cashIn summed across components present today.
    let dayPnl = 0;
    let dayCashIn = 0;

    // Value-weighted combined return for today.
    let weightSum = 0;
    let weightedReturn = 0;

    for (let ci = 0; ci < components.length; ci++) {
      const point = maps[ci].get(date);
      if (point) {
        dayPnl += point.pnl;
        dayCashIn += point.cashIn;
        // Component daily return needs a prior nav AND a positive prior value.
        if (prevNavs[ci] != null && prevNavs[ci]! > 0 &&
            prevVals[ci] != null && prevVals[ci]! > 0) {
          const r = point.nav / prevNavs[ci]! - 1;
          weightSum += prevVals[ci]!;
          weightedReturn += prevVals[ci]! * r;
        }
        // Advance forward-fill state.
        lastVal[ci] = point.value;
        lastNav[ci] = point.nav;
      }
      // No point today → keep prior forward-filled value/nav (no contribution
      // beyond the carried value, which only matters as a future weight).
    }

    const combinedReturn = weightSum > 0 ? weightedReturn / weightSum : 0;
    const prevNav = di === 0 ? null : out[di - 1].nav;
    combinedNav = di === 0 ? 100 : combinedNav * (1 + combinedReturn);

    out.push({
      date: new Date(date),
      nav: combinedNav,
      prevNav,
      drawdown: 0,
      pnl: dayPnl,
      capitalInOut: dayCashIn,
    });
  }

  return out;
}
