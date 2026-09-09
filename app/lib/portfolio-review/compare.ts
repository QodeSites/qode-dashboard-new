import { fetchBulkNavSeries } from "@/app/lib/portfolio-review/nav-series";
import {
  fetchNiftyRawSeries,
  computeBenchmarkMetrics,
} from "@/app/lib/portfolio-review/benchmark";
import { buildTagMetrics } from "@/app/lib/portfolio-review/returns";
import type { TagMetrics } from "@/app/lib/portfolio-review/returns";
import type { NavPoint } from "@/app/lib/internal-utils";

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
