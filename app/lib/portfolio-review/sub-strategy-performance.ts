import { fetchStrategyPairs } from "@/app/lib/portfolio-review/tags";
import type { StrategyPair } from "@/app/lib/portfolio-review/tags";
import { resolveSplitConfigs } from "@/app/lib/portfolio-review/mandate-snapshot";
import { fetchBulkNavSeries } from "@/app/lib/portfolio-review/nav-series";
import {
  calcMonthlyReturns,
  calcYearlyReturns,
  calcMaxDrawdown,
  calcCurrentDrawdown,
  calcSinceInceptionAbsolute,
} from "@/app/lib/portfolio-review/returns";
import type { MonthlyReturn, YearlyReturn } from "@/app/lib/portfolio-review/returns";
import { solveXirr, fetchBulkXirrInputs } from "@/app/lib/portfolio-review/xirr";
import type { NavPoint } from "@/app/lib/internal-utils";
import { round } from "@/lib/utils";

/**
 * Tier-bearing families (Long Options / PSAR and their N/S directional
 * variants). Unlike the generic, catalog-driven sections (DMA, Overnight
 * Hedge, see genericSections on ResolveSplitConfigsResult), these still
 * need code here because their DISPLAY LABEL is a live number
 * (`long_opt_pct`, `psar_multiplier`) formatted differently per family —
 * "PSAR 2x" vs "Long Options (1.5%)". The number itself is never
 * hardcoded (a client on psar_multiplier=2.5 — e.g. an Ashok Jogani-style
 * exception — reads "PSAR 2.5x" automatically, no code change), only the
 * unit/format string per family is. Gating is presence-only: no separate
 * tier-matching, since existsField already IS the tier value.
 */
interface SubStrategySectionDef {
  tag: string;
  existsField: "long_opt_pct" | "psar_multiplier" | "gold_pct" | "lowvol_pct" | "momentum_pct";
  labelFor: (value: number) => string;
}

const fixedLabel = (label: string) => () => label;
const pctLabel = (base: string) => (value: number) => `${base} (${round(value * 100, 2)}%)`;
const leverageLabel = (base: string) => (value: number) => `${base} ${value}x`;

const SUB_STRATEGY_SECTIONS: SubStrategySectionDef[] = [
  { tag: "LONG", existsField: "long_opt_pct", labelFor: pctLabel("Long Options") },
  { tag: "NLONG", existsField: "long_opt_pct", labelFor: pctLabel("NLONG") },
  { tag: "SLONG", existsField: "long_opt_pct", labelFor: pctLabel("SLONG") },
  { tag: "PSAR", existsField: "psar_multiplier", labelFor: leverageLabel("PSAR") },
  { tag: "NPSAR", existsField: "psar_multiplier", labelFor: leverageLabel("NPSAR") },
  { tag: "SPSAR", existsField: "psar_multiplier", labelFor: leverageLabel("SPSAR") },
  { tag: "Gold Stock Holdings", existsField: "gold_pct", labelFor: fixedLabel("Gold") },
  { tag: "Momentum Stock Holdings", existsField: "momentum_pct", labelFor: fixedLabel("Momentum") },
  { tag: "Low Vol Stock Holdings", existsField: "lowvol_pct", labelFor: fixedLabel("Low Vol") },
];

/**
 * Fixed print-order key per family — stable regardless of the live value
 * in the label (e.g. "PSAR 2x" and "PSAR 2.5x" both sort under "PSAR").
 * excel-utils.ts's section ordering still needs its own follow-up fix to
 * actually use this instead of exact-label matching (tracked separately,
 * not part of this change).
 */
export const SUB_STRATEGY_SECTION_ORDER = SUB_STRATEGY_SECTIONS.map((s) => s.tag);

export interface SubStrategyRow {
  section: string;
  /** Stable grouping key behind `section` — e.g. "PSAR" for both "PSAR 2x"
   *  and "PSAR 2.5x". `section` itself can vary per client (it's built from
   *  that client's own live tier value), so anything that needs to group or
   *  order sections (see excel-utils.ts's writeSubStrategyGrid) must key off
   *  this instead of `section`. */
  section_family: string;
  /** The live value `section`'s label was built from (tier/leverage/pct),
   *  or null for fixed-label sections (Gold, DMA, ...). Used only to order
   *  same-family blocks (1x before 2x before 2.5x) — never re-parsed from
   *  the display text. */
  section_value: number | null;
  /** True when this client's value for the section's family (PSAR-family or
   *  LONG-family) is a client_config_values override that differs from the
   *  strategy's default — e.g. an Ashok Jogani HUF-style client running
   *  PSAR at 2.5x while the strategy default is 2x. Always false for
   *  fixed-label and generic (DMA/Overnight Hedge) sections, which have no
   *  tier to deviate from. */
  is_exception: boolean;
  /** The strategy's default value for this family, for footnote text like
   *  "runs at 2.5x instead of the usual 2x" — null when not an exception or
   *  the strategy has no default row. */
  standard_value: number | null;
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
  /** Pure absolute since-inception return for this section's own NAV curve
   * — never CAGR'd regardless of tenure (see calcSinceInceptionAbsolute). */
  since_inception_absolute: number | null;
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

