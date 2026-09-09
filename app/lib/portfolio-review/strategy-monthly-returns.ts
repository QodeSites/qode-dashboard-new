import { fetchStrategyPairs } from "@/app/lib/portfolio-review/tags";
import { fetchBulkNavSeries } from "@/app/lib/portfolio-review/nav-series";
import {
  calcMonthlyReturns,
  calcYearlyReturns,
  calcMaxDrawdown,
  calcCurrentDrawdown,
} from "@/app/lib/portfolio-review/returns";
import type { MonthlyReturn, YearlyReturn } from "@/app/lib/portfolio-review/returns";
import { solveXirr, fetchBulkXirrInputs } from "@/app/lib/portfolio-review/xirr";

export interface StrategyMonthlyRow {
  qcode: string;
  account_name: string;
  strategy: string;
  monthly: MonthlyReturn[];
  yearly: YearlyReturn[];
  xirr: number | null;
  max_drawdown: number | null;
  current_drawdown: number | null;
}

export async function computeStrategyMonthlyReturns(): Promise<
  StrategyMonthlyRow[]
> {
  const pairs = await fetchStrategyPairs("profit_tag_suffix");
  if (pairs.length === 0) return [];

  const seriesMap = await fetchBulkNavSeries(
    pairs.map((p) => ({ qcode: p.qcode, tag: p.tag })),
  );
  const xirrMap = await fetchBulkXirrInputs(
    pairs.map((p) => ({ qcode: p.qcode, tag: p.exposure_tag })),
  );

  const rows: StrategyMonthlyRow[] = [];
  for (const pair of pairs) {
    const nav = seriesMap.get(`${pair.qcode}|${pair.tag}`);
    if (!nav || nav.length === 0) continue;

    const xirrInputs = xirrMap.get(`${pair.qcode}|${pair.exposure_tag}`);
    const monthly = calcMonthlyReturns(nav);
    rows.push({
      qcode: pair.qcode,
      account_name: pair.account_name,
      strategy: pair.strategy,
      monthly,
      yearly: calcYearlyReturns(monthly),
      xirr: xirrInputs
        ? solveXirr(xirrInputs.flows, xirrInputs.asOfDate, xirrInputs.finalValue)
        : null,
      max_drawdown: calcMaxDrawdown(nav),
      current_drawdown: calcCurrentDrawdown(nav),
    });
  }

  return rows;
}
