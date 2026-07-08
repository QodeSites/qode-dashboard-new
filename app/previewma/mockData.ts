// Mock data for the MA Review Dashboard design pass.
// Shapes mirror the real Python output (ma_review/metrics.py, analysis.py)
// so swapping in a real API response later is a drop-in replacement.

export interface StrategyReturnRow {
  strategy: string;
  startDate: string;
  endDate: string;
  sinceInception: number; // decimal, e.g. 0.0456 = +4.56%
  maxDrawdown: number;
  currentDrawdown: number;
}

export interface MonthlyReturn {
  year: number;
  month: string;
  returnPct: number;
}
export interface QuarterlyReturn {
  year: number;
  quarter: string;
  returnPct: number;
}
export interface YearlyReturn {
  year: number;
  returnPct: number;
}

export interface ReturnTableSet {
  strategy: string;
  monthly: MonthlyReturn[];
  quarterly: QuarterlyReturn[];
  yearly: YearlyReturn[];
}

export interface PerformanceRatios {
  strategy: string;
  returnLabel: string; // "Return (Absolute)" | "Annualised Return"
  returnValue: number;
  annualisedVolatility: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  maxDrawdown: number;
  currentDrawdown: number;
  bestMonth: number;
  worstMonth: number;
  avgMonthlyReturn: number;
  winRateMonthly: number;
  monthlyVolatility: number;
  downsideDeviation: number;
}

export interface NavPoint {
  date: string;
  nav: number;
}
export interface DrawdownPoint {
  date: string;
  drawdownPct: number;
}

export interface ClientData {
  id: string;
  name: string;
  profitTag: string;
  startDate: string;
  endDate: string;
  daysHeld: number;
  tagCount: number;
  rowCount: number;
  sinceInceptionReturn: number;
  maxDrawdown: number;
  currentDrawdown: number;
  nifty50SinceInception: number | null;
  strategyReturns: StrategyReturnRow[];
  returnTables: ReturnTableSet[];
  performanceRatios: PerformanceRatios[];
  navSeries: Record<string, NavPoint[]>;
  drawdownSeries: Record<string, DrawdownPoint[]>;
}

const sampleNav = (base: number, len: number, seed: number): NavPoint[] => {
  const points: NavPoint[] = [];
  let v = base;
  for (let i = 0; i < len; i++) {
    v += Math.sin(i / 3 + seed) * 1.2 + 0.15;
    const d = new Date(2026, 4, 19 + i);
    points.push({ date: d.toISOString().slice(0, 10), nav: Math.round(v * 100) / 100 });
  }
  return points;
};

const sampleDrawdown = (nav: NavPoint[]): DrawdownPoint[] => {
  let peak = -Infinity;
  return nav.map((p) => {
    peak = Math.max(peak, p.nav);
    return { date: p.date, drawdownPct: Math.round(((p.nav - peak) / peak) * 10000) / 100 };
  });
};

const strategyList = [
  "QYE++ Zerodha Total Portfolio",
  "QYE++ PSAR",
  "QYE++ NPSAR",
  "QYE++ SPSAR",
  "QYE++ LONG",
  "QYE++ NLONG",
  "QYE++ SLONG",
  "QYE++ Total Portfolio Value",
];

// "Additional System Tags" picker options — mirrors PRIORITY_AGGREGATE
// from ma_review/mastersheet_dashboard.py (aggregate, no client-id suffix).
export const AGGREGATE_TAG_OPTIONS = [
  "QYE++ Total Portfolio Value",
  "QYE+ Total Portfolio Value",
  "QAW++ Zerodha Total Portfolio",
  "QAW+ Zerodha Total Portfolio",
  "QYE++ Zerodha Total Portfolio",
  "QYE+ Zerodha Total Portfolio",
  "QYE++ Total Portfolio Exposure",
  "QAW++ Total Portfolio Exposure",
  "QTF++ Zerodha Total Portfolio",
  "Qode Total Portfolio",
  "Total Portfolio Value",
  "Zerodha Total Portfolio",
  "Total Portfolio Exposure",
  "PSAR",
  "NPSAR",
  "SPSAR",
  "LONG",
  "NLONG",
  "SLONG",
  "Gold Stock Holdings",
  "QTF Stock Holdings",
  "Low Vol Stock Holdings",
  "Momentum Stock Holdings",
  "Stock Holdings",
  "Equity Holdings Tax",
];