  const { splits: splitMap, genericSections, diagnostics } = await resolveSplitConfigs(
    pairs,
    end ?? new Date(),
  );
  if (diagnostics.length > 0) {
    console.warn(
      `computeSubStrategyPerformance: ${diagnostics.length} ratio diagnostic(s)`,
      diagnostics,
    );
  }

  // How many configured strategies each qcode has — needed for the generic
  // sections' bare-tag fallback below (see resolveGenericNav's header).
  const qcodeStrategyCount = new Map<string, number>();
  for (const p of pairs) {
    qcodeStrategyCount.set(p.qcode, (qcodeStrategyCount.get(p.qcode) ?? 0) + 1);
  }

  const queries: { qcode: string; tag: string }[] = [];
  for (const pair of pairs) {
    const split = splitMap.get(`${pair.qcode}|${pair.strategy}`)!;
    for (const sec of SUB_STRATEGY_SECTIONS) {
      if (split[sec.existsField] == null) continue;
      queries.push({ qcode: pair.qcode, tag: `${pair.strategy} ${sec.tag}` });
    }
    const generic = genericSections.get(`${pair.qcode}|${pair.strategy}`);
    if (generic) {
      for (const entry of generic.values()) {
        queries.push({ qcode: pair.qcode, tag: `${pair.strategy} ${entry.tagSuffix}` });
        // Bare (unprefixed) tag too — some strategy-tag bifurcations only
        // ever wrote the bare tag for clients who run just one strategy
        // (see DMA's history: bare "DMA1" predates the prefixed split).
        // Harmless extra query for pairs that don't need it.
        queries.push({ qcode: pair.qcode, tag: entry.tagSuffix });
      }
    }
  }

  const seriesMap = await fetchBulkNavSeries(queries, end, start);
  const xirrMap = await fetchBulkXirrInputs(
    pairs.map((p) => ({ qcode: p.qcode, tag: p.exposure_tag })),
    end,
  );

  // Prefixed tag wins when it has data; bare tag is only trusted as a
  // fallback for a qcode with exactly one configured strategy (see the DMA
  // investigation this rule came from — a multi-strategy client's bare tag
  // mixes activity from more than one strategy, so it's ambiguous there).
  function resolveGenericNav(pair: StrategyPair, tagSuffix: string): NavPoint[] | undefined {
    const prefixed = seriesMap.get(`${pair.qcode}|${pair.strategy} ${tagSuffix}`);
    if (prefixed && prefixed.length > 0) return prefixed;
    if (qcodeStrategyCount.get(pair.qcode) === 1) {
      const bare = seriesMap.get(`${pair.qcode}|${tagSuffix}`);
      if (bare && bare.length > 0) return bare;
    }
    return undefined;
  }

