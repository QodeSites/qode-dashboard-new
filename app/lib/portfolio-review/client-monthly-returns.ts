import { prisma } from "@/lib/prisma";
import { round } from "@/lib/utils";
import { fetchBulkNavSeries } from "@/app/lib/portfolio-review/nav-series";
import { fetchBulkXirrInputs, solveXirr } from "@/app/lib/portfolio-review/xirr";
import {
  calcMonthlyReturns,
  calcYearlyReturns,
  calcMaxDrawdown,
  calcCurrentDrawdown,
  calcSinceInceptionAbsolute,
  calcSiPnl,
  calcTrailingReturns,
} from "@/app/lib/portfolio-review/returns";
import type { MonthlyReturn, YearlyReturn, TrailingReturns } from "@/app/lib/portfolio-review/returns";

import { fetchStrategyPairs } from "@/app/lib/portfolio-review/tags";
import { resolveSplitConfigs } from "@/app/lib/portfolio-review/mandate-snapshot";
import type { SplitConfig } from "@/app/lib/portfolio-review/mandate-snapshot";
import { SUB_STRATEGY_SECTIONS } from "@/app/lib/portfolio-review/sub-strategy-performance";
import { fetchPropCatalog } from "@/app/lib/portfolio-review/sub-strategy-performance-prop";
import type { PropCatalogLeaf } from "@/app/lib/portfolio-review/sub-strategy-performance-prop";

const PROP_TABLE = "master_sheet_test" as const;
const MANAGED_TABLE = "bifurcated_master_sheet_test" as const;

// System-tag sleeve with no ratio/gate field of its own (unlike Gold/Momentum/
// Low Vol, which are gated on SplitConfig.gold_pct etc) — attempted for every
// strategy and simply dropped if it has no NAV data, same as any other node.
const LIQUIDCASE_TAG = "Liquidcase Stock Holdings";

// Same treatment as Liquidcase above — as of 2026-09-30 real NAV data only
// exists for one qcode/strategy (QAC00133 / QYE+) in bifurcated_master_sheet_test,
// but attempting it for every strategy means it appears automatically as
// more clients get this tag populated, with no code change needed.
const LIQUIDADD_TAG = "Liquidadd Stock Holdings";

// Momentum's own two sub-legs (momentum50 / momidmtm) have no NAV tag of
// their own anywhere in master_sheet — only a live capital-weight ratio in
// strategy_config_defaults (config_key momentum50/momidmtm, ratio_type
// "model", synced daily, QAW+/QAW++ only). So unlike every other breakdown
// leg here, these two can't be fetched — they're derived by splitting the
// already-resolved "Momentum Stock Holdings" node's own pnl by that ratio
// (% figures stay identical to the parent: scaling pnl by a constant weight
// doesn't change % return, XIRR, drawdown, or CAGR — only the rupee amounts
// change). Ratio history is short (~27 days) vs the NAV series (months/
// years), so the latest known ratio is applied uniformly across all history
// rather than trying to align a ratio to every individual date.
const MOMENTUM_TAG = "Momentum Stock Holdings";
const MOMENTUM_SPLIT_STRATEGIES = ["QAW+", "QAW++"] as const;
const MOMENTUM_SPLIT_LEGS = [
  { config_key: "momentum50", label: "Momentum50" },
  { config_key: "momidmtm", label: "MomIdMtm" },
] as const;

type MomentumRatios = { momentum50: number; momidmtm: number };

