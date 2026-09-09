import { prisma } from "@/lib/prisma";
import { round, isActive } from "@/lib/utils";
import { fetchStrategyPairs } from "@/app/lib/portfolio-review/tags";

export interface AumPoint {
  date: string;
  aum: number;
}

export interface InvestorAum {
  qcode: string;
  account_name: string;
  strategy: string;
  since: string;
  aum: number;
  until: string | null;
}

export interface PortfolioSummaryResult {
  total_investors: number;
  total_aum: number;
  mom: {
    prev_aum: number;
    prev_date: string;
    change_pct: number | null;
  } | null;
  investors: InvestorAum[];
  aum_daily: AumPoint[];
  strategy_aum_daily: Record<string, AumPoint[]>;
}

interface SeriesPoint {
  date: string;
  value: number;
}

function mergeFfillSum(
  seriesList: { series: SeriesPoint[]; until: string | null }[],
  dates: string[],
): AumPoint[] {
  const idx = new Array(seriesList.length).fill(0);
  const last = new Array(seriesList.length).fill(0);
  const out: AumPoint[] = [];

  for (const d of dates) {
    let sum = 0;
    for (let i = 0; i < seriesList.length; i++) {
      const { series, until } = seriesList[i];
      while (idx[i] < series.length && series[idx[i]].date <= d) {
        last[i] = series[idx[i]].value;
        idx[i]++;
      }
      if (!until || d <= until) sum += last[i];
    }
    out.push({ date: d, aum: sum });
  }
  return out;
}

function trimTrailingZeros(series: AumPoint[]): AumPoint[] {
  let end = series.length;
  while (end > 0 && series[end - 1].aum === 0) end--;
  return series.slice(0, end);
}

function trimLeadingZeros(series: AumPoint[]): AumPoint[] {
  let start = 0;
  while (start < series.length && series[start].aum === 0) start++;
  return series.slice(start);
}

function computeMom(
  aumDaily: AumPoint[],
): { prev_aum: number; prev_date: string; change_pct: number | null } | null {
  if (aumDaily.length === 0) return null;
  const latest = aumDaily[aumDaily.length - 1];
  const target = new Date(latest.date);
  target.setUTCMonth(target.getUTCMonth() - 1);
  const targetStr = target.toISOString().split("T")[0];

  let prev: AumPoint | null = null;
  for (const p of aumDaily) {
    if (p.date <= targetStr) prev = p;
    else break;
  }
  if (!prev) return null;

  return {
    prev_aum: prev.aum,
    prev_date: prev.date,
    change_pct:
      prev.aum > 0 ? round((latest.aum - prev.aum) / prev.aum, 4) : null,
  };
}

export async function computePortfolioSummary(): Promise<PortfolioSummaryResult> {
  const pairs = await fetchStrategyPairs("exposure_tag_suffix");
  if (pairs.length === 0) {
    return {
      total_investors: 0,
      total_aum: 0,
      mom: null,
      investors: [],
      aum_daily: [],
      strategy_aum_daily: {},
    };
  }

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT b.qcode, b.system_tag, b.date, b.portfolio_value
     FROM bifurcated_master_sheet_test b
     JOIN unnest($1::text[], $2::text[]) AS v(qcode, tag)
       ON b.qcode = v.qcode AND b.system_tag = v.tag
     WHERE b.portfolio_value IS NOT NULL AND b.portfolio_value > 0
     ORDER BY b.qcode, b.system_tag, b.date ASC`,
    pairs.map((p) => p.qcode),
    pairs.map((p) => p.tag),
  );

  const seriesMap = new Map<string, SeriesPoint[]>();
  for (const row of rows) {
    const key = `${row.qcode}|${row.system_tag}`;
    const d = row.date instanceof Date ? row.date : new Date(row.date);
    if (!seriesMap.has(key)) seriesMap.set(key, []);
    seriesMap.get(key)!.push({
      date: d.toISOString().split("T")[0],
      value: Number(row.portfolio_value) || 0,
    });
  }

  const investors: InvestorAum[] = [];
  const allSeries: { series: SeriesPoint[]; until: string | null }[] = [];
  const strategySeries = new Map<
    string,
    { series: SeriesPoint[]; until: string | null }[]
  >();
  const today = new Date().toISOString().split("T")[0];

  for (const pair of pairs) {
    const series = seriesMap.get(`${pair.qcode}|${pair.tag}`);
    if (!series || series.length === 0) continue;

    investors.push({
      qcode: pair.qcode,
      account_name: pair.account_name,
      strategy: pair.strategy,
      since: series[0].date,
      aum: series[series.length - 1].value,
      until: pair.effective_to,
    });

    const entry = { series, until: pair.effective_to };
    allSeries.push(entry);
    if (!strategySeries.has(pair.strategy))
      strategySeries.set(pair.strategy, []);
    strategySeries.get(pair.strategy)!.push(entry);
  }

  const dateSet = new Set<string>();
  for (const { series } of allSeries)
    for (const p of series) dateSet.add(p.date);
  const dates = [...dateSet].sort();

  const activeInvestors = investors.filter((inv) => isActive(inv.until, today));
  const activeClients = new Set(activeInvestors.map((inv) => inv.qcode));
  const activeStrategies = new Set(activeInvestors.map((inv) => inv.strategy));

  const aum_daily = mergeFfillSum(allSeries, dates);
  const strategy_aum_daily: Record<string, AumPoint[]> = {};
  for (const [strategy, list] of strategySeries) {
    const series = trimLeadingZeros(mergeFfillSum(list, dates));
    strategy_aum_daily[strategy] = activeStrategies.has(strategy)
      ? series
      : trimTrailingZeros(series);
  }

  return {
    total_investors: activeClients.size,
    total_aum: activeInvestors.reduce((s, inv) => s + inv.aum, 0),
    mom: computeMom(aum_daily),
    investors,
    aum_daily,
    strategy_aum_daily,
  };
}
