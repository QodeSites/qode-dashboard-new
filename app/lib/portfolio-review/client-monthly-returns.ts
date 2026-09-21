import { prisma } from "@/lib/prisma";
import { fetchBulkNavSeries } from "@/app/lib/portfolio-review/nav-series";
import { fetchBulkXirrInputs, solveXirr } from "@/app/lib/portfolio-review/xirr";
import {
  calcMonthlyReturns,
  calcYearlyReturns,
  calcMaxDrawdown,
  calcCurrentDrawdown,
  calcSinceInceptionAbsolute,
} from "@/app/lib/portfolio-review/returns";
import type { MonthlyReturn, YearlyReturn } from "@/app/lib/portfolio-review/returns";

import { fetchStrategyPairs } from "@/app/lib/portfolio-review/tags";
import { resolveSplitConfigs } from "@/app/lib/portfolio-review/mandate-snapshot";

const PROP_TABLE = "master_sheet_test" as const;
const MANAGED_TABLE = "bifurcated_master_sheet_test" as const;

// Per `${qcode}|${strategy}`: equity-book sleeves (label + tag from
// config_catalog) that have an "ideal" value for that strategy.
type SleeveMap = Awaited<ReturnType<typeof resolveSplitConfigs>>["equitySleeves"];

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
// client (combined tags) and each breakdown entry are the same shape, so one
// recursive resolver can compute both.
interface ReturnsNode {
  label: string;
  profitTag: string;
  exposureTag: string;
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

// Builds the root node (combined tags), one child per strategy config, and
// under each strategy the Gold/Momentum/Low Vol sleeves the resolver allows.
function buildRootNode(group: ClientGroup, sleeves: SleeveMap | null): ReturnsNode {
  const { profitTag, exposureTag } = combinedTags(group);
  const isMulti = group.configs.length > 1;
  return {
    label: group.account_name,
    profitTag,
    exposureTag,
    children: isMulti
      ? group.configs.map((c) => {
          const strategySleeves = sleeves?.get(`${group.qcode}|${c.strategy}`);
          return {
            label: c.strategy,
            profitTag: `${c.strategy} ${c.profit_tag_suffix}`,
            exposureTag: `${c.strategy} ${c.exposure_tag_suffix}`,
            children: strategySleeves
              ? [...strategySleeves.values()].map((s) => ({
                  label: s.label,
                  profitTag: `${c.strategy} ${s.tagSuffix}`,
                  exposureTag: `${c.strategy} ${s.tagSuffix}`,
                  children: [],
                }))
              : [],
          };
        })
      : [],
  };
}

function flattenNode(qcode: string, node: ReturnsNode): { qcode: string; tag: string }[] {
  return [
    { qcode, tag: node.profitTag },
    ...node.children.flatMap((c) => flattenNode(qcode, c)),
  ];
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
  strategy_breakdown: ClientStrategyBreakdownRow[];
}

// Recursively resolves a node's own metrics, then its children's — a node
// without NAV data (and thus no own metrics) is dropped from the breakdown
// entirely, same as its children.
function resolveNode(
  qcode: string,
  node: ReturnsNode,
  navMap: NavSeriesMap,
  xirrMap: XirrInputsMap,
): ResolvedReturns | null {
  const nav = navMap.get(`${qcode}|${node.profitTag}`);
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
    strategy_breakdown,
  };
}

export async function computeClientMonthlyReturns(
  accountType: "managed" | "prop" = "managed",
): Promise<ClientMonthlyRow[]> {
  const groups = await fetchClientGroups(accountType);
  if (groups.length === 0) return [];

  const table = accountType === "prop" ? PROP_TABLE : MANAGED_TABLE;
  let sleeves: SleeveMap | null = null;
  if (accountType === "managed") {
    const qcodes = new Set(groups.map((g) => g.qcode));
    const pairs = (await fetchStrategyPairs("profit_tag_suffix")).filter(
      (p) => qcodes.has(p.qcode) && p.strategy !== "Prop",
    );
    sleeves = (await resolveSplitConfigs(pairs, new Date())).equitySleeves;
  }
  const roots = new Map(groups.map((g) => [g.qcode, buildRootNode(g, sleeves)]));

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
