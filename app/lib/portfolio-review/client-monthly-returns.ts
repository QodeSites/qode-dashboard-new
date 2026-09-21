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

const PROP_TABLE = "master_sheet_test" as const;
const MANAGED_TABLE = "bifurcated_master_sheet_test" as const;

export interface ClientStrategyBreakdownRow {
  strategy: string;
  monthly: MonthlyReturn[];
  yearly: YearlyReturn[];
  xirr: number | null;
  max_drawdown: number | null;
  current_drawdown: number | null;
  since_inception_absolute: number | null;
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

export async function computeClientMonthlyReturns(
  accountType: "managed" | "prop" = "managed",
): Promise<ClientMonthlyRow[]> {
  const groups = await fetchClientGroups(accountType);
  if (groups.length === 0) return [];

  const table = accountType === "prop" ? PROP_TABLE : MANAGED_TABLE;

  const combinedPairs = groups.map((g) => {
    const { profitTag, exposureTag } = combinedTags(g);
    return { qcode: g.qcode, profitTag, exposureTag };
  });
  const breakdownPairs = groups
    .filter((g) => g.configs.length > 1)
    .flatMap((g) =>
      g.configs.map((c) => ({
        qcode: g.qcode,
        strategy: c.strategy,
        profitTag: `${c.strategy} ${c.profit_tag_suffix}`,
        exposureTag: `${c.strategy} ${c.exposure_tag_suffix}`,
      })),
    );

  const [combinedSeriesMap, breakdownSeriesMap] = await Promise.all([
    fetchBulkNavSeries(
      combinedPairs.map((p) => ({ qcode: p.qcode, tag: p.profitTag })),
      undefined,
      undefined,
      table,
    ),
    fetchBulkNavSeries(
      breakdownPairs.map((p) => ({ qcode: p.qcode, tag: p.profitTag })),
      undefined,
      undefined,
      table,
    ),
  ]);
  const [combinedXirrMap, breakdownXirrMap] = await Promise.all([
    fetchBulkXirrInputs(
      combinedPairs.map((p) => ({ qcode: p.qcode, tag: p.exposureTag })),
      undefined,
      undefined,
      table,
    ),
    fetchBulkXirrInputs(
      breakdownPairs.map((p) => ({ qcode: p.qcode, tag: p.exposureTag })),
      undefined,
      undefined,
      table,
    ),
  ]);

  const rows: ClientMonthlyRow[] = [];
  for (const group of groups) {
    const { profitTag, exposureTag } = combinedTags(group);
    const nav = combinedSeriesMap.get(`${group.qcode}|${profitTag}`);
    if (!nav || nav.length === 0) continue;

    const xirrInputs = combinedXirrMap.get(`${group.qcode}|${exposureTag}`);
    const monthly = calcMonthlyReturns(nav);
    const isMulti = group.configs.length > 1;

    const strategy_breakdown: ClientStrategyBreakdownRow[] = [];
    if (isMulti) {
      for (const c of group.configs) {
        const pTag = `${c.strategy} ${c.profit_tag_suffix}`;
        const eTag = `${c.strategy} ${c.exposure_tag_suffix}`;
        const sNav = breakdownSeriesMap.get(`${group.qcode}|${pTag}`);
        if (!sNav || sNav.length === 0) continue;
        const sXirrInputs = breakdownXirrMap.get(`${group.qcode}|${eTag}`);
        const sMonthly = calcMonthlyReturns(sNav);
        strategy_breakdown.push({
          strategy: c.strategy,
          monthly: sMonthly,
          yearly: calcYearlyReturns(sMonthly),
          xirr: sXirrInputs
            ? solveXirr(sXirrInputs.flows, sXirrInputs.asOfDate, sXirrInputs.finalValue)
            : null,
          max_drawdown: calcMaxDrawdown(sNav),
          current_drawdown: calcCurrentDrawdown(sNav),
          since_inception_absolute: calcSinceInceptionAbsolute(sNav),
        });
      }
    }

    rows.push({
      qcode: group.qcode,
      account_name: group.account_name,
      is_multi_strategy: isMulti,
      monthly,
      yearly: calcYearlyReturns(monthly),
      xirr: xirrInputs
        ? solveXirr(xirrInputs.flows, xirrInputs.asOfDate, xirrInputs.finalValue)
        : null,
      max_drawdown: calcMaxDrawdown(nav),
      current_drawdown: calcCurrentDrawdown(nav),
      since_inception_absolute: calcSinceInceptionAbsolute(nav),
      strategy_breakdown,
    });
  }

  return rows;
}