// Individual tags carry a trailing numeric client-id suffix in the real app.
export const INDIVIDUAL_TAG_OPTIONS = [
  "QYE++ Total Portfolio Value 1042",
  "QYE++ PSAR 1042",
  "QAW++ Zerodha Total Portfolio 1077",
  "QYE+ Total Portfolio Value 1103",
  "QTF++ Zerodha Total Portfolio 1158",
];

const strategyReturnsTemplate: Omit<StrategyReturnRow, "strategy">[] = [
  { startDate: "19-May-2026", endDate: "19-Jun-2026", sinceInception: 0.0456, maxDrawdown: -0.0535, currentDrawdown: -0.0136 },
  { startDate: "19-May-2026", endDate: "19-Jun-2026", sinceInception: -0.0227, maxDrawdown: -0.0353, currentDrawdown: -0.0353 },
  { startDate: "19-May-2026", endDate: "19-Jun-2026", sinceInception: -0.0199, maxDrawdown: -0.0317, currentDrawdown: -0.0302 },
  { startDate: "19-May-2026", endDate: "19-Jun-2026", sinceInception: -0.0255, maxDrawdown: -0.0403, currentDrawdown: -0.0403 },
  { startDate: "19-May-2026", endDate: "19-Jun-2026", sinceInception: 0.038, maxDrawdown: -0.0219, currentDrawdown: -0.0101 },
  { startDate: "19-May-2026", endDate: "19-Jun-2026", sinceInception: 0.0496, maxDrawdown: -0.0138, currentDrawdown: -0.013 },
  { startDate: "19-May-2026", endDate: "19-Jun-2026", sinceInception: 0.0264, maxDrawdown: -0.03, currentDrawdown: -0.0108 },
  { startDate: "19-May-2026", endDate: "19-Jun-2026", sinceInception: 0.0122, maxDrawdown: -0.0419, currentDrawdown: -0.0044 },
];

const returnTablesTemplate: { monthly: MonthlyReturn[]; quarterly: QuarterlyReturn[]; yearly: YearlyReturn[] }[] = [
  { monthly: [{ year: 2026, month: "May", returnPct: 0.71 }, { year: 2026, month: "June", returnPct: 3.82 }], quarterly: [{ year: 2026, quarter: "Q2", returnPct: 4.56 }], yearly: [{ year: 2026, returnPct: 4.56 }] },
  { monthly: [{ year: 2026, month: "May", returnPct: -0.95 }, { year: 2026, month: "June", returnPct: -1.33 }], quarterly: [{ year: 2026, quarter: "Q2", returnPct: -2.27 }], yearly: [{ year: 2026, returnPct: -2.27 }] },
  { monthly: [{ year: 2026, month: "May", returnPct: -0.82 }, { year: 2026, month: "June", returnPct: -1.18 }], quarterly: [{ year: 2026, quarter: "Q2", returnPct: -1.99 }], yearly: [{ year: 2026, returnPct: -1.99 }] },
  { monthly: [{ year: 2026, month: "May", returnPct: -1.05 }, { year: 2026, month: "June", returnPct: -1.52 }], quarterly: [{ year: 2026, quarter: "Q2", returnPct: -2.55 }], yearly: [{ year: 2026, returnPct: -2.55 }] },
  { monthly: [{ year: 2026, month: "May", returnPct: 1.42 }, { year: 2026, month: "June", returnPct: 2.35 }], quarterly: [{ year: 2026, quarter: "Q2", returnPct: 3.8 }], yearly: [{ year: 2026, returnPct: 3.8 }] },
  { monthly: [{ year: 2026, month: "May", returnPct: 1.07 }, { year: 2026, month: "June", returnPct: 3.85 }], quarterly: [{ year: 2026, quarter: "Q2", returnPct: 4.96 }], yearly: [{ year: 2026, returnPct: 4.96 }] },
  { monthly: [{ year: 2026, month: "May", returnPct: 1.77 }, { year: 2026, month: "June", returnPct: 0.86 }], quarterly: [{ year: 2026, quarter: "Q2", returnPct: 2.64 }], yearly: [{ year: 2026, returnPct: 2.64 }] },
  { monthly: [{ year: 2026, month: "May", returnPct: 1.67 }, { year: 2026, month: "June", returnPct: -0.44 }], quarterly: [{ year: 2026, quarter: "Q2", returnPct: 1.22 }], yearly: [{ year: 2026, returnPct: 1.22 }] },
];

