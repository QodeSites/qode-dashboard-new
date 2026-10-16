import { prisma } from "@/lib/prisma";
import { round } from "@/lib/utils";
import { fetchBulkNavSeries } from "@/app/lib/portfolio-review/nav-series";
import {
  calcMonthlyReturns,
  calcYearlyReturns,
  calcMaxDrawdown,
  calcCurrentDrawdown,
  calcSinceInception,
  calcSiPnl,
  calcTrailingReturns,
} from "@/app/lib/portfolio-review/returns";
import type { MonthlyReturn, YearlyReturn, TrailingReturns } from "@/app/lib/portfolio-review/returns";
import type { NavPoint } from "@/app/lib/internal-utils";

import {
  fetchStrategyPairs,
  effectiveToForTag,
  trimToEffectiveTo,
} from "@/app/lib/portfolio-review/tags";
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
// own in master_sheet. They are derived from the client's actual holdings in
// bifurcated_equity_holding_test: rows with sub_category = 'Momentum', told
// apart by `symbol` (quantity, ltp, value_as_of_today). A leg exists only if
// the client has ever held that symbol. See allocateMomentumDays for how the
// parent Momentum series' daily pnl and return are attributed to each leg.
const MOMENTUM_TAG = "Momentum Stock Holdings";
const MOMENTUM_SUB_CATEGORY = "Momentum";
const MOMENTUM_SPLIT_LEGS = [
  { symbol: "MOMENTUM50", label: "Momentum50" },
  { symbol: "MOMIDMTM", label: "MomIdMtm" },
] as const;