async function fetchMomentumSplitRatios(): Promise<Map<string, MomentumRatios>> {
  const rows = await prisma.strategy_config_defaults.findMany({
    where: {
      strategy_name: { in: [...MOMENTUM_SPLIT_STRATEGIES] },
      config_key: { in: MOMENTUM_SPLIT_LEGS.map((l) => l.config_key) },
      ratio_type: "model",
    },
    orderBy: { as_of_date: "desc" },
  });

  // Latest as_of_date wins per (strategy, leg) — rows are already sorted
  // desc, so the first one seen per key is the latest.
  const latest = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.strategy_name}|${r.config_key}`;
    if (!latest.has(key) && r.value != null) latest.set(key, Number(r.value));
  }

  const result = new Map<string, MomentumRatios>();
  for (const strategy of MOMENTUM_SPLIT_STRATEGIES) {
    const momentum50 = latest.get(`${strategy}|momentum50`);
    const momidmtm = latest.get(`${strategy}|momidmtm`);
    if (momentum50 != null && momidmtm != null) {
      result.set(strategy, { momentum50, momidmtm });
    }
  }
  return result;
}

type SplitConfigMap = Map<string, SplitConfig>;
type GenericSectionsMap = Awaited<ReturnType<typeof resolveSplitConfigs>>["genericSections"];

// Self-referential — a breakdown row can itself carry a further breakdown,
// so any future nesting (e.g. sub-strategy-within-strategy) is representable
// without a schema change here.
export interface ClientStrategyBreakdownRow {
  strategy: string;
  monthly: MonthlyReturn[];
  yearly: YearlyReturn[];
  xirr: number | null;
  max_drawdown: number | null;
  current_drawdown: number | null;
  since_inception_absolute: number | null;
  since_inception_pnl: number | null;
  trailing_returns: TrailingReturns;
  strategy_breakdown: ClientStrategyBreakdownRow[];
}

export interface ClientMonthlyRow {
  qcode: string;
  account_name: string;
  is_multi_strategy: boolean;
  monthly: MonthlyReturn[];
  yearly: YearlyReturn[];
  xirr: number | null;
  max_drawdown: number | null;
  current_drawdown: number | null;
  since_inception_absolute: number | null;
  since_inception_pnl: number | null;
  trailing_returns: TrailingReturns;
  strategy_breakdown: ClientStrategyBreakdownRow[];
}

interface ClientGroup {
  qcode: string;
  account_name: string;
  isSoloProp: boolean;
  configs: {
    strategy: string;
    profit_tag_suffix: string;
    exposure_tag_suffix: string;
  }[];
}

// A node in the tag tree that feeds a row's returns — the root node for a
// client (combined tags), each strategy, and each strategy's system-tag
// sleeves (LONG, PSAR, DMA1, Gold Stock Holdings, ...) are the same shape,
// so one recursive resolver computes all of them.
interface ReturnsNode {
  label: string;
  profitTag: string;
  exposureTag: string;
  // Bare (unprefixed) tag to retry a generic (catalog-driven) sleeve under
  // if the strategy-prefixed tag has no data — only set for a qcode with
  // exactly one configured strategy (see resolveNode's header for why).
  fallbackProfitTag?: string;
  // Set only on the "Momentum Stock Holdings" node for QAW+/QAW++ — tells
  // resolveNode to derive momentum50/momidmtm as synthetic children once
  // this node's own metrics are resolved (see MOMENTUM_SPLIT_LEGS above).
  momentumSplit?: MomentumRatios;
  children: ReturnsNode[];
}

async function fetchClientGroups(
  accountType: "managed" | "prop",
): Promise<ClientGroup[]> {
  const configs = await prisma.client_strategy_configs.findMany({
    orderBy: [{ qcode: "asc" }, { effective_from: "asc" }],
  });

  const today = new Date();
  const grouped = new Map<string, typeof configs>();
  for (const c of configs) {
    if (!grouped.has(c.qcode)) grouped.set(c.qcode, []);
    grouped.get(c.qcode)!.push(c);
  }

  const result: ClientGroup[] = [];
  for (const [qcode, rows] of grouped) {
    const hasActive = rows.some((r) => !r.effective_to || r.effective_to >= today);
    if (!hasActive) continue;

    const isSoloProp = rows.length === 1 && rows[0].strategy === "Prop";
    if (accountType === "prop" && !isSoloProp) continue;
    if (accountType === "managed" && isSoloProp) continue;

    result.push({
      qcode,
      account_name: rows[0].account_name,
      isSoloProp,
      configs: rows.map((r) => ({
        strategy: r.strategy,
        profit_tag_suffix: r.profit_tag_suffix,
        exposure_tag_suffix: r.exposure_tag_suffix,
      })),
    });
  }

  return result;
}

// Combined profit/exposure tags — same discriminator as /api/internal/clients:
// solo-Prop clients have no "Qode Total Portfolio" rollup (bare, single-strategy
// tags already ARE the whole portfolio), everyone else does.
function combinedTags(group: ClientGroup): { profitTag: string; exposureTag: string } {
  if (group.isSoloProp) {
    return {
      profitTag: group.configs[0].profit_tag_suffix,
      exposureTag: group.configs[0].exposure_tag_suffix,
    };
  }
  const hasZerodha = group.configs.some((c) =>
    c.exposure_tag_suffix.toLowerCase().includes("zerodha"),
  );
  return {
    profitTag: "Qode Total Portfolio",
    exposureTag: hasZerodha ? "Zerodha Total Portfolio" : "Total Portfolio Exposure",
  };
}

// Builds each strategy's system-tag children: the hardcoded LONG/NLONG/SLONG/
// PSAR/NPSAR/SPSAR/Gold/Momentum/Low-Vol family (gated on the matching
// SplitConfig field, exactly like Sub-Strategy Performance), the generic
// catalog-driven family (DMA1, OVERNIGHTHEDGE1, ... — naturally QAW-only,
// since a strategy with no "dma"/"overnight_hedge" default simply has no
// entry here), and Liquidcase Stock Holdings, which has no gate field and is
// just attempted.
function buildSystemTagChildren(
  qcode: string,
  strategy: string,
  strategyCount: number,
  split: SplitConfig | undefined,
  generic: Map<string, { value: number; label: string; tagSuffix: string }> | undefined,
  momentumRatios: Map<string, MomentumRatios>,
): ReturnsNode[] {
  const children: ReturnsNode[] = [];

  if (split) {
    for (const sec of SUB_STRATEGY_SECTIONS) {
      const value = split[sec.existsField];
      if (value == null) continue;
      // This page shows the bare tag ("LONG (1.5%)") rather than the
      // shared "Long Options (1.5%)" label used elsewhere (Sub-Strategy
      // Performance) — scoped here only, doesn't touch the shared label.
      const label = sec.labelFor(value).replace(/^Long Options\b/, "LONG");
      children.push({
        label,
        profitTag: `${strategy} ${sec.tag}`,
        exposureTag: `${strategy} ${sec.tag}`,
        momentumSplit: sec.tag === MOMENTUM_TAG ? momentumRatios.get(strategy) : undefined,
        children: [],
      });
    }
  }

  if (generic) {
    for (const entry of generic.values()) {
      children.push({
        label: entry.label,
        profitTag: `${strategy} ${entry.tagSuffix}`,
        exposureTag: `${strategy} ${entry.tagSuffix}`,
        // Bare tag is only trusted as a fallback for a qcode with exactly
        // one configured strategy — a multi-strategy client's bare tag would
        // mix activity from more than one strategy (see DMA's history).
        fallbackProfitTag: strategyCount === 1 ? entry.tagSuffix : undefined,
        children: [],
      });
    }
  }

  children.push({
    // Display label only — the underlying tag stays "Liquidcase Stock
    // Holdings" (LIQUIDCASE_TAG), matching the DB's master_sheet system_tag.
    label: "Liquidcase",
    profitTag: `${strategy} ${LIQUIDCASE_TAG}`,
    exposureTag: `${strategy} ${LIQUIDCASE_TAG}`,
    children: [],
  });

  children.push({
    // Display label only — underlying tag stays "Liquidadd Stock Holdings"
    // (LIQUIDADD_TAG), matching the DB's master_sheet system_tag.
    label: "LiquidAdd",
    profitTag: `${strategy} ${LIQUIDADD_TAG}`,
    exposureTag: `${strategy} ${LIQUIDADD_TAG}`,
    children: [],
  });

  return children;
}

// Builds the root node (combined tags) and one child per strategy config,
// each carrying its own system-tag children. Prop is structurally different
// from Managed — bare tags, no strategy prefix, its own catalog
// (prop_sub_strategy_sections). A solo-Prop group has exactly one config
// ("Prop") whose tags are identical to the root's own combinedTags() (a
// solo-Prop root has no separate rollup tag — see combinedTags), so that
// config would only add a redundant "Prop" node showing the same NAV data
// twice before reaching the real leaves. Skipped here: propLeaves become
// the root's direct children instead.
function buildRootNode(
  group: ClientGroup,
  splits: SplitConfigMap | null,
  genericSections: GenericSectionsMap | null,
  propLeaves: PropCatalogLeaf[] | null,
  momentumRatios: Map<string, MomentumRatios>,
): ReturnsNode {
  const { profitTag, exposureTag } = combinedTags(group);
  const strategyCount = group.configs.length;

  if (group.isSoloProp) {
    return {
      label: group.account_name,
      profitTag,
      exposureTag,
      children: (propLeaves ?? []).map((leaf) => ({
        // This page shows the bare tag ("LONG") rather than the catalog's
        // own "Long Options" label — scoped here only, same treatment as
        // the managed-side LONG rename above; doesn't touch the shared
        // catalog data or the Sub-Strategy Performance page.
        label: leaf.label === "Long Options" ? "LONG" : leaf.label,
        profitTag: leaf.tag_suffix,
        exposureTag: leaf.tag_suffix,
        children: [],
      })),
    };
  }

  return {
    label: group.account_name,
    profitTag,
    exposureTag,
    children: group.configs.map((c) => ({
      label: c.strategy,
      profitTag: `${c.strategy} ${c.profit_tag_suffix}`,
      exposureTag: `${c.strategy} ${c.exposure_tag_suffix}`,
      children: buildSystemTagChildren(
        group.qcode,
        c.strategy,
        strategyCount,
        splits?.get(`${group.qcode}|${c.strategy}`),
        genericSections?.get(`${group.qcode}|${c.strategy}`),
        momentumRatios,
      ),
    })),
  };
}

function flattenNode(qcode: string, node: ReturnsNode): { qcode: string; tag: string }[] {
  const pairs = [{ qcode, tag: node.profitTag }];
  if (node.fallbackProfitTag) pairs.push({ qcode, tag: node.fallbackProfitTag });
  return [...pairs, ...node.children.flatMap((c) => flattenNode(qcode, c))];
}
function flattenNodeExposure(
  qcode: string,
  node: ReturnsNode,
): { qcode: string; tag: string }[] {
  return [
    { qcode, tag: node.exposureTag },
    ...node.children.flatMap((c) => flattenNodeExposure(qcode, c)),
  ];
}

type NavSeriesMap = Awaited<ReturnType<typeof fetchBulkNavSeries>>;
type XirrInputsMap = Awaited<ReturnType<typeof fetchBulkXirrInputs>>;

interface ResolvedReturns {
  monthly: MonthlyReturn[];
  yearly: YearlyReturn[];
  xirr: number | null;
  max_drawdown: number | null;
  current_drawdown: number | null;
  since_inception_absolute: number | null;
  since_inception_pnl: number | null;
  trailing_returns: TrailingReturns;
  strategy_breakdown: ClientStrategyBreakdownRow[];
}

// Derives a momentum50/momidmtm leg by scaling a resolved node's own pnl by
// its live capital-weight ratio — see MOMENTUM_SPLIT_LEGS above for why this
// is a scale, not a fetch. % figures (return, XIRR, drawdown, CAGR) are
// scale-invariant so they're carried over unchanged; only rupee amounts
// (pnl_inr) are multiplied by the ratio.
//
// IMPORTANT: this means momentum50 and momidmtm always show byte-identical
// % figures — that's expected, not a bug. There is no separate historical
// NAV/price series for either leg anywhere in the data; only the blended
// parent "Momentum Stock Holdings" NAV exists, plus a *current* weight
// ratio. So "each leg's own % return" isn't something we can compute —
// only "each leg's proportional share of the combined rupee P&L" is.
// Confirmed with the team (2026-09-29): keep this as-is rather than fabricate
// a per-leg % that isn't backed by real data.
function scaleMomentumLeg(
  own: Omit<ResolvedReturns, "strategy_breakdown">,
  ratio: number,
  label: string,
): ClientStrategyBreakdownRow {
  const scaleTrailing = (t: TrailingReturns): TrailingReturns => {
    const out = {} as TrailingReturns;
    (Object.keys(t) as (keyof TrailingReturns)[]).forEach((k) => {
      out[k] = {
        pct: t[k].pct,
        pnl_inr: t[k].pnl_inr != null ? round(t[k].pnl_inr! * ratio, 2) : null,
      };
    });
    return out;
  };

  return {
    strategy: label,
    monthly: own.monthly.map((m) => ({ ...m, pnl_inr: round(m.pnl_inr * ratio, 2) ?? 0 })),
    yearly: own.yearly.map((y) => ({ ...y, pnl_inr: round(y.pnl_inr * ratio, 2) ?? 0 })),
    xirr: own.xirr,
    max_drawdown: own.max_drawdown,
    current_drawdown: own.current_drawdown,
    since_inception_absolute: own.since_inception_absolute,
    since_inception_pnl: own.since_inception_pnl != null ? round(own.since_inception_pnl * ratio, 2) : null,
    trailing_returns: scaleTrailing(own.trailing_returns),
    strategy_breakdown: [],
  };
}

// Recursively resolves a node's own metrics, then its children's — a node
// without NAV data (and thus no own metrics) is dropped from the breakdown
// entirely, same as its children. Falls back to the bare tag (if any) only
// when the strategy-prefixed tag has no data. `momentumSplit`, when set,
// additionally synthesizes momentum50/momidmtm as two more breakdown
// entries derived from this node's own just-resolved metrics.
//
// `depth` is 0 for the client root, 1 for each strategy child (Managed) —
// XIRR is only meaningful money-weighted at those two levels (a deposit
// isn't attributable to one sleeve any more than to one tag). Deeper nodes
// (LONG/PSAR/Gold/Liquidcase/... and the synthetic momentum50/momidmtm
// legs) get `xirr: null` instead of a real per-sleeve solve. Solo-Prop has
// no separate strategy layer — the client root already IS "the strategy"
// (see buildRootNode's isSoloProp branch), so its depth-1 children are
// sleeves, not a strategy node; `maxXirrDepth` lets the caller pass 0 for
// solo-Prop so those sleeves don't wrongly get a real XIRR either.
function resolveNode(
  qcode: string,
  node: ReturnsNode,
  navMap: NavSeriesMap,
  xirrMap: XirrInputsMap,
  depth = 0,
  maxXirrDepth = 1,
): ResolvedReturns | null {
  let nav = navMap.get(`${qcode}|${node.profitTag}`);
  if ((!nav || nav.length === 0) && node.fallbackProfitTag) {
    nav = navMap.get(`${qcode}|${node.fallbackProfitTag}`);
  }
  if (!nav || nav.length === 0) return null;

  const xirrInputs =
    depth <= maxXirrDepth ? xirrMap.get(`${qcode}|${node.exposureTag}`) : null;
  const monthly = calcMonthlyReturns(nav);

  const own: Omit<ResolvedReturns, "strategy_breakdown"> = {
    monthly,
    yearly: calcYearlyReturns(monthly),
    xirr: xirrInputs
      ? solveXirr(xirrInputs.flows, xirrInputs.asOfDate, xirrInputs.finalValue)
      : null,
    max_drawdown: calcMaxDrawdown(nav),
    current_drawdown: calcCurrentDrawdown(nav),
    since_inception_absolute: calcSinceInceptionAbsolute(nav),
    since_inception_pnl: calcSiPnl(nav),
    trailing_returns: calcTrailingReturns(nav),
  };

  const strategy_breakdown: ClientStrategyBreakdownRow[] = [];
  for (const child of node.children) {
    const resolved = resolveNode(qcode, child, navMap, xirrMap, depth + 1, maxXirrDepth);
    if (!resolved) continue;
    strategy_breakdown.push({ strategy: child.label, ...resolved });
  }

  if (node.momentumSplit) {
    for (const leg of MOMENTUM_SPLIT_LEGS) {
      const ratio = node.momentumSplit[leg.config_key as keyof MomentumRatios];
      strategy_breakdown.push(scaleMomentumLeg(own, ratio, leg.label));
    }
  }

  return { ...own, strategy_breakdown };
}

export async function computeClientMonthlyReturns(
  accountType: "managed" | "prop" = "managed",
): Promise<ClientMonthlyRow[]> {
  const groups = await fetchClientGroups(accountType);
  if (groups.length === 0) return [];

  const table = accountType === "prop" ? PROP_TABLE : MANAGED_TABLE;
  let splits: SplitConfigMap | null = null;
  let genericSections: GenericSectionsMap | null = null;
  let propLeaves: PropCatalogLeaf[] | null = null;
  let momentumRatios: Map<string, MomentumRatios> = new Map();
  if (accountType === "managed") {
    const qcodes = new Set(groups.map((g) => g.qcode));
    const [pairs, fetchedMomentumRatios] = await Promise.all([
      fetchStrategyPairs("profit_tag_suffix").then((all) =>
        all.filter((p) => qcodes.has(p.qcode) && p.strategy !== "Prop"),
      ),
      fetchMomentumSplitRatios(),
    ]);
    momentumRatios = fetchedMomentumRatios;
    const resolved = await resolveSplitConfigs(pairs, new Date());
    splits = resolved.splits;
    genericSections = resolved.genericSections;
  } else {
    propLeaves = await fetchPropCatalog();
  }
  const roots = new Map(
    groups.map((g) => [
      g.qcode,
      buildRootNode(g, splits, genericSections, propLeaves, momentumRatios),
    ]),
  );

  const profitPairs = groups.flatMap((g) => flattenNode(g.qcode, roots.get(g.qcode)!));
  const exposurePairs = groups.flatMap((g) =>
    flattenNodeExposure(g.qcode, roots.get(g.qcode)!),
  );

  const [navMap, xirrMap] = await Promise.all([
    fetchBulkNavSeries(profitPairs, undefined, undefined, table),
    fetchBulkXirrInputs(exposurePairs, undefined, undefined, table),
  ]);

  const rows: ClientMonthlyRow[] = [];
  for (const group of groups) {
    const root = roots.get(group.qcode)!;
    const resolved = resolveNode(
      group.qcode,
      root,
      navMap,
      xirrMap,
      0,
      group.isSoloProp ? 0 : 1,
    );
    if (!resolved) continue;

    rows.push({
      qcode: group.qcode,
      account_name: group.account_name,
      is_multi_strategy: group.configs.length > 1,
      ...resolved,
    });
  }

  return rows;
}
