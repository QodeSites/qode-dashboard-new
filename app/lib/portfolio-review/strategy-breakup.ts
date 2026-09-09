import { isActive } from "@/lib/utils";
import { fetchStrategyPairs } from "@/app/lib/portfolio-review/tags";
import { fetchBulkNavSeries } from "@/app/lib/portfolio-review/nav-series";
import {
  fetchNiftyRawSeries,
  computeBenchmarkMetrics,
  toMonthlyReturnMap,
  alignMonthlyReturns,
  calcCaptureRatios,
  calcExtraRatios,
} from "@/app/lib/portfolio-review/benchmark";
import {
  calcMonthlyReturns,
  calcRatios,
  calcSinceInception,
  calcSiPnl,
  calcMaxDrawdown,
  calcCurrentDrawdown,
} from "@/app/lib/portfolio-review/returns";
import { solveXirr, fetchBulkXirrInputs } from "@/app/lib/portfolio-review/xirr";

export interface StrategyBreakupRow {
  qcode: string;
  account_name: string;
  strategy: string;
  inception_date: string;
  since_inception: number | null;
  since_inception_pnl: number | null;
  xirr: number | null;
  benchmark_return: number | null;
  max_drawdown: number | null;
  current_drawdown: number | null;
  upside_capture: number | null;
  downside_capture: number | null;
  sharpe: number | null;
  sortino: number | null;
  calmar: number | null;
  ann_volatility: number | null;
  tracking_error: number | null;
  information_ratio: number | null;
  alpha: number | null;
  beta: number | null;
  end_date: string | null;
}

export interface StrategyBreakupResult {
  start_date: string | null;
  end_date: string;
  clients: StrategyBreakupRow[];
}

export async function computeStrategyBreakup(
  rfr: number,
  end?: Date,
  start?: Date,
): Promise<StrategyBreakupResult> {
  const allPairs = await fetchStrategyPairs("profit_tag_suffix");
  const endDate = end
    ? end.toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];
  const startDate = start ? start.toISOString().split("T")[0] : null;
  const pairs = allPairs.filter((p) => isActive(p.effective_to, endDate));
  if (pairs.length === 0)
    return { start_date: startDate, end_date: endDate, clients: [] };

  const seriesMap = await fetchBulkNavSeries(
    pairs.map((p) => ({ qcode: p.qcode, tag: p.tag })),
    end,
    start,
  );
  const xirrMap = await fetchBulkXirrInputs(
    pairs.map((p) => ({ qcode: p.qcode, tag: p.exposure_tag })),
    end,
  );

  let minStart: Date | null = null;
  let maxEnd: Date | null = null;
  for (const series of seriesMap.values()) {
    if (series.length === 0) continue;
    const s = series[0].date;
    const e = series[series.length - 1].date;
    if (!minStart || s < minStart) minStart = s;
    if (!maxEnd || e > maxEnd) maxEnd = e;
  }
  let niftyRaw: { date: string; nav: number }[] | null = null;
  if (minStart && maxEnd) {
    try {
      niftyRaw = await fetchNiftyRawSeries(minStart, maxEnd);
    } catch {
      niftyRaw = null;
    }
  }

  const rows: StrategyBreakupRow[] = [];
  for (const pair of pairs) {
    const nav = seriesMap.get(`${pair.qcode}|${pair.tag}`);
    if (!nav || nav.length === 0) continue;

    const xirrInputs = xirrMap.get(`${pair.qcode}|${pair.exposure_tag}`);
    const xirr = xirrInputs
      ? solveXirr(xirrInputs.flows, xirrInputs.asOfDate, xirrInputs.finalValue)
      : null;

    const monthly = calcMonthlyReturns(nav);
    const clientStart = nav[0].date;
    const clientEnd = nav[nav.length - 1].date;

    const bmMetrics = niftyRaw
      ? computeBenchmarkMetrics(niftyRaw, clientStart, clientEnd)
      : null;

    let upside_capture: number | null = null;
    let downside_capture: number | null = null;
    let tracking_error: number | null = null;
    let information_ratio: number | null = null;
    let alpha: number | null = null;
    let beta: number | null = null;

    if (bmMetrics) {
      const bmMonthly = toMonthlyReturnMap(bmMetrics.series);
      const { port, bm } = alignMonthlyReturns(monthly, bmMonthly);
      const cap = calcCaptureRatios(port, bm);
      upside_capture = cap.upside_capture;
      downside_capture = cap.downside_capture;
      const extra = calcExtraRatios(port, bm);
      tracking_error = extra.tracking_error;
      information_ratio = extra.information_ratio;
      alpha = extra.alpha;
      beta = extra.beta;
    }

    const ratios = calcRatios(nav, monthly, rfr);

    rows.push({
      qcode: pair.qcode,
      account_name: pair.account_name,
      strategy: pair.strategy,
      inception_date: clientStart.toISOString().split("T")[0],
      since_inception: calcSinceInception(nav),
      since_inception_pnl: calcSiPnl(nav),
      xirr,
      benchmark_return: bmMetrics?.since_inception ?? null,
      max_drawdown: calcMaxDrawdown(nav),
      current_drawdown: calcCurrentDrawdown(nav),
      upside_capture,
      downside_capture,
      sharpe: ratios.sharpe,
      sortino: ratios.sortino,
      calmar: ratios.calmar,
      ann_volatility: ratios.ann_volatility,
      tracking_error,
      information_ratio,
      alpha,
      beta,
      end_date: pair.effective_to,
    });
  }

  return { start_date: startDate, end_date: endDate, clients: rows };
}
