import { fetchStrategyPairs } from "@/app/lib/portfolio-review/tags";
import type { StrategyPair } from "@/app/lib/portfolio-review/tags";
import { resolveSplitConfigs } from "@/app/lib/portfolio-review/mandate-snapshot";
import { fetchBulkNavSeries } from "@/app/lib/portfolio-review/nav-series";
import {
  calcMonthlyReturns,
  calcYearlyReturns,
  calcMaxDrawdown,
  calcCurrentDrawdown,
} from "@/app/lib/portfolio-review/returns";
import type { MonthlyReturn, YearlyReturn } from "@/app/lib/portfolio-review/returns";
import { solveXirr, fetchBulkXirrInputs } from "@/app/lib/portfolio-review/xirr";
import type { NavPoint } from "@/app/lib/internal-utils";

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
  /** Whole-account XIRR for this (qcode, strategy) — same value on every
   * section row for that pair, not a per-sleeve XIRR. A client's deposit
   * isn't attributable to one sleeve, so this is "Total XIRR" shown for
   * context alongside each section's own return figures. */
  total_xirr: number | null;
  /** Max/current drawdown ARE per-section here (unlike XIRR above) —
   * each sleeve has its own NAV curve, so its own drawdown is meaningful. */
  max_drawdown: number | null;
  current_drawdown: number | null;
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
  const xirrMap = await fetchBulkXirrInputs(
    pairs.map((p) => ({ qcode: p.qcode, tag: p.exposure_tag })),
    end,
  );

  const rows: SubStrategyRow[] = [];
  for (const pair of pairs) {
    const split = splitMap.get(`${pair.qcode}|${pair.strategy}`)!;
    const xirrInputs = xirrMap.get(`${pair.qcode}|${pair.exposure_tag}`);
    const total_xirr = xirrInputs
      ? solveXirr(xirrInputs.flows, xirrInputs.asOfDate, xirrInputs.finalValue)
      : null;
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
        total_xirr,
        max_drawdown: calcMaxDrawdown(nav),
        current_drawdown: calcCurrentDrawdown(nav),
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
