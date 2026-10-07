import { prisma } from "@/lib/prisma";
import { fetchBulkNavSeries } from "@/app/lib/portfolio-review/nav-series";
import {
  fetchNiftyRawSeries,
  computeBenchmarkMetrics,
} from "@/app/lib/portfolio-review/benchmark";
import {
  buildTagMetrics,
  calcMonthlyReturns,
  calcQuarterlyReturns,
  calcYearlyReturns,
} from "@/app/lib/portfolio-review/returns";
import type { TagMetrics } from "@/app/lib/portfolio-review/returns";
import {
  fetchBulkXirrInputs,
  solveXirr,
  xirrSourceTag,
  isSoloPropConfigs,
  type XirrTagConfig,
} from "@/app/lib/portfolio-review/xirr";
import {
  rebaseNavWindow,
  anchorDateBefore,
  withAnchorPoint,
  type RebasedWindow,
} from "@/app/lib/portfolio-review/rebase";
import type { NavPoint } from "@/app/lib/internal-utils";

const PROP_TABLE = "master_sheet_test" as const;

/**
 * Solo Prop accounts store their data in master_sheet_test with bare
 * (unprefixed) tags, not bifurcated_master_sheet_test — same discriminator
 * (`isSoloProp`) used by /api/internal/clients and
 * sub-strategy-performance-prop.ts. Compare must fetch each qcode from its
 * own table since the two are never mixed in one query.
 */
async function fetchConfigsByQcode(
  qcodes: string[],
): Promise<Map<string, XirrTagConfig[]>> {
  if (qcodes.length === 0) return new Map();
  const configs = await prisma.client_strategy_configs.findMany({
    where: { qcode: { in: qcodes } },
    select: {
      qcode: true,
      strategy: true,
      profit_tag_suffix: true,
      exposure_tag_suffix: true,
    },
    orderBy: { effective_from: "asc" },
  });
  const grouped = new Map<string, XirrTagConfig[]>();
  for (const c of configs) {
    if (!grouped.has(c.qcode)) grouped.set(c.qcode, []);
    grouped.get(c.qcode)!.push(c);
  }
  return grouped;
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

// Module-level caches — must stay singletons. Never duplicate this file's
// code elsewhere; import from here so every caller shares the same cache.
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
      field: "normalized_nav" | "psar_nav" | "btst_nav" | "hedge_nav";
    }
  | {
      kind: "qaw_split";
      split:
        | "all"
        | "iso_qaw_gold_matrics"
        | "iso_qaw_low_vol_matrics"
        | "iso_qaw_mom_matrics"
        | "iso_qaw_put_prot_matrics";
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
  "Gold Stock Holdings": { kind: "qaw_split", split: "iso_qaw_gold_matrics" },
  "Low Vol Stock Holdings": {
    kind: "qaw_split",
    split: "iso_qaw_low_vol_matrics",
  },
  "Momentum Stock Holdings": {
    kind: "qaw_split",
    split: "iso_qaw_mom_matrics",
  },
  DMA1: { kind: "qaw_split", split: "iso_qaw_put_prot_matrics" },
  OVERNIGHTHEDGE1: { kind: "scheme", array: "nav_curve", field: "hedge_nav" },
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
  skip_reason?: "no_data";
}

export interface PeriodReturns {
  monthly: { year: number; month: string; return_pct: number }[];
  quarterly: { year: number; quarter: string; return_pct: number }[];
  yearly: { year: number; return_pct: number }[];
}

export interface BacktestSeries extends PeriodReturns {
  system_tag: string;
  series: { date: string; nav: number; drawdown: number }[];
}

/**
 * Monthly/quarterly/yearly returns off a rebased index series (benchmark or
 * backtest). Reuses the portfolio's own bucketing so the figures are
 * like-for-like; the series' first point is the 100-base, so the first month
 * is measured from 100. No rupee P&L exists for an index, so pnl is dropped.
 */
function periodReturnsFromSeries(
  series: { date: string; nav: number }[],
): PeriodReturns {
  const nav: NavPoint[] = series.map((p) => ({
    date: new Date(p.date),
    nav: p.nav,
    prev_nav: null,
    drawdown: 0,
    pnl: 0,
    portfolio_value: 0,
  }));
  const monthly = calcMonthlyReturns(nav);
  return {
    monthly: monthly.map(({ year, month, return_pct }) => ({ year, month, return_pct })),
    quarterly: calcQuarterlyReturns(monthly).map(({ year, quarter, return_pct }) => ({
      year,
      quarter,
      return_pct,
    })),
    yearly: calcYearlyReturns(monthly).map(({ year, return_pct }) => ({ year, return_pct })),
  };
}

export interface CompareOutput {
  benchmark_returns: PeriodReturns | null;
  benchmark_series: { date: string; nav: number; drawdown: number }[];
  backtest_series: BacktestSeries[];
  results: CompareResult[];
  rebase_window: { from: string; to: string } | null;
}

