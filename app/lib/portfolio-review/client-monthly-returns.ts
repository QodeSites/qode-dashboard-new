import { prisma } from "@/lib/prisma";
import { fetchBulkNavSeries } from "@/app/lib/portfolio-review/nav-series";
import { fetchBulkXirrInputs, solveXirr } from "@/app/lib/portfolio-review/xirr";
import {
  calcMonthlyReturns,
  calcYearlyReturns,
  calcMaxDrawdown,
  calcCurrentDrawdown,
  calcSinceInceptionAbsolute,
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
): ReturnsNode[] {
  const children: ReturnsNode[] = [];

  if (split) {
    for (const sec of SUB_STRATEGY_SECTIONS) {
      const value = split[sec.existsField];
      if (value == null) continue;
      children.push({
        label: sec.labelFor(value),
        profitTag: `${strategy} ${sec.tag}`,
        exposureTag: `${strategy} ${sec.tag}`,
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
    label: LIQUIDCASE_TAG,
    profitTag: `${strategy} ${LIQUIDCASE_TAG}`,
    exposureTag: `${strategy} ${LIQUIDCASE_TAG}`,
    children: [],
  });

  return children;
}

// Builds the root node (combined tags) and one child per strategy config,
// each carrying its own system-tag children. Prop is structurally different
// from Managed — bare tags, no strategy prefix, its own catalog
// (prop_sub_strategy_sections) — so a solo-Prop group's child is built from
// propLeaves instead of the Managed splits/genericSections machinery.
function buildRootNode(
  group: ClientGroup,
  splits: SplitConfigMap | null,
  genericSections: GenericSectionsMap | null,
  propLeaves: PropCatalogLeaf[] | null,
): ReturnsNode {
  const { profitTag, exposureTag } = combinedTags(group);
  const strategyCount = group.configs.length;
  return {
    label: group.account_name,
    profitTag,
    exposureTag,
    children: group.configs.map((c) =>
      group.isSoloProp
        ? {
            label: c.strategy,
            profitTag: c.profit_tag_suffix,
            exposureTag: c.exposure_tag_suffix,
            children: (propLeaves ?? []).map((leaf) => ({
              label: leaf.label,
              profitTag: leaf.tag_suffix,
              exposureTag: leaf.tag_suffix,
              children: [],
            })),
          }
        : {
            label: c.strategy,
            profitTag: `${c.strategy} ${c.profit_tag_suffix}`,
            exposureTag: `${c.strategy} ${c.exposure_tag_suffix}`,
            children: buildSystemTagChildren(
              group.qcode,
              c.strategy,
              strategyCount,
              splits?.get(`${group.qcode}|${c.strategy}`),
              genericSections?.get(`${group.qcode}|${c.strategy}`),
            ),
          },
    ),
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
  trailing_returns: TrailingReturns;
  strategy_breakdown: ClientStrategyBreakdownRow[];
}

// Recursively resolves a node's own metrics, then its children's — a node
// without NAV data (and thus no own metrics) is dropped from the breakdown
// entirely, same as its children. Falls back to the bare tag (if any) only
// when the strategy-prefixed tag has no data.
function resolveNode(
  qcode: string,
  node: ReturnsNode,
  navMap: NavSeriesMap,
  xirrMap: XirrInputsMap,
): ResolvedReturns | null {
  let nav = navMap.get(`${qcode}|${node.profitTag}`);
  if ((!nav || nav.length === 0) && node.fallbackProfitTag) {
    nav = navMap.get(`${qcode}|${node.fallbackProfitTag}`);
  }
  if (!nav || nav.length === 0) return null;

  const xirrInputs = xirrMap.get(`${qcode}|${node.exposureTag}`);
  const monthly = calcMonthlyReturns(nav);

  const strategy_breakdown: ClientStrategyBreakdownRow[] = [];
  for (const child of node.children) {
    const resolved = resolveNode(qcode, child, navMap, xirrMap);
    if (!resolved) continue;
    strategy_breakdown.push({ strategy: child.label, ...resolved });
  }

  return {
    monthly,
    yearly: calcYearlyReturns(monthly),
    xirr: xirrInputs
      ? solveXirr(xirrInputs.flows, xirrInputs.asOfDate, xirrInputs.finalValue)
      : null,
    max_drawdown: calcMaxDrawdown(nav),
    current_drawdown: calcCurrentDrawdown(nav),
    since_inception_absolute: calcSinceInceptionAbsolute(nav),
    trailing_returns: calcTrailingReturns(nav),
    strategy_breakdown,
  };
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
  if (accountType === "managed") {
    const qcodes = new Set(groups.map((g) => g.qcode));
    const pairs = (await fetchStrategyPairs("profit_tag_suffix")).filter(
      (p) => qcodes.has(p.qcode) && p.strategy !== "Prop",
    );
    const resolved = await resolveSplitConfigs(pairs, new Date());
    splits = resolved.splits;
    genericSections = resolved.genericSections;
  } else {
    propLeaves = await fetchPropCatalog();
  }
  const roots = new Map(
    groups.map((g) => [g.qcode, buildRootNode(g, splits, genericSections, propLeaves)]),
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
    const resolved = resolveNode(group.qcode, root, navMap, xirrMap);
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
