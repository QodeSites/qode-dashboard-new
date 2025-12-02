// Dashboard Utility Functions

import {
  Stats,
  PmsStats,
  EquityCurvePoint,
  TrailingReturns,
  CombinedTrailing,
} from "./dashboard-types";

// Type Guards
export function isPmsStats(s: Stats | PmsStats): s is PmsStats {
  return "totalPortfolioValue" in s;
}

// Generate Random Fees (temporary mock data)
export const generateRandomFees = (): Stats["fees"] => {
  const fees: Stats["fees"] = {
    '2022': {
      q1: "0",
      q2: "0",
      q3: "41651.49",
      q4: "225408.07",
      total: (0 + 0 + 41651.49 + 225408.07).toFixed(2)
    },
    '2023': {
      q1: "220507.89",
      q2: "222957.98",
      q3: "510644.45",
      q4: "1769040.29",
      total: (220507.89 + 222957.98 + 510644.45 + 1769040.29).toFixed(2)
    },
    '2024': {
      q1: "2090884.88",
      q2: "4034529.06",
      q3: "5497173.86",
      q4: "6711290.47",
      total: (2090884.88 + 4034529.06 + 5497173.86 + 6711290.47).toFixed(2)
    },
    '2025': {
      q1: "9207339.89",
      q2: "8306490.30",
      q3: "4991373.79",
      q4: "0",
      total: (9207339.89 + 8306490.30 + 4991373.79 + 0).toFixed(2)
    }
  };
  return fees;
};

// Convert PmsStats to Stats format
export function convertPmsStatsToStats(pms: PmsStats): Stats {
  const amountDeposited = pms.cashFlows
    .filter(f => f.amount > 0)
    .reduce((s, f) => s + f.amount, 0);

  return {
    amountDeposited: amountDeposited.toFixed(2),
    currentExposure: pms.totalPortfolioValue,
    return: pms.cumulativeReturn,
    totalProfit: pms.totalPnl,
    trailingReturns: pms.trailingReturns,
    benchmarkTrailingReturns: pms.benchmarkTrailingReturns,
    drawdown: pms.maxDrawdown,
    equityCurve: pms.equityCurve,
    drawdownCurve: pms.drawdownCurve,
    quarterlyPnl: Object.fromEntries(
      Object.entries(pms.quarterlyPnl).map(([y, v]) => [
        y,
        { ...v, yearCash: v.yearCash ?? v.cash.total }
      ])
    ),
    monthlyPnl: Object.fromEntries(
      Object.entries(pms.monthlyPnl).map(([y, yr]) => [
        y,
        {
          ...yr,
          months: Object.fromEntries(
            Object.entries(yr.months).map(([m, mv]) => [
              m,
              { ...mv, capitalInOut: mv.capitalInOut ?? "0" }
            ])
          ),
          totalCapitalInOut: yr.totalCapitalInOut ?? 0,
        },
      ])
    ),
    cashFlows: pms.cashFlows ?? [],
    fees: pms.fees || generateRandomFees(),
  };
}

// Normalize to Stats format
export function normalizeToStats(input: Stats | PmsStats): Stats {
  const base = isPmsStats(input) ? convertPmsStatsToStats(input) : input;
  return {
    ...base,
    fees: base.fees || generateRandomFees(),
  };
}

// Filter equity curve by date range
export function filterEquityCurve(
  equityCurve: EquityCurvePoint[],
  startDate: string | null,
  endDate: string | null
): EquityCurvePoint[] {
  if (!startDate || !endDate) return equityCurve;
  const start = new Date(startDate);
  const end = new Date(endDate);
  return equityCurve.filter(e => {
    const d = new Date(e.date);
    return d >= start && d <= end;
  });
}

// Date formatter
export const dateFormatter = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });

// Get last date from equity curve
export function getLastDate(
  equityCurve: EquityCurvePoint[],
  lastUpdated: string | null
): string | null {
  if (equityCurve.length === 0) return lastUpdated || null;
  const latest = [...equityCurve].sort(
    (a, b) => +new Date(b.date) - +new Date(a.date)
  )[0];
  return latest.date;
}