const ratiosTemplate: Omit<PerformanceRatios, "strategy">[] = [
  { returnLabel: "Return (Absolute)", returnValue: 0.0456, annualisedVolatility: 0.246, sharpeRatio: 1.653, sortinoRatio: -0.211, calmarRatio: 0.852, maxDrawdown: -0.0535, currentDrawdown: -0.0136, bestMonth: 0.0382, worstMonth: 0.0071, avgMonthlyReturn: 0.0226, winRateMonthly: 1.0, monthlyVolatility: 0.0761, downsideDeviation: 0.0 },
  { returnLabel: "Return (Absolute)", returnValue: -0.0227, annualisedVolatility: 0.0729, sharpeRatio: -4.666, sortinoRatio: -1.632, calmarRatio: -0.643, maxDrawdown: -0.0353, currentDrawdown: -0.0353, bestMonth: 0.0031, worstMonth: -0.0257, avgMonthlyReturn: -0.0113, winRateMonthly: 0.5, monthlyVolatility: 0.029, downsideDeviation: 0.0185 },
  { returnLabel: "Return (Absolute)", returnValue: -0.0199, annualisedVolatility: 0.0705, sharpeRatio: -4.231, sortinoRatio: -1.618, calmarRatio: -0.626, maxDrawdown: -0.0317, currentDrawdown: -0.0302, bestMonth: 0.0023, worstMonth: -0.0221, avgMonthlyReturn: -0.0099, winRateMonthly: 0.5, monthlyVolatility: 0.0274, downsideDeviation: 0.0172 },
  { returnLabel: "Return (Absolute)", returnValue: -0.0255, annualisedVolatility: 0.0784, sharpeRatio: -4.88, sortinoRatio: -1.48, calmarRatio: -0.633, maxDrawdown: -0.0403, currentDrawdown: -0.0403, bestMonth: 0.0039, worstMonth: -0.0293, avgMonthlyReturn: -0.0127, winRateMonthly: 0.5, monthlyVolatility: 0.0306, downsideDeviation: 0.0198 },
  { returnLabel: "Return (Absolute)", returnValue: 0.038, annualisedVolatility: 0.1293, sharpeRatio: 2.644, sortinoRatio: -0.452, calmarRatio: 1.733, maxDrawdown: -0.0219, currentDrawdown: -0.0101, bestMonth: 0.0235, worstMonth: 0.0142, avgMonthlyReturn: 0.019, winRateMonthly: 1.0, monthlyVolatility: 0.0457, downsideDeviation: 0.0 },
  { returnLabel: "Return (Absolute)", returnValue: 0.0496, annualisedVolatility: 0.1431, sharpeRatio: 3.199, sortinoRatio: -0.262, calmarRatio: 3.586, maxDrawdown: -0.0138, currentDrawdown: -0.013, bestMonth: 0.0385, worstMonth: 0.0107, avgMonthlyReturn: 0.0246, winRateMonthly: 1.0, monthlyVolatility: 0.0497, downsideDeviation: 0.0 },
  { returnLabel: "Return (Absolute)", returnValue: 0.0264, annualisedVolatility: 0.126, sharpeRatio: 1.792, sortinoRatio: -0.481, calmarRatio: 0.881, maxDrawdown: -0.03, currentDrawdown: -0.0108, bestMonth: 0.0177, worstMonth: 0.0086, avgMonthlyReturn: 0.0132, winRateMonthly: 1.0, monthlyVolatility: 0.0407, downsideDeviation: 0.0 },
  { returnLabel: "Return (Absolute)", returnValue: 0.0122, annualisedVolatility: 0.161, sharpeRatio: 0.259, sortinoRatio: -0.528, calmarRatio: 0.292, maxDrawdown: -0.0419, currentDrawdown: -0.0044, bestMonth: 0.0167, worstMonth: -0.0044, avgMonthlyReturn: 0.0061, winRateMonthly: 0.5, monthlyVolatility: 0.0747, downsideDeviation: 0.0166 },
];

