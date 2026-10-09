import { fetchStrategyPairs } from "@/app/lib/portfolio-review/tags";
import { fetchBulkNavSeries } from "@/app/lib/portfolio-review/nav-series";
import {
  calcMonthlyReturns,
  calcYearlyReturns,
  calcMaxDrawdown,
  calcCurrentDrawdown,
  calcSinceInception,
  calcSiPnl,
} from "@/app/lib/portfolio-review/returns";
import type { MonthlyReturn, YearlyReturn } from "@/app/lib/portfolio-review/returns";

export interface StrategyMonthlyRow {
  qcode: string;
  account_name: string;
  strategy: string;
  monthly: MonthlyReturn[];
  yearly: YearlyReturn[];
  // Blended: absolute <1yr tenure, CAGR >=1yr — no separate XIRR field.
  since_inception: number | null;
  since_inception_pnl: number | null;
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

  const rows: StrategyMonthlyRow[] = [];
  for (const pair of pairs) {
    const nav = seriesMap.get(`${pair.qcode}|${pair.tag}`);
    if (!nav || nav.length === 0) continue;

    const monthly = calcMonthlyReturns(nav);
    rows.push({
      qcode: pair.qcode,
      account_name: pair.account_name,
      strategy: pair.strategy,
      monthly,
      yearly: calcYearlyReturns(monthly),
      since_inception: calcSinceInception(nav),
      since_inception_pnl: calcSiPnl(nav),
      max_drawdown: calcMaxDrawdown(nav),
      current_drawdown: calcCurrentDrawdown(nav),
    });
  }

  return rows;
}