// Safe number sum
export const sumNum = (v: any) => (isNaN(Number(v)) ? 0 : Number(v));

// Merge quarterly data
export function mergeQuarterly(
  acc: Record<string, { q1: number; q2: number; q3: number; q4: number; total: number }>,
  next?: {
    [year: string]: {
      cash: { q1: string; q2: string; q3: string; q4: string; total: string };
    };
  }
) {
  if (!next) return acc;
  for (const year of Object.keys(next)) {
    const c = next[year].cash;
    acc[year] ??= { q1: 0, q2: 0, q3: 0, q4: 0, total: 0 };
    acc[year].q1 += sumNum(c.q1);
    acc[year].q2 += sumNum(c.q2);
    acc[year].q3 += sumNum(c.q3);
    acc[year].q4 += sumNum(c.q4);
    acc[year].total += sumNum(c.total);
  }
  return acc;
}

// Get greeting based on time
export const getGreeting = () => {
  const hours = Number(
    new Intl.DateTimeFormat("en-IN", {
      hour: "2-digit",
      hour12: false,
      timeZone: "Asia/Kolkata"
    }).format(new Date())
  );
  if (hours < 12) return "Good Morning";
  if (hours < 17) return "Good Afternoon";
  return "Good Evening";
};

// Extract benchmark trailing returns from various API response shapes
export function extractBenchmarkTrailing(
  source: any,
  fallbackMeta?: any
): TrailingReturns | null {
  if (!source) return null;
  if (source.benchmarkTrailingReturns) return source.benchmarkTrailingReturns;
  if (source.trailingReturnsBenchmark) return source.trailingReturnsBenchmark;
  if (source.benchmarks?.trailingReturns) return source.benchmarks.trailingReturns;
  if (fallbackMeta?.benchmarkTrailingReturns) return fallbackMeta.benchmarkTrailingReturns;

  const nested =
    source.benchmarks && typeof source.benchmarks === "object"
      ? Object.values(source.benchmarks).find((v: any) => v?.trailingReturns)
      : null;
  if (nested && (nested as any).trailingReturns) return (nested as any).trailingReturns;

  return null;
}

// Combine portfolio and benchmark trailing returns
export function combineTrailing(
  portfolio?: TrailingReturns | null,
  benchmark?: TrailingReturns | null
): CombinedTrailing {
  const horizons: (keyof CombinedTrailing)[] = [
    'fiveDays',
    'tenDays',
    'fifteenDays',
    'oneMonth',
    'threeMonths',
    'sixMonths',
    'oneYear',
    'twoYears',
    'fiveYears',
    'sinceInception',
    'MDD',
    'currentDD',
  ];

  const portfolioHorizons: string[] = [
    '5d',
    '10d',
    '15d',
    '1m',
    '3m',
    '6m',
    '1y',
    '2y',
    '5y',
    'sinceInception',
    'MDD',
    'currentDD',
  ];

  const out: CombinedTrailing = {} as CombinedTrailing;

  for (let i = 0; i < horizons.length; i++) {
    const horizon = horizons[i];
    const portfolioHorizon = portfolioHorizons[i];

    const portfolioValue =
      portfolio && (portfolio as any)[portfolioHorizon] !== undefined
        ? (portfolio as any)[portfolioHorizon]
        : portfolio?.[horizon];

    const benchmarkValue =
      benchmark && benchmark[horizon] !== undefined ? benchmark[horizon] : null;

    // If portfolio doesn't have the value, show "-" for benchmark as well
    const finalBenchmarkValue =
      portfolioValue === null || portfolioValue === undefined || portfolioValue === "-"
        ? "-"
        : benchmarkValue;

    if (portfolioValue !== null || benchmarkValue !== null) {
      out[horizon] = {
        portfolio:
          typeof portfolioValue === 'number'
            ? Number(portfolioValue.toFixed(2))
            : portfolioValue,
        benchmark:
          typeof finalBenchmarkValue === 'number'
            ? Number(finalBenchmarkValue.toFixed(2))
            : finalBenchmarkValue,
      };
    }
  }

  return out;
}
