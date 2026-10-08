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
import type { NavPoint } from "@/app/lib/internal-utils";

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

// Momentum's two sub-legs (MOMENTUM50 / MOMIDMTM) have no NAV tag of their
// own in master_sheet. Their split comes from the client's actual holdings in
// bifurcated_equity_holding_test: rows with sub_category = 'Momentum', told
// apart by `symbol`, valued by value_as_of_today. A leg exists only if the
// client has ever held that symbol (e.g. a client holding only MOMENTUM50 has
// no MomIdMtm leg). Each leg's rupee P&L is the parent Momentum series' daily
// pnl times that day's value share, so the share can change over time; the %
// figures stay the parent's (there is no separate per-leg NAV series).
const MOMENTUM_TAG = "Momentum Stock Holdings";
const MOMENTUM_SUB_CATEGORY = "Momentum";
const MOMENTUM_SPLIT_LEGS = [
  { symbol: "MOMENTUM50", label: "Momentum50" },
  { symbol: "MOMIDMTM", label: "MomIdMtm" },
] as const;

type MomentumLegSymbol = (typeof MOMENTUM_SPLIT_LEGS)[number]["symbol"];
// Value share per leg on one holdings date; shares sum to 1 across the legs
// held that day.
interface MomentumSnapshot {
  date: string; // ISO yyyy-mm-dd
  shares: Record<MomentumLegSymbol, number>;
}
// Ascending by date, keyed `${qcode}|${strategy}`.
type MomentumSplitHistory = MomentumSnapshot[];

async function fetchMomentumSplits(
  qcodes: string[],
): Promise<Map<string, MomentumSplitHistory>> {
  const result = new Map<string, MomentumSplitHistory>();
  if (qcodes.length === 0) return result;

  const rows = await prisma.$queryRawUnsafe<
    { qcode: string; strategy: string | null; date: string; symbol: string; value: number }[]
  >(
    `SELECT qcode, strategy, date::text AS date, symbol,
            COALESCE(SUM(value_as_of_today), 0)::float AS value
     FROM bifurcated_equity_holding_test
     WHERE sub_category = $1
       AND symbol = ANY($2::text[])
       AND qcode = ANY($3::text[])
     GROUP BY qcode, strategy, date, symbol
     ORDER BY qcode, strategy, date`,
    MOMENTUM_SUB_CATEGORY,
    MOMENTUM_SPLIT_LEGS.map((l) => l.symbol),
    qcodes,
  );

  const byDay = new Map<string, Map<string, Record<string, number>>>();
  for (const r of rows) {
    if (!r.strategy) continue;
    const key = `${r.qcode}|${r.strategy}`;
    if (!byDay.has(key)) byDay.set(key, new Map());
    const days = byDay.get(key)!;
    if (!days.has(r.date)) days.set(r.date, {});
    days.get(r.date)![r.symbol] = r.value;
  }

  for (const [key, days] of byDay) {
    const history: MomentumSplitHistory = [];
    for (const [date, values] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
      const total = MOMENTUM_SPLIT_LEGS.reduce((sum, l) => sum + (values[l.symbol] ?? 0), 0);
      if (total <= 0) continue;
      history.push({
        date,
        shares: {
          MOMENTUM50: (values.MOMENTUM50 ?? 0) / total,
          MOMIDMTM: (values.MOMIDMTM ?? 0) / total,
        },
      });
    }
    if (history.length > 0) result.set(key, history);
  }
  return result;
}

// Share of `symbol` on `date`: the latest snapshot on or before it; days
// before the first snapshot use the first snapshot.
function momentumShareAt(
  history: MomentumSplitHistory,
  symbol: MomentumLegSymbol,
  date: Date,
): number {
  const day = date.toISOString().split("T")[0];
  let snap = history[0];
  for (const h of history) {
    if (h.date > day) break;
    snap = h;
  }
  return snap.shares[symbol];
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
  // Set only on the "Momentum Stock Holdings" node of a client that has
  // MOMENTUM50/MOMIDMTM holdings — tells resolveNode to derive those legs as
  // synthetic children once this node's own metrics are resolved.
  momentumSplit?: MomentumSplitHistory;
  children: ReturnsNode[];
}