  const rows: SubStrategyRow[] = [];
  for (const pair of pairs) {
    const split = splitMap.get(`${pair.qcode}|${pair.strategy}`)!;
    const xirrInputs = xirrMap.get(`${pair.qcode}|${pair.exposure_tag}`);
    const total_xirr = xirrInputs
      ? solveXirr(xirrInputs.flows, xirrInputs.asOfDate, xirrInputs.finalValue)
      : null;
    for (const sec of SUB_STRATEGY_SECTIONS) {
      const value = split[sec.existsField];
      if (value == null) continue;

      const nav = seriesMap.get(`${pair.qcode}|${pair.strategy} ${sec.tag}`);
      if (!nav || nav.length === 0) continue;

      const monthly = calcMonthlyReturns(nav);
      const isException =
        sec.existsField === "psar_multiplier"
          ? split.psar_is_exception
          : sec.existsField === "long_opt_pct"
            ? split.long_opt_is_exception
            : false;
      const standardValue =
        sec.existsField === "psar_multiplier"
          ? split.psar_standard_value
          : sec.existsField === "long_opt_pct"
            ? split.long_opt_standard_value
            : null;
      rows.push({
        section: sec.labelFor(value),
        section_family: sec.tag,
        section_value: value,
        is_exception: isException,
        standard_value: isException ? standardValue : null,
        qcode: pair.qcode,
        account_name: pair.account_name,
        strategy: pair.strategy,
        monthly,
        yearly: calcYearlyReturns(monthly),
        total_xirr,
        max_drawdown: calcMaxDrawdown(nav),
        current_drawdown: calcCurrentDrawdown(nav),
        since_inception_absolute: calcSinceInceptionAbsolute(nav),
      });
    }

    const generic = genericSections.get(`${pair.qcode}|${pair.strategy}`);
    if (!generic) continue;
    for (const entry of generic.values()) {
      const nav = resolveGenericNav(pair, entry.tagSuffix);
      if (!nav || nav.length === 0) continue;

      const monthly = calcMonthlyReturns(nav);
      rows.push({
        section: entry.label,
        section_family: entry.tagSuffix,
        section_value: null,
        is_exception: false,
        standard_value: null,
        qcode: pair.qcode,
        account_name: pair.account_name,
        strategy: pair.strategy,
        monthly,
        yearly: calcYearlyReturns(monthly),
        total_xirr,
        max_drawdown: calcMaxDrawdown(nav),
        current_drawdown: calcCurrentDrawdown(nav),
        since_inception_absolute: calcSinceInceptionAbsolute(nav),
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
  // NOTE: `sections` is matched against each section's stable family key —
  // SUB_STRATEGY_SECTION_ORDER entries (e.g. "PSAR") for the hardcoded tier
  // families, and each generic catalog row's tag_suffix (e.g. "DMA1",
  // "OVERNIGHTHEDGE1") for DB-driven sections — not the formatted display
  // label ("PSAR 2x"), which is no longer a fixed string a caller could
  // match against exactly.
  const wantedSections = new Set(sections);
  if (wantedSections.size === 0) return [];

  const allPairs = await fetchStrategyPairs("profit_tag_suffix");
  const pairMap = new Map(allPairs.map((p) => [`${p.qcode}|${p.strategy}`, p]));

  const uniqueKeys = new Set(selections.map((s) => `${s.qcode}|${s.strategy}`));
  const pairs = [...uniqueKeys]
    .map((k) => pairMap.get(k))
    .filter((p): p is StrategyPair => p != null);
  if (pairs.length === 0) return [];

  const { splits: splitMap, genericSections, diagnostics } = await resolveSplitConfigs(
    pairs,
    end ?? new Date(),
  );
  if (diagnostics.length > 0) {
    console.warn(
      `computeSubStrategyDailyPnl: ${diagnostics.length} ratio diagnostic(s)`,
      diagnostics,
    );
  }

  // Same bare-tag fallback rule as the main table (see resolveGenericNav in
  // computeSubStrategyPerformance) — needed here too since DMA can have a
  // single-strategy client with only the bare tag written.
  const qcodeStrategyCount = new Map<string, number>();
  for (const p of allPairs) {
    if (p.strategy === "Prop") continue;
    qcodeStrategyCount.set(p.qcode, (qcodeStrategyCount.get(p.qcode) ?? 0) + 1);
  }

  const queries: { qcode: string; tag: string }[] = [];
  const hardcodedCombos: { pair: StrategyPair; sec: SubStrategySectionDef; label: string }[] = [];
  const genericCombos: { pair: StrategyPair; tagSuffix: string; label: string }[] = [];
  for (const pair of pairs) {
    const split = splitMap.get(`${pair.qcode}|${pair.strategy}`)!;
    for (const sec of SUB_STRATEGY_SECTIONS) {
      if (!wantedSections.has(sec.tag)) continue;
      const value = split[sec.existsField];
      if (value == null) continue;
      queries.push({ qcode: pair.qcode, tag: `${pair.strategy} ${sec.tag}` });
      hardcodedCombos.push({ pair, sec, label: sec.labelFor(value) });
    }

    const generic = genericSections.get(`${pair.qcode}|${pair.strategy}`);
    if (!generic) continue;
    for (const entry of generic.values()) {
      if (!wantedSections.has(entry.tagSuffix)) continue;
      queries.push({ qcode: pair.qcode, tag: `${pair.strategy} ${entry.tagSuffix}` });
      queries.push({ qcode: pair.qcode, tag: entry.tagSuffix });
      genericCombos.push({ pair, tagSuffix: entry.tagSuffix, label: entry.label });
    }
  }
  if (queries.length === 0) return [];

  const seriesMap = await fetchBulkNavSeries(queries, end, start);

  function resolveGenericNav(pair: StrategyPair, tagSuffix: string): NavPoint[] | undefined {
    const prefixed = seriesMap.get(`${pair.qcode}|${pair.strategy} ${tagSuffix}`);
    if (prefixed && prefixed.length > 0) return prefixed;
    if (qcodeStrategyCount.get(pair.qcode) === 1) {
      const bare = seriesMap.get(`${pair.qcode}|${tagSuffix}`);
      if (bare && bare.length > 0) return bare;
    }
    return undefined;
  }

  const result: DailyPnlSeries[] = [];
  for (const { pair, sec, label } of hardcodedCombos) {
    const nav = seriesMap.get(`${pair.qcode}|${pair.strategy} ${sec.tag}`);
    if (!nav || nav.length === 0) continue;

    result.push({
      qcode: pair.qcode,
      account_name: pair.account_name,
      strategy: pair.strategy,
      section: label,
      points: calcDailyReturns(nav),
    });
  }
  for (const { pair, tagSuffix, label } of genericCombos) {
    const nav = resolveGenericNav(pair, tagSuffix);
    if (!nav || nav.length === 0) continue;

    result.push({
      qcode: pair.qcode,
      account_name: pair.account_name,
      strategy: pair.strategy,
      section: label,
      points: calcDailyReturns(nav),
    });
  }
  return result;
}