function buildClient(id: string, name: string, seedOffset: number): ClientData {
  const navSeries: Record<string, NavPoint[]> = {};
  const drawdownSeries: Record<string, DrawdownPoint[]> = {};
  strategyList.forEach((s, idx) => {
    const nav = sampleNav(100, 16, idx + seedOffset);
    navSeries[s] = nav;
    drawdownSeries[s] = sampleDrawdown(nav);
  });

  return {
    id,
    name,
    profitTag: "QYE++ Total Portfolio Value",
    startDate: "19 May 2026",
    endDate: "19 Jun 2026",
    daysHeld: 31,
    tagCount: 189,
    rowCount: 4237,
    sinceInceptionReturn: 0.0122,
    maxDrawdown: -0.0419,
    currentDrawdown: -0.036,
    nifty50SinceInception: null,
    strategyReturns: strategyList.map((s, i) => ({ strategy: s, ...strategyReturnsTemplate[i] })),
    returnTables: strategyList.map((s, i) => ({ strategy: s, ...returnTablesTemplate[i] })),
    performanceRatios: strategyList.map((s, i) => ({ strategy: s, ...ratiosTemplate[i] })),
    navSeries,
    drawdownSeries,
  };
}

export const MOCK_CLIENTS: ClientData[] = [
  buildClient("anand-damani-qye", "Anand Damani QYE++", 0),
  buildClient("ashika-prop-2-qye", "Ashika Prop 2 QYE++", 1),
  buildClient("anup-ramani-qaw", "Anup Ramani QAW++", 2),
  buildClient("ashika-prop-1-qye", "Ashika Prop 1 QYE++", 3),
  buildClient("ashit-jhaveri-qye", "Ashit Jhaveri QYE+", 4),
  buildClient("ashok-jogani-huf-qaw", "Ashok Jogani HUF QAW+", 5),
];

export const TOTAL_CLIENT_COUNT = 35;

// ─────────────────────────────────────────────────────────────────────────────
// Portfolio Summary tab mock data — shaped to match ma_review/portfolio_summary.py
// ─────────────────────────────────────────────────────────────────────────────

export interface AumMonthRow {
  year: number;
  months: (number | null)[]; // Jan..Dec, null = no data yet
  total: number;
}

export interface StrategyAumSeries {
  strategy: string;
  color: string;
  points: { date: string; aum: number }[];
}

export interface InvestorRow {
  client: string;
  strategy: string;
  since: string;
  aum: number;
  share: number;
}

export const STRATEGY_COLORS: Record<string, string> = {
  "QYE+": "#02422B",
  "QYE++": "#4A9D7A",
  "QAW+": "#DABD38",
  "QAW++": "#E07B39",
};