/**
 * Prepends a T-1 anchor point at nav=100 when the series' own first point
 * isn't already 100 — same convention as portfolio-utils.ts's "prepend NAV
 * of 100 if the first NAV is not 100". Needed here because a "Total
 * Portfolio"/rollup tag's own first tracked row can already sit well above
 * or below 100 (it's a continuously-compounding index blending in gains
 * from allocations that started earlier), so the raw series would plot a
 * line that doesn't start at 100 — confusing on a comparison chart where
 * every line is meant to represent "growth of the same starting amount".
 * The real first row is left untouched right after the anchor, so the jump
 * from 100 to that value is visible rather than smoothed away. The anchor
 * is dated on Nifty's trading day before the first row (not just the
 * previous calendar day) so it lines up with the benchmark's own 100-point.
 */
function withNav100Anchor(
  metrics: Omit<TagMetrics, "ratios">,
  benchDates: string[],
): Omit<TagMetrics, "ratios"> {
  const series = metrics.series;
  if (series.length === 0 || series[0].nav === 100) return metrics;
  return withAnchorPoint(
    metrics,
    anchorDateBefore(new Date(series[0].date), benchDates),
  );
}

export async function computeCompare(
  selections: CompareSelection[],
  rebaseFrom?: Date,
  rebaseTo?: Date,
): Promise<CompareOutput> {
  if (selections.length === 0)
    return {
      benchmark_returns: null,
      benchmark_series: [],
      backtest_series: [],
      results: [],
      rebase_window: null,
    };

  const rebasing = !!(rebaseFrom && rebaseTo);

  const uniquePairs = new Map<string, CompareSelection>();
  for (const s of selections) uniquePairs.set(`${s.qcode}|${s.system_tag}`, s);
  const unique = [...uniquePairs.values()];

  const configsByQcode = await fetchConfigsByQcode([
    ...new Set(unique.map((s) => s.qcode)),
  ]);
  const propQcodes = new Set(
    [...configsByQcode]
      .filter(([, configs]) => isSoloPropConfigs(configs))
      .map(([qcode]) => qcode),
  );
  const propSelections = unique.filter((s) => propQcodes.has(s.qcode));
  const managedSelections = unique.filter((s) => !propQcodes.has(s.qcode));

  const [managedSeries, propSeries] = await Promise.all([
    fetchBulkNavSeries(
      managedSelections.map((s) => ({ qcode: s.qcode, tag: s.system_tag })),
    ),
    fetchBulkNavSeries(
      propSelections.map((s) => ({ qcode: s.qcode, tag: s.system_tag })),
      undefined,
      undefined,
      PROP_TABLE,
    ),
  ]);
  const seriesMap = new Map([...managedSeries, ...propSeries]);

  // XIRR is money-weighted (needs real cash flows + a final valuation, not
  // just the NAV curve) and only exists for client- and strategy-level
  // lines — each selection is mapped to its exposure tag via xirrSourceTag,
  // sleeves get null. Same windowing as the rest of this function: the
  // shared rebase window when rebasing, full history otherwise.
  const sourceBySelection = new Map<string, string | null>();
  for (const s of unique) {
    sourceBySelection.set(
      `${s.qcode}|${s.system_tag}`,
      xirrSourceTag(s.system_tag, configsByQcode.get(s.qcode) ?? []),
    );
  }
  const sourcePairs = (list: CompareSelection[]) => {
    const seen = new Map<string, { qcode: string; tag: string }>();
    for (const s of list) {
      const tag = sourceBySelection.get(`${s.qcode}|${s.system_tag}`);
      if (tag) seen.set(`${s.qcode}|${tag}`, { qcode: s.qcode, tag });
    }
    return [...seen.values()];
  };
  const [managedXirrInputs, propXirrInputs] = await Promise.all([
    fetchBulkXirrInputs(
      sourcePairs(managedSelections),
      rebasing ? rebaseTo : undefined,
      rebasing ? rebaseFrom : undefined,
    ),
    fetchBulkXirrInputs(
      sourcePairs(propSelections),
      rebasing ? rebaseTo : undefined,
      rebasing ? rebaseFrom : undefined,
      PROP_TABLE,
    ),
  ]);
  const xirrInputsMap = new Map([...managedXirrInputs, ...propXirrInputs]);
  const xirrMap = new Map<string, number | null>();
  for (const [key, source] of sourceBySelection) {
    const inputs = source
      ? xirrInputsMap.get(`${key.split("|")[0]}|${source}`)
      : undefined;
    xirrMap.set(
      key,
      inputs ? solveXirr(inputs.flows, inputs.asOfDate, inputs.finalValue) : null,
    );
  }

  const built = new Map<
    string,
    { nav: NavPoint[] | null; metrics: Omit<TagMetrics, "ratios"> | null }
  >();
  // Rebased nav per selection, only populated when `rebasing` — kept
  // separate from `built` so tagGroups/backtest below can keep using each
  // line's real (unrebased) dates for its own inception-based window when
  // not rebasing, without threading an extra branch through that logic.
  const rebasedNav = new Map<string, RebasedWindow | null>();
  for (const s of unique) {
    const key = `${s.qcode}|${s.system_tag}`;
    const nav = seriesMap.get(key);
    if (!nav || nav.length === 0) {
      built.set(key, { nav: null, metrics: null });
      continue;
    }
    const { ratios: _ratios, ...metrics } = buildTagMetrics(
      nav,
      0,
      xirrMap.get(key) ?? null,
    );
    built.set(key, { nav, metrics });
    if (rebasing) {
      rebasedNav.set(key, rebaseNavWindow(nav, rebaseFrom!, rebaseTo!));
    }
  }

  let minStart: Date | null = rebasing ? rebaseFrom! : null;
  let maxEnd: Date | null = rebasing ? rebaseTo! : null;
  if (!rebasing) {
    for (const b of built.values()) {
      if (!b.nav) continue;
      const start = b.nav[0].date;
      const end = b.nav[b.nav.length - 1].date;
      if (!minStart || start < minStart) minStart = start;
      if (!maxEnd || end > maxEnd) maxEnd = end;
    }
  }

  const niftyRaw =
    minStart && maxEnd ? await fetchNiftyRawSeries(minStart, maxEnd) : null;

  // When rebasing, suppress the Nifty benchmark/backtest overlay unless at
  // least one selection actually has real data in the requested window —
  // otherwise the chart would draw a benchmark-only line over a date range
  // where every client line was skipped (skip_reason below), which reads as
  // "the client has data here" when they don't.
  const anyRebasedData =
    !rebasing || unique.some((s) => rebasedNav.get(`${s.qcode}|${s.system_tag}`));

  const chartBenchmark =
    niftyRaw && minStart && maxEnd && anyRebasedData
      ? computeBenchmarkMetrics(niftyRaw, minStart, maxEnd)
      : null;
  const benchDates = chartBenchmark?.series.map((p) => p.date) ?? [];

  const overviewCache = new Map<string, CompareResult["benchmark_overview"]>();
  function benchmarkOverview(key: string, nav: NavPoint[], sharedWindow: boolean) {
    // A line rebased off a real t-1 row sits on the same shared window as
    // the chart, so it gets the chart-level benchmark comparison. A line
    // that started inside the window is compared against Nifty over its
    // own span instead (the per-line branch below).
    if (rebasing && sharedWindow) {
      return chartBenchmark
        ? {
            since_inception: chartBenchmark.since_inception,
            max_drawdown: chartBenchmark.max_drawdown,
            current_drawdown: chartBenchmark.current_drawdown,
          }
        : null;
    }
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
        skip_reason: "no_data" as const,
      };
    }
    if (rebasing) {
      const rebased = rebasedNav.get(key);
      if (!rebased) {
        return {
          qcode: s.qcode,
          system_tag: s.system_tag,
          metrics: null,
          benchmark_overview: null,
          skip_reason: "no_data" as const,
        };
      }
      const { ratios: _ratios, ...metrics } = buildTagMetrics(
        rebased.points,
        0,
        xirrMap.get(key) ?? null,
      );
      const anchorDate = rebased.anchorDate
        ? rebased.anchorDate.toISOString().split("T")[0]
        : anchorDateBefore(rebased.points[0].date, benchDates);
      return {
        qcode: s.qcode,
        system_tag: s.system_tag,
        metrics: withAnchorPoint(metrics, anchorDate),
        benchmark_overview: benchmarkOverview(
          key,
          rebased.points,
          rebased.anchorDate !== null,
        ),
      };
    }
    return {
      qcode: s.qcode,
      system_tag: s.system_tag,
      metrics: withNav100Anchor(b.metrics, benchDates),
      benchmark_overview: benchmarkOverview(key, b.nav, false),
    };
  });

  // Backtest/research overlay groups by tag using each line's *real* nav
  // (never the rebased one) purely to resolve which lines belong to which
  // system_tag — the actual curve window below uses rebaseFrom/rebaseTo
  // directly when rebasing, same as the benchmark above.
  const tagGroups = new Map<string, NavPoint[][]>();
  for (const s of unique) {
    const b = built.get(`${s.qcode}|${s.system_tag}`);
    if (!b?.nav) continue;
    if (rebasing && !rebasedNav.get(`${s.qcode}|${s.system_tag}`)) continue;
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

        const groupStart = rebasing
          ? rebaseFrom!
          : members.reduce(
              (min, nav) => (nav[0].date < min ? nav[0].date : min),
              members[0][0].date,
            );
        const groupEnd = rebasing
          ? rebaseTo!
          : members.reduce((max, nav) => {
              const end = nav[nav.length - 1].date;
              return end > max ? end : max;
            }, members[0][members[0].length - 1].date);

        const rebased = computeBenchmarkMetrics(raw, groupStart, groupEnd);
        if (rebased)
          backtest_series.push({
            system_tag: systemTag,
            series: rebased.series,
            ...periodReturnsFromSeries(rebased.series),
          });
      }
    }
  }

  return {
    benchmark_returns: chartBenchmark
      ? periodReturnsFromSeries(chartBenchmark.series)
      : null,
    benchmark_series: chartBenchmark?.series ?? [],
    backtest_series,
    results,
    rebase_window: rebasing
      ? {
          from: rebaseFrom!.toISOString().split("T")[0],
          to: rebaseTo!.toISOString().split("T")[0],
        }
      : null,
  };
}
