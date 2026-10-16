import { prisma } from "@/lib/prisma";
import { fetchBulkNavSeries } from "@/app/lib/portfolio-review/nav-series";
import { trimToEffectiveTo } from "@/app/lib/portfolio-review/tags";
import {
  calcMonthlyReturns,
  calcYearlyReturns,
  calcMaxDrawdown,
  calcCurrentDrawdown,
  calcSinceInception,
  calcSiPnl,
} from "@/app/lib/portfolio-review/returns";
import type {
  SubStrategyRow,
  SubStrategyPerformanceResult,
  DailyPnlSelection,
  DailyPnlSeries,
} from "@/app/lib/portfolio-review/sub-strategy-performance";

const PROP_TABLE = "master_sheet_test" as const;
const PROP_CATALOG_PARENT = "prop_sub_strategy_sections";

// Prop tags are always bare — no strategy prefix, unlike Managed's
// "{strategy} {tag}" convention (see the tag-audit that confirmed this:
// zero Prop accounts have any prefixed tag anywhere). So there is no
// bare/prefixed fallback logic here at all, unlike the Managed path.

interface PropPair {
  qcode: string;
  account_name: string;
  exposure_tag_suffix: string;
  profit_tag_suffix: string;
  effective_to: Date | null;
}

export interface PropCatalogLeaf {
  label: string;
  tag_suffix: string;
}

async function fetchPropPairs(): Promise<PropPair[]> {
  return prisma.client_strategy_configs.findMany({
    where: { strategy: "Prop" },
    select: {
      qcode: true,
      account_name: true,
      exposure_tag_suffix: true,
      profit_tag_suffix: true,
      effective_to: true,
    },
  });
}

export async function fetchPropCatalog(): Promise<PropCatalogLeaf[]> {
  const rows = await prisma.config_catalog.findMany({
    where: { parent_key: PROP_CATALOG_PARENT, tag_suffix: { not: null } },
    select: { label: true, tag_suffix: true },
  });
  // tag_suffix is guaranteed non-null by the where clause; narrow for TS.
  return rows.map((r) => ({ label: r.label, tag_suffix: r.tag_suffix as string }));
}

export async function computeSubStrategyPerformanceProp(
  end?: Date,
  start?: Date,
): Promise<SubStrategyPerformanceResult> {
  const endDate = end
    ? end.toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];
  const startDate = start ? start.toISOString().split("T")[0] : null;

  const [pairs, leaves] = await Promise.all([fetchPropPairs(), fetchPropCatalog()]);
  if (pairs.length === 0 || leaves.length === 0)
    return { start_date: startDate, end_date: endDate, rows: [] };

  const queries: { qcode: string; tag: string }[] = [];
  for (const pair of pairs) {
    // Whole-account profit-tag NAV — feeds total_since_inception below, same
    // convention as the Managed path (see sub-strategy-performance.ts).
    queries.push({ qcode: pair.qcode, tag: pair.profit_tag_suffix });
    for (const leaf of leaves) {
      queries.push({ qcode: pair.qcode, tag: leaf.tag_suffix });
    }
  }

  const seriesMap = await fetchBulkNavSeries(queries, end, start, PROP_TABLE);

  const rows: SubStrategyRow[] = [];
  for (const pair of pairs) {
    // Capped to the pair's own effective_to — a closed Prop account can keep
    // getting frozen/zero rows written past its real last trading day (see
    // tags.ts's effectiveToForTag).
    const totalNav = trimToEffectiveTo(
      seriesMap.get(`${pair.qcode}|${pair.profit_tag_suffix}`),
      pair.effective_to,
    );
    const total_since_inception =
      totalNav && totalNav.length > 0 ? calcSinceInception(totalNav) : null;

    for (const leaf of leaves) {
      const nav = trimToEffectiveTo(
        seriesMap.get(`${pair.qcode}|${leaf.tag_suffix}`),
        pair.effective_to,
      );
      if (!nav || nav.length === 0) continue; // presence check — no ratio system involved

      const monthly = calcMonthlyReturns(nav);
      rows.push({
        section: leaf.label,
        section_family: leaf.tag_suffix,
        section_value: null,
        is_exception: false, // Prop has no tiers to deviate from
        standard_value: null,
        qcode: pair.qcode,
        account_name: pair.account_name,
        strategy: "Prop",
        monthly,
        yearly: calcYearlyReturns(nav),
        total_since_inception,
        max_drawdown: calcMaxDrawdown(nav),
        current_drawdown: calcCurrentDrawdown(nav),
        since_inception: calcSinceInception(nav),
        since_inception_pnl: calcSiPnl(nav),
      });
    }
  }

  return { start_date: startDate, end_date: endDate, rows };
}

function calcDailyReturns(nav: { date: Date; nav: number; prev_nav: number | null; pnl: number }[]) {
  return nav.map((p) => ({
    date: p.date.toISOString().split("T")[0],
    return_pct:
      p.prev_nav != null && p.prev_nav > 0
        ? parseFloat(((p.nav / p.prev_nav - 1) * 100).toFixed(2))
        : null,
    pnl_inr: parseFloat(p.pnl.toFixed(2)),
  }));
}

export async function computeSubStrategyDailyPnlProp(
  selections: DailyPnlSelection[],
  sections: string[],
  end?: Date,
  start?: Date,
): Promise<DailyPnlSeries[]> {
  const wantedSections = new Set(sections);
  if (wantedSections.size === 0) return [];

  const [allPairs, allLeaves] = await Promise.all([fetchPropPairs(), fetchPropCatalog()]);
  const pairMap = new Map(allPairs.map((p) => [p.qcode, p]));

  const wantedQcodes = new Set(
    selections.filter((s) => s.strategy === "Prop").map((s) => s.qcode),
  );
  const pairs = [...wantedQcodes]
    .map((q) => pairMap.get(q))
    .filter((p): p is PropPair => p != null);
  const leaves = allLeaves.filter((l) => wantedSections.has(l.tag_suffix));
  if (pairs.length === 0 || leaves.length === 0) return [];

  const queries: { qcode: string; tag: string }[] = [];
  for (const pair of pairs) {
    for (const leaf of leaves) {
      queries.push({ qcode: pair.qcode, tag: leaf.tag_suffix });
    }
  }

  const seriesMap = await fetchBulkNavSeries(queries, end, start, PROP_TABLE);

  const result: DailyPnlSeries[] = [];
  for (const pair of pairs) {
    for (const leaf of leaves) {
      const nav = seriesMap.get(`${pair.qcode}|${leaf.tag_suffix}`);
      if (!nav || nav.length === 0) continue;

      result.push({
        qcode: pair.qcode,
        account_name: pair.account_name,
        strategy: "Prop",
        section: leaf.label,
        points: calcDailyReturns(nav),
      });
    }
  }
  return result;
}