type MomentumLegSymbol = (typeof MOMENTUM_SPLIT_LEGS)[number]["symbol"];
interface MomentumPosition {
  qty: number;
  ltp: number;
  value: number;
}
// One holdings date for a client/strategy: each leg's position, plus its
// value share of the combined Momentum holding.
interface MomentumSnapshot {
  date: string; // ISO yyyy-mm-dd
  legs: Partial<Record<MomentumLegSymbol, MomentumPosition>>;
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
    {
      qcode: string;
      strategy: string | null;
      date: string;
      symbol: MomentumLegSymbol;
      qty: number;
      ltp: number;
      value: number;
    }[]
  >(
    `SELECT qcode, strategy, date::text AS date, symbol,
            COALESCE(SUM(quantity), 0)::float AS qty,
            COALESCE(MAX(ltp), 0)::float AS ltp,
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

  const byDay = new Map<string, Map<string, MomentumSnapshot["legs"]>>();
  for (const r of rows) {
    if (!r.strategy) continue;
    const key = `${r.qcode}|${r.strategy}`;
    if (!byDay.has(key)) byDay.set(key, new Map());
    const days = byDay.get(key)!;
    if (!days.has(r.date)) days.set(r.date, {});
    days.get(r.date)![r.symbol] = { qty: r.qty, ltp: r.ltp, value: r.value };
  }

  for (const [key, days] of byDay) {
    const history: MomentumSplitHistory = [];
    for (const [date, legs] of [...days].sort(([x], [y]) => x.localeCompare(y))) {
      const total = MOMENTUM_SPLIT_LEGS.reduce((sum, l) => sum + (legs[l.symbol]?.value ?? 0), 0);
      if (total <= 0) continue;
      history.push({
        date,
        legs,
        shares: {
          MOMENTUM50: (legs.MOMENTUM50?.value ?? 0) / total,
          MOMIDMTM: (legs.MOMIDMTM?.value ?? 0) / total,
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
  // Blended: absolute <1yr tenure, CAGR >=1yr — no separate XIRR field.
  since_inception: number | null;
  max_drawdown: number | null;
  current_drawdown: number | null;
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
  since_inception: number | null;
  max_drawdown: number | null;
  current_drawdown: number | null;
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
    effective_to: Date | null;
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
        effective_to: r.effective_to,
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
type NavSeriesMap = Awaited<ReturnType<typeof fetchBulkNavSeries>>;

interface ResolvedReturns {
  monthly: MonthlyReturn[];
  yearly: YearlyReturn[];
  since_inception: number | null;
  max_drawdown: number | null;
  current_drawdown: number | null;
  since_inception_pnl: number | null;
  trailing_returns: TrailingReturns;
  strategy_breakdown: ClientStrategyBreakdownRow[];
}

interface MomentumLegDay {
  pnl: number;
  ret: number;
}

const isoDay = (d: Date) => d.toISOString().split("T")[0];

// Attributes each day of the parent Momentum series to its legs.
//
// P&L: when both today's and the previous NAV day's holdings snapshots exist,
// each leg's actual contribution is prior-day quantity x that day's ltp move;
// the parent's pnl is split in proportion to those contributions (so legs
// still sum to the parent exactly). If that isn't usable - a snapshot is
// missing, or the contributions are near-zero / disagree in sign with the
// parent's pnl - the parent's pnl is split by holdings value share instead.
//
// Return: a leg's return is its own ltp move. On a day with a snapshot it is
// measured from the leg's previous snapshot (so a gap of missing days is
// captured once, on the day data resumes, and the gap days carry 0). Only
// where there is no price data to use (the leg isn't held that day, or no
// later snapshot exists) does it fall back to the parent's daily return.
function allocateMomentumDays(
  nav: NavPoint[],
  history: MomentumSplitHistory,
): Record<MomentumLegSymbol, MomentumLegDay[]> {
  const byDate = new Map(history.map((h, i) => [h.date, i]));
  const out = { MOMENTUM50: [], MOMIDMTM: [] } as Record<MomentumLegSymbol, MomentumLegDay[]>;
  const lastSnapshot = history[history.length - 1].date;

  // Index of the latest earlier snapshot that holds `symbol`.
  const refIndex = (symbol: MomentumLegSymbol, before: number): number => {
    for (let k = before - 1; k >= 0; k--) if (history[k].legs[symbol]) return k;
    return -1;
  };

  nav.forEach((p, i) => {
    const day = isoDay(p.date);
    const prevNav = p.prev_nav ?? (i > 0 ? nav[i - 1].nav : null);
    const parentRet = prevNav != null && prevNav > 0 ? p.nav / prevNav - 1 : 0;
    const curIdx = byDate.get(day);
    const prevIdx = i > 0 ? byDate.get(isoDay(nav[i - 1].date)) : undefined;

    const ret = {} as Record<MomentumLegSymbol, number>;
    for (const { symbol } of MOMENTUM_SPLIT_LEGS) {
      if (curIdx !== undefined) {
        const now = history[curIdx].legs[symbol];
        const ref = now ? refIndex(symbol, curIdx) : -1;
        if (now && ref >= 0 && history[ref].legs[symbol]!.ltp > 0) {
          ret[symbol] = now.ltp / history[ref].legs[symbol]!.ltp - 1;
        } else if (now && ref < 0 && curIdx > 0) {
          // first day the leg appears after the series began: it was bought
          // at this snapshot, so it has no return of its own yet
          ret[symbol] = 0;
        } else {
          ret[symbol] = parentRet;
        }
      } else {
        // between two snapshots of a leg already held: that gap's move is
        // booked on the day data resumes. Before the first snapshot or after
        // the last, there is no price data, so follow the parent.
        const heldBefore = history.some((h) => h.date < day && h.legs[symbol]);
        const heldLater = history.some((h) => h.date > day && h.legs[symbol]);
        ret[symbol] = heldBefore && heldLater && day < lastSnapshot ? 0 : parentRet;
      }
    }

    if (curIdx !== undefined && prevIdx !== undefined) {
      const contrib = {} as Record<MomentumLegSymbol, number>;
      for (const { symbol } of MOMENTUM_SPLIT_LEGS) {
        const before = history[prevIdx].legs[symbol];
        const now = history[curIdx].legs[symbol];
        contrib[symbol] = before && now ? before.qty * (now.ltp - before.ltp) : 0;
      }
      const sum = MOMENTUM_SPLIT_LEGS.reduce((t, l) => t + contrib[l.symbol], 0);
      const gross = MOMENTUM_SPLIT_LEGS.reduce((t, l) => t + Math.abs(contrib[l.symbol]), 0);
      if (
        p.pnl !== 0 &&
        gross > 0 &&
        Math.abs(sum) >= 0.2 * gross &&
        Math.sign(sum) === Math.sign(p.pnl)
      ) {
        for (const { symbol } of MOMENTUM_SPLIT_LEGS) {
          out[symbol].push({ pnl: (p.pnl * contrib[symbol]) / sum, ret: ret[symbol] });
        }
        return;
      }
    }
    for (const { symbol } of MOMENTUM_SPLIT_LEGS) {
      out[symbol].push({
        pnl: p.pnl * momentumShareAt(history, symbol, p.date),
        ret: ret[symbol],
      });
    }
  });
  return out;
}

// Builds one leg's own NAV series (starting at 100 on its first day) from the
// per-day attribution, then runs the normal calcs on it, so % returns,
// drawdowns and trailing returns are the leg's own, not the parent's.
function buildMomentumLeg(
  nav: NavPoint[],
  days: MomentumLegDay[],
  history: MomentumSplitHistory,
  symbol: MomentumLegSymbol,
  label: string,
): ClientStrategyBreakdownRow {
  const firstHeld = history.find((h) => h.shares[symbol] > 0)!;
  const start =
    history[0].shares[symbol] > 0 ? 0 : nav.findIndex((p) => isoDay(p.date) >= firstHeld.date);

  const legNav: NavPoint[] = [];
  let level = 100;
  let peak = 100;
  for (let i = Math.max(start, 0); i < nav.length; i++) {
    const prev = level;
    level = prev * (1 + days[i].ret);
    peak = Math.max(peak, level);
    legNav.push({
      date: nav[i].date,
      nav: level,
      prev_nav: prev,
      drawdown: ((level - peak) / peak) * 100,
      pnl: days[i].pnl,
      portfolio_value: 0,
    });
  }

  const monthly = calcMonthlyReturns(legNav);
  return {
    strategy: label,
    monthly,
    yearly: calcYearlyReturns(legNav),
    max_drawdown: calcMaxDrawdown(legNav),
    current_drawdown: calcCurrentDrawdown(legNav),
    since_inception: calcSinceInception(legNav),
    since_inception_pnl: calcSiPnl(legNav),
    trailing_returns: calcTrailingReturns(legNav),
    strategy_breakdown: [],
  };
}

// A client that only ever held one leg has that leg at 100% - it is the
// parent Momentum series, so reuse the parent's own figures unchanged.
function wholeMomentumLeg(
  own: Omit<ResolvedReturns, "strategy_breakdown">,
  label: string,
): ClientStrategyBreakdownRow {
  return { strategy: label, ...own, strategy_breakdown: [] };
}

// Recursively resolves a node's own metrics, then its children's — a node
// without NAV data (and thus no own metrics) is dropped from the breakdown
// entirely, same as its children. Falls back to the bare tag (if any) only
// when the strategy-prefixed tag has no data. `momentumSplit`, when set,
// additionally synthesizes momentum50/momidmtm as two more breakdown
// entries derived from this node's own just-resolved metrics.
//
// since_inception is NAV-based (calcSinceInception), not cash-flow XIRR, so
// — unlike the old XIRR depth gate this function used to carry — every
// node, sleeves included (Gold/PSAR/LONG/.../momentum50/momidmtm), now gets
// a real value instead of null. A sleeve has no deposit of its own to
// attribute an XIRR to, but it has its own NAV series, which is all this
// metric needs.
function resolveNode(
  qcode: string,
  node: ReturnsNode,
  navMap: NavSeriesMap,
): ResolvedReturns | null {
  let nav = navMap.get(`${qcode}|${node.profitTag}`);
  if ((!nav || nav.length === 0) && node.fallbackProfitTag) {
    nav = navMap.get(`${qcode}|${node.fallbackProfitTag}`);
  }
  if (!nav || nav.length === 0) return null;

  const monthly = calcMonthlyReturns(nav);

  const own: Omit<ResolvedReturns, "strategy_breakdown"> = {
    monthly,
    yearly: calcYearlyReturns(nav),
    max_drawdown: calcMaxDrawdown(nav),
    current_drawdown: calcCurrentDrawdown(nav),
    since_inception: calcSinceInception(nav),
    since_inception_pnl: calcSiPnl(nav),
    trailing_returns: calcTrailingReturns(nav),
  };

  const strategy_breakdown: ClientStrategyBreakdownRow[] = [];
  for (const child of node.children) {
    const resolved = resolveNode(qcode, child, navMap);
    if (!resolved) continue;
    strategy_breakdown.push({ strategy: child.label, ...resolved });
  }

  if (node.momentumSplit) {
    const history = node.momentumSplit;
    const held = MOMENTUM_SPLIT_LEGS.filter((l) => history.some((h) => h.shares[l.symbol] > 0));
    if (held.length === 1) {
      strategy_breakdown.push(wholeMomentumLeg(own, held[0].label));
    } else if (held.length > 1) {
      const days = allocateMomentumDays(nav, history);
      for (const leg of held) {
        strategy_breakdown.push(buildMomentumLeg(nav, days[leg.symbol], history, leg.symbol, leg.label));
      }
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

  const navMap = await fetchBulkNavSeries(profitPairs, undefined, undefined, table);

  // A closed strategy's data pipeline can keep writing frozen/zero rows past
  // its real last trading day once another strategy becomes the account's
  // active one — caps every node under that strategy (not just its own
  // total), same as the sleeve rows on Sub-Strategy Performance. See
  // tags.ts's effectiveToForTag for the matching rule; the bare combined
  // tag and any still-active strategy's nodes pass through unchanged.
  const groupByQcode = new Map(groups.map((g) => [g.qcode, g]));
  for (const key of [...navMap.keys()]) {
    const sep = key.indexOf("|");
    const group = groupByQcode.get(key.slice(0, sep));
    if (!group) continue;
    const tag = key.slice(sep + 1);
    const effectiveTo = effectiveToForTag(tag, group.configs, group.isSoloProp);
    if (effectiveTo) navMap.set(key, trimToEffectiveTo(navMap.get(key), effectiveTo)!);
  }

  const rows: ClientMonthlyRow[] = [];
  for (const group of groups) {
    const root = roots.get(group.qcode)!;
    const resolved = resolveNode(group.qcode, root, navMap);
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
