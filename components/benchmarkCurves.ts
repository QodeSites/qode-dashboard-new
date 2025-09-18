// utils/benchmarkCurves.ts
export type CurvePoint = { date: string; value?: number; nav?: number };
export type BenchmarkInput =
  | Array<{ date: string; nav?: number | string; value?: number | string }>
  | Array<[string, number | string]>; // optional tuple support: [date, nav]

export interface MakeBenchmarkCurvesOptions {
  /** If provided, we’ll ensure the benchmark series begins no later than this date (add a synthetic base=100 point if needed). */
  alignStartTo?: string | Date;
  /** If portfolio base is known, we’ll normalize benchmark to 100 from its own first, not to portfolio base. */
  clampNegativeDrawdownToZero?: boolean; // default false (drawdown stays <= 0)
}

/** Parse number safely */
function n(x: unknown): number | null {
  if (x === null || x === undefined || x === "") return null;
  const v = typeof x === "string" ? Number(x) : (x as number);
  return Number.isFinite(v) ? v : null;
}

/** ISO date string (yyyy-mm-dd) from any valid Dateish input */
function isoDay(d: string | Date): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(+dt)) return String(d);
  // keep only date part for stable keys
  return dt.toISOString().slice(0, 10);
}

/** Sort, dedupe by date, coerce to {date, nav} with numeric nav */
function normalizeRaw(input: BenchmarkInput): Array<{ date: string; nav: number }> {
  const rows = input
    .map((p) => {
      if (Array.isArray(p)) {
        const [date, val] = p;
        const nav = n(val);
        return nav === null ? null : { date: isoDay(date), nav };
      } else {
        const nav = n(p.value ?? p.nav);
        return nav === null ? null : { date: isoDay(p.date), nav };
      }
    })
    .filter(Boolean) as Array<{ date: string; nav: number }>;

  // sort by date asc and dedupe (keep first occurrence per date)
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const seen = new Set<string>();
  const out: Array<{ date: string; nav: number }> = [];
  for (const r of rows) {
    if (!seen.has(r.date)) {
      seen.add(r.date);
      out.push(r);
    }
  }
  return out;
}

/** Convert NAV series to drawdown% series (0 at peaks, negative downward) */
function toDrawdownSeries(rows: Array<{ date: string; nav: number }>, clampZero = false) {
  let peak = rows.length ? rows[0].nav : 0;
  return rows.map(({ date, nav }) => {
    peak = Math.max(peak, nav);
    let dd = ((nav - peak) / peak) * 100; // <= 0
    if (clampZero && dd > 0) dd = 0;
    return { date, drawdown: dd };
  });
}

/** Normalize NAV series to base=100 at first valid point */
function toBase100(rows: Array<{ date: string; nav: number }>) {
  if (!rows.length) return [] as Array<{ date: string; nav: number }>;
  const base = rows[0].nav || 1;
  return rows.map(({ date, nav }) => ({ date, nav: (nav / base) * 100 }));
}

/**
 * Main: make benchmark curves for the PDF builder.
 * - Accepts any benchmark NAV/value series
 * - Normalizes to base 100
 * - Computes drawdown (%)
 * - Optionally inserts a synthetic start point to align with portfolio start
 */
export function makeBenchmarkCurves(
  benchmarkRaw: BenchmarkInput,
  opts: MakeBenchmarkCurvesOptions = {}
): {
  benchmarkEquityCurve: { date: string; nav: number }[]; // base=100
  benchmarkDrawdownCurve: { date: string; drawdown: number }[]; // <=0
} {
  const rows = normalizeRaw(benchmarkRaw);
  if (!rows.length) return { benchmarkEquityCurve: [], benchmarkDrawdownCurve: [] };

  // If alignStartTo is provided and benchmark starts later, prepend a base point
  if (opts.alignStartTo) {
    const alignDate = isoDay(opts.alignStartTo);
    const firstDate = rows[0].date;
    if (alignDate < firstDate) {
      // insert synthetic base point at alignDate with same base NAV as first row (so normalized becomes exactly 100 there too)
      rows.unshift({ date: alignDate, nav: rows[0].nav });
    }
  }

  const base100 = toBase100(rows);
  const dd = toDrawdownSeries(rows, Boolean(opts.clampNegativeDrawdownToZero));

  // Return in the exact shape your PDF builder expects:
  return {
    benchmarkEquityCurve: base100.map(({ date, nav }) => ({ date, nav })), // normalized to 100
    benchmarkDrawdownCurve: dd.map(({ date, drawdown }) => ({ date, drawdown })), // negative numbers, 0 at peaks
  };
}