export const PORTFOLIO_SUMMARY = {
  totalInvestors: 35,
  totalAum: 505, // ₹ Cr
  totalAumDate: "19 Jun 2026",
  momChangePct: 13.7,
  momAum: 504.51,
  momPrevAum: 443.75,
  momDateLabel: "19 Jun 2026",
  momPrevDateLabel: "19 May 2026",

  aumTable: [
    {
      year: 2024,
      months: [null, null, 10.16, 14.73, 25.48, 38.06, 36.93, 37.04, 38.53, 45.25, 57.91, 55.07],
      total: 55.07,
    },
    {
      year: 2025,
      months: [55.87, 56.08, 57.55, 80.1, 89.67, 89.0, 93.28, 90.68, 95.04, 99.8, 124, 169],
      total: 169,
    },
    {
      year: 2026,
      months: [219, 249, 311, 434, 493, 505, null, null, null, null, null, null],
      total: 505,
    },
  ] as AumMonthRow[],

  strategyAumTable: {
    "QYE+": {
      year2024: [null, null, 10.16, 14.73, 25.48, 38.06, 36.93, 37.04, 38.53, 38.69, 50.68, 48.44],
      year2025: [49.26, 50.1, 51.27, 74.57, 83.56, 80.97, 85.33, 82.47, 86.55, 91.64, 111, 142],
      year2026: [140, 149, 166, 184, 164, 166, null, null, null, null, null, null],
      total2024: 48.44,
      total2025: 142,
      total2026: 166,
    },
    "QYE++": {
      year2024: [null, null, null, null, null, null, null, null, null, 6.56, 7.23, 6.63],
      year2025: [6.61, 5.98, 6.28, 5.52, 6.11, 8.02, 7.95, 8.21, 8.48, 8.16, 13.4, 26.92],
      year2026: [67.22, 87.8, 121, 203, 270, 277, null, null, null, null, null, null],
      total2024: 6.63,
      total2025: 26.92,
      total2026: 277,
    },
    "QAW+": {
      year2024: [null, null, null, null, null, null, null, null, null, null, null, null],
      year2025: [null, null, null, null, null, null, null, null, null, null, null, null],
      year2026: [null, null, 4.85, 5.09, 10.22, 10.16, null, null, null, null, null, null],
      total2024: 0,
      total2025: 0,
      total2026: 10.16,
    },
    "QAW++": {
      year2024: [null, null, null, null, null, null, null, null, null, null, null, null],
      year2025: [null, null, null, null, null, null, null, null, null, null, null, null],
      year2026: [11.16, 12.04, 19.19, 41.25, 49.39, 51.1, null, null, null, null, null, null],
      total2024: 0,
      total2025: 0,
      total2026: 51.1,
    },
  },

  strategyAumPie: [
    { strategy: "QYE++", value: 54.9, color: STRATEGY_COLORS["QYE++"] },
    { strategy: "QYE+", value: 33, color: STRATEGY_COLORS["QYE+"] },
    { strategy: "QAW++", value: 10.1, color: STRATEGY_COLORS["QAW++"] },
    { strategy: "QAW+", value: 2.01, color: STRATEGY_COLORS["QAW+"] },
  ],

  investorsDonut: [
    { strategy: "QYE++", count: 20, color: STRATEGY_COLORS["QYE++"] },
    { strategy: "QYE+", count: 6, color: STRATEGY_COLORS["QYE+"] },
    { strategy: "QAW++", count: 7, color: STRATEGY_COLORS["QAW++"] },
    { strategy: "QAW+", count: 2, color: STRATEGY_COLORS["QAW+"] },
  ],

  firstInvestmentByMonth: [
    { month: "Jul 2024", count: 1 },
    { month: "Jan 2025", count: 1 },
    { month: "Jul 2025", count: 0 },
    { month: "Oct 2025", count: 1 },
    { month: "Nov 2025", count: 1 },
    { month: "Dec 2025", count: 2 },
    { month: "Jan 2026", count: 5 },
    { month: "Feb 2026", count: 3 },
    { month: "Mar 2026", count: 4 },
    { month: "Apr 2026", count: 8 },
    { month: "May 2026", count: 9 },
  ],

  investorAumTable: [
    { client: "Sarla Performance Fibers QYE+", strategy: "QYE+", since: "Mar 2024", aum: 139, share: 27.5 },
    { client: "Mangesh Hirve QYE++", strategy: "QYE++", since: "Dec 2025", aum: 54.87, share: 10.9 },
    { client: "Arwani Research Services QYE++", strategy: "QYE++", since: "Jan 2026", aum: 31.29, share: 6.2 },
    { client: "Raj Goshar QYE++", strategy: "QYE++", since: "May 2026", aum: 28.58, share: 5.7 },
    { client: "Radiance FPI QYE++", strategy: "QYE++", since: "Nov 2025", aum: 25.7, share: 5.1 },
    { client: "Binaca Limited QYE++", strategy: "QYE++", since: "May 2026", aum: 20.55, share: 4.1 },
    { client: "Aurus Fund QYE++", strategy: "QYE++", since: "Apr 2026", aum: 20.14, share: 4.0 },
    { client: "Satidham Industries QAW++", strategy: "QAW++", since: "Jan 2026", aum: 11.73, share: 2.3 },
    { client: "Dinesh Goel QYE++", strategy: "QYE++", since: "Apr 2026", aum: 10.31, share: 2.0 },
    { client: "Arwani Research Services QAW++", strategy: "QAW++", since: "Mar 2026", aum: 10.28, share: 2.0 },
    { client: "Deepti Parikh QYE++", strategy: "QYE++", since: "Oct 2024", aum: 10.2, share: 2.0 },
    { client: "Anup Ramani QAW++", strategy: "QAW++", since: "Apr 2026", aum: 10.09, share: 2.0 },
    { client: "Karna Stock Broking QYE++", strategy: "QYE++", since: "Apr 2026", aum: 9.9, share: 2.0 },
    { client: "Ashwin Agarwal QYE++", strategy: "QYE++", since: "Feb 2026", aum: 8.16, share: 1.6 },
    { client: "Bakul Shah QYE+", strategy: "QYE+", since: "May 2026", aum: 7.78, share: 1.5 },
    { client: "Deepali Shukla QYE++", strategy: "QYE++", since: "Apr 2026", aum: 7.65, share: 1.5 },
    { client: "Dinesh Goel QAW++", strategy: "QAW++", since: "Jan 2026", aum: 7.23, share: 1.4 },
    { client: "Ashit Jhaveri QYE+", strategy: "QYE+", since: "Feb 2026", aum: 6.49, share: 1.3 },
    { client: "Shilpa Poddar QYE++", strategy: "QYE++", since: "Feb 2026", aum: 6.28, share: 1.2 },
    { client: "Vikram Trading Company QYE++", strategy: "QYE++", since: "Jan 2026", aum: 5.92, share: 1.2 },
    { client: "Bharat Shah QYE+", strategy: "QYE+", since: "Oct 2025", aum: 5.78, share: 1.1 },
    { client: "Suresh Somani QYE++", strategy: "QYE++", since: "Apr 2026", aum: 5.72, share: 1.1 },
    { client: "Anand Damani QYE++", strategy: "QYE++", since: "May 2026", aum: 5.61, share: 1.1 },
    { client: "Neha Ramani QAW++", strategy: "QAW++", since: "Apr 2026", aum: 5.54, share: 1.1 },
    { client: "GRD QYE++", strategy: "QYE++", since: "Mar 2026", aum: 5.38, share: 1.1 },
    { client: "Ashika Prop 2 QYE++", strategy: "QYE++", since: "Mar 2026", aum: 5.24, share: 1.0 },
    { client: "Ssuneet Kabra QYE++", strategy: "QYE++", since: "May 2026", aum: 5.19, share: 1.0 },
    { client: "Ashika Prop 1 QYE++", strategy: "QYE++", since: "Jan 2026", aum: 5.16, share: 1.0 },
    { client: "SSRG Advisory LLP QAW+", strategy: "QAW+", since: "Mar 2026", aum: 5.15, share: 1.0 },
    { client: "Ashok Jogani HUF QAW+", strategy: "QAW+", since: "May 2026", aum: 5.01, share: 1.0 },
    { client: "Winro Commercial QYE++", strategy: "QYE++", since: "Apr 2026", aum: 5.0, share: 1.0 },
    { client: "Jona Fashions & Lifestyle LLP QAW++", strategy: "QAW++", since: "May 2026", aum: 4.95, share: 1.0 },
    { client: "Sakshi Maheshwari QYE+", strategy: "QYE+", since: "Dec 2025", aum: 3.86, share: 0.8 },
    { client: "Kanu Doshi QYE+", strategy: "QYE+", since: "May 2026", aum: 3.86, share: 0.8 },
    { client: "Ashwin Agarwal QAW++", strategy: "QAW++", since: "May 2026", aum: 1.27, share: 0.3 },
  ] as InvestorRow[],
};

export const TOP_TABS = [
  { key: "client-dashboards", label: "Client Dashboards", icon: "user" },
  { key: "comparison", label: "Comparison", icon: "trending", },
  { key: "portfolio-summary", label: "Portfolio Summary", icon: "pin" },
  { key: "strategy-breakup", label: "Strategy-wise Client Breakup", icon: "file" },
  { key: "account-value", label: "Account Value Breakup", icon: "briefcase" },
  { key: "sub-strategy", label: "Sub-Strategy Performance", icon: "bar-chart" },
  { key: "strategy-monthly", label: "Strategy-wise Monthly Returns", icon: "trending" },
] as const;

export type TopTabKey = (typeof TOP_TABS)[number]["key"];