async function fetchClientGroups(
  accountType: "managed" | "prop",
): Promise<ClientGroup[]> {
  const configs = await prisma.client_strategy_configs.findMany({
    orderBy: [{ qcode: "asc" }, { effective_from: "asc" }],
  });

  const grouped = new Map<string, typeof configs>();
  for (const c of configs) {
    if (!grouped.has(c.qcode)) grouped.set(c.qcode, []);
    grouped.get(c.qcode)!.push(c);
  }

  const result: ClientGroup[] = [];
  for (const [qcode, rows] of grouped) {
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
  momentumSplits: Map<string, MomentumSplitHistory>,
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
        momentumSplit:
          sec.tag === MOMENTUM_TAG ? momentumSplits.get(`${qcode}|${strategy}`) : undefined,
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
  momentumSplits: Map<string, MomentumSplitHistory>,
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
        momentumSplits,
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

// Derives one Momentum leg from the parent Momentum series: each day's pnl is
// multiplied by that day's holdings share for the leg's symbol, then the usual
// monthly / yearly / since-inception / trailing calcs run on that scaled
// series, so rupee figures follow the changing split. % figures, XIRR and
// drawdowns are carried over from the parent unchanged — no separate NAV
// series exists per leg, so "each leg's own % return" isn't computable;
// only each leg's share of the combined rupee P&L is.
function buildMomentumLeg(
  nav: NavPoint[],
  own: Omit<ResolvedReturns, "strategy_breakdown">,
  history: MomentumSplitHistory,
  symbol: MomentumLegSymbol,
  label: string,
): ClientStrategyBreakdownRow {
  const legNav = nav.map((p) => ({
    ...p,
    pnl: p.pnl * momentumShareAt(history, symbol, p.date),
  }));
  const monthly = calcMonthlyReturns(legNav);
  const trailing = calcTrailingReturns(legNav);
  const trailing_returns = {} as TrailingReturns;
  (Object.keys(trailing) as (keyof TrailingReturns)[]).forEach((k) => {
    trailing_returns[k] = { pct: own.trailing_returns[k].pct, pnl_inr: trailing[k].pnl_inr };
  });

  return {
    strategy: label,
    monthly: monthly.map((m, i) => ({ ...m, return_pct: own.monthly[i].return_pct })),
    yearly: own.yearly.map((y) => ({
      ...y,
      pnl_inr: round(
        monthly.filter((m) => m.year === y.year).reduce((sum, m) => sum + m.pnl_inr, 0),
        2,
      ) ?? 0,
    })),
    xirr: own.xirr,
    max_drawdown: own.max_drawdown,
    current_drawdown: own.current_drawdown,
    since_inception_absolute: own.since_inception_absolute,
    since_inception_pnl: calcSiPnl(legNav),
    trailing_returns,
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
    const history = node.momentumSplit;
    for (const leg of MOMENTUM_SPLIT_LEGS) {
      // Only legs the client has actually held at some point.
      if (!history.some((h) => h.shares[leg.symbol] > 0)) continue;
      strategy_breakdown.push(buildMomentumLeg(nav, own, history, leg.symbol, leg.label));
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
  let momentumSplits: Map<string, MomentumSplitHistory> = new Map();
  if (accountType === "managed") {
    const qcodes = new Set(groups.map((g) => g.qcode));
    const [pairs, fetchedMomentumSplits] = await Promise.all([
      fetchStrategyPairs("profit_tag_suffix").then((all) =>
        all.filter((p) => qcodes.has(p.qcode) && p.strategy !== "Prop"),
      ),
      fetchMomentumSplits([...qcodes]),
    ]);
    momentumSplits = fetchedMomentumSplits;
    const resolved = await resolveSplitConfigs(pairs, new Date());
    splits = resolved.splits;
    genericSections = resolved.genericSections;
  } else {
    propLeaves = await fetchPropCatalog();
  }
  const roots = new Map(
    groups.map((g) => [
      g.qcode,
      buildRootNode(g, splits, genericSections, propLeaves, momentumSplits),
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
