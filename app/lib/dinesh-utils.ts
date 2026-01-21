import { NextResponse } from "next/server";

interface CashFlow {
  date: string;
  amount: number;
  dividend: number;
}

interface QuarterlyPnL {
  [year: string]: {
    percent: { q1: string; q2: string; q3: string; q4: string; total: string };
    cash: { q1: string; q2: string; q3: string; q4: string; total: string };
    yearCash: string;
  };
}

interface MonthlyPnL {
  [year: string]: {
    months: { [month: string]: { percent: string; cash: string; capitalInOut: string } };
    totalPercent: number;
    totalCash: number;
    totalCapitalInOut: number;
  };
}

interface PortfolioData {
  amountDeposited: string;
  currentExposure: string;
  return: string;
  totalProfit: string;
  trailingReturns: Record<string, number | null | string>;
  drawdown: string;
  maxDrawdown: string;
  equityCurve: { date: string; nav: number }[];
  drawdownCurve: { date: string; drawdown: number }[];
  quarterlyPnl: QuarterlyPnL;
  monthlyPnl: MonthlyPnL;
  cashFlows: CashFlow[];
  strategyName: string;
}

interface Metadata {
  icode: string;
  accountCount: number;
  lastUpdated: string;
  filtersApplied: {
    accountType: string | null;
    broker: string | null;
    startDate: string | null;
    endDate: string | null;
  };
  inceptionDate: string;
  dataAsOfDate: string;
  strategyName: string;
  isActive: boolean;
}

interface PortfolioResponse {
  data: PortfolioData;
  metadata: Metadata;
}

interface PortfolioConfig {
  current: string;
  metrics: string;
  nav: string;
  isActive: boolean;
}

const PORTFOLIO_MAPPING: Record<string, Record<string, PortfolioConfig>> = {
  AC9: {
    "Scheme QTF": {
      current: "QTF Total Portfolio Value",
      metrics: "QTF Total Portfolio Value",
      nav: "QTF Total Portfolio Value",
      isActive: false,
    },
  },
};

export class PortfolioApi {
  private static readonly DINESH_SYSTEM_TAGS: Record<string, string> = {
    "Scheme QTF": "QTF Total Portfolio Value",
  };

  private static DINESH_HARDCODED_DATA: Record<string, PortfolioData & { metadata: Metadata }> = {
    "Scheme QTF": {
      data: {
        amountDeposited: "0.00",
        currentExposure: "0.00",
        return: "6.25",
        totalProfit: "3255382.55",
        trailingReturns: {
          "5d": 1.29,
          "10d": 1.23,
          "15d": 1.36,
          "1m": 0.44,
          "3m": 2.88,
          "6m": null,
          "1y": null,
          "2y": null,
          "5y": null,
          sinceInception: 6.25,
          MDD: -1.72,
          currentDD: 0.00,
        },
        drawdown: "0.00",
        maxDrawdown: "-1.72",
        equityCurve: [
          { date: "2025-08-26", nav: 100.20 },
          { date: "2025-08-28", nav: 101.82 },
          { date: "2025-08-29", nav: 101.95 },
          { date: "2025-09-01", nav: 101.27 },
          { date: "2025-09-02", nav: 101.75 },
          { date: "2025-09-03", nav: 101.89 },
          { date: "2025-09-04", nav: 102.68 },
          { date: "2025-09-05", nav: 101.96 },
          { date: "2025-09-08", nav: 101.94 },
          { date: "2025-09-09", nav: 102.00 },
          { date: "2025-09-10", nav: 102.16 },
          { date: "2025-09-11", nav: 102.20 },
          { date: "2025-09-12", nav: 102.31 },
          { date: "2025-09-15", nav: 102.32 },
          { date: "2025-09-16", nav: 102.50 },
          { date: "2025-09-17", nav: 102.86 },
          { date: "2025-09-18", nav: 102.70 },
          { date: "2025-09-19", nav: 102.58 },
          { date: "2025-09-22", nav: 102.79 },
          { date: "2025-09-23", nav: 102.35 },
          { date: "2025-09-24", nav: 102.40 },
          { date: "2025-09-25", nav: 103.13 },
          { date: "2025-09-26", nav: 104.59 },
          { date: "2025-09-29", nav: 103.80 },
          { date: "2025-09-30", nav: 103.71 },
          { date: "2025-10-01", nav: 103.83 },
          { date: "2025-10-03", nav: 103.67 },
          { date: "2025-10-06", nav: 103.78 },
          { date: "2025-10-07", nav: 103.53 },
          { date: "2025-10-08", nav: 103.08 },
          { date: "2025-10-09", nav: 103.15 },
          { date: "2025-10-10", nav: 103.28 },
          { date: "2025-10-13", nav: 103.15 },
          { date: "2025-10-14", nav: 103.01 },
          { date: "2025-10-15", nav: 102.79 },
          { date: "2025-10-16", nav: 103.74 },
          { date: "2025-10-17", nav: 103.39 },
          { date: "2025-10-20", nav: 103.89 },
          { date: "2025-10-23", nav: 104.12 },
          { date: "2025-10-24", nav: 104.11 },
          { date: "2025-10-27", nav: 103.42 },
          { date: "2025-10-28", nav: 102.93 },
          { date: "2025-10-29", nav: 103.09 },
          { date: "2025-10-30", nav: 102.93 },
          { date: "2025-10-31", nav: 103.08 },
          { date: "2025-11-03", nav: 103.54 },
          { date: "2025-11-04", nav: 103.83 },
          { date: "2025-11-06", nav: 103.54 },
          { date: "2025-11-07", nav: 103.80 },
          { date: "2025-11-10", nav: 103.79 },
          { date: "2025-11-11", nav: 103.77 },
          { date: "2025-11-12", nav: 104.05 },
          { date: "2025-11-13", nav: 103.95 },
          { date: "2025-11-14", nav: 103.96 },
          { date: "2025-11-17", nav: 104.20 },
          { date: "2025-11-18", nav: 104.00 },
          { date: "2025-11-19", nav: 104.16 },
          { date: "2025-11-20", nav: 104.40 },
          { date: "2025-11-21", nav: 103.97 },
          { date: "2025-11-24", nav: 104.06 },
          { date: "2025-11-25", nav: 104.47 },
          { date: "2025-11-26", nav: 103.99 },
          { date: "2025-11-27", nav: 104.10 },
          { date: "2025-11-28", nav: 104.12 },
          { date: "2025-12-01", nav: 103.86 },
          { date: "2025-12-02", nav: 104.14 },
          { date: "2025-12-03", nav: 104.33 },
          { date: "2025-12-04", nav: 104.02 },
          { date: "2025-12-05", nav: 103.99 },
          { date: "2025-12-08", nav: 104.20 },
          { date: "2025-12-09", nav: 105.66 },
          { date: "2025-12-10", nav: 105.78 },
          { date: "2025-12-11", nav: 105.28 },
          { date: "2025-12-12", nav: 105.30 },
          { date: "2025-12-15", nav: 105.26 },
          { date: "2025-12-16", nav: 105.22 },
          { date: "2025-12-17", nav: 105.34 },
          { date: "2025-12-18", nav: 105.12 },
          { date: "2025-12-19", nav: 104.63 },
          { date: "2025-12-22", nav: 104.77 },
          { date: "2025-12-23", nav: 104.77 },
          { date: "2025-12-24", nav: 104.82 },
          { date: "2025-12-26", nav: 104.85 },
          { date: "2025-12-29", nav: 104.88 },
          { date: "2025-12-30", nav: 104.96 },
          { date: "2025-12-31", nav: 104.71 },
          { date: "2026-01-01", nav: 104.75 },
          { date: "2026-01-02", nav: 104.90 },
          { date: "2026-01-05", nav: 104.89 },
          { date: "2026-01-06", nav: 104.94 },
          { date: "2026-01-07", nav: 104.99 },
          { date: "2026-01-08", nav: 105.77 },
          { date: "2026-01-09", nav: 106.25 },
        ],
        drawdownCurve: [
          { date: "2025-08-26", drawdown: 0.00 },
          { date: "2025-08-28", drawdown: 0.00 },
          { date: "2025-08-29", drawdown: 0.00 },
          { date: "2025-09-01", drawdown: -0.67 },
          { date: "2025-09-02", drawdown: -0.20 },
          { date: "2025-09-03", drawdown: -0.06 },
          { date: "2025-09-04", drawdown: 0.00 },
          { date: "2025-09-05", drawdown: -0.70 },
          { date: "2025-09-08", drawdown: -0.72 },
          { date: "2025-09-09", drawdown: -0.66 },
          { date: "2025-09-10", drawdown: -0.51 },
          { date: "2025-09-11", drawdown: -0.47 },
          { date: "2025-09-12", drawdown: -0.36 },
          { date: "2025-09-15", drawdown: -0.35 },
          { date: "2025-09-16", drawdown: -0.18 },
          { date: "2025-09-17", drawdown: 0.00 },
          { date: "2025-09-18", drawdown: -0.16 },
          { date: "2025-09-19", drawdown: -0.27 },
          { date: "2025-09-22", drawdown: -0.07 },
          { date: "2025-09-23", drawdown: -0.50 },
          { date: "2025-09-24", drawdown: -0.45 },
          { date: "2025-09-25", drawdown: 0.00 },
          { date: "2025-09-26", drawdown: 0.00 },
          { date: "2025-09-29", drawdown: -0.76 },
          { date: "2025-09-30", drawdown: -0.84 },
          { date: "2025-10-01", drawdown: -0.73 },
          { date: "2025-10-03", drawdown: -0.88 },
          { date: "2025-10-06", drawdown: -0.77 },
          { date: "2025-10-07", drawdown: -1.01 },
          { date: "2025-10-08", drawdown: -1.44 },
          { date: "2025-10-09", drawdown: -1.38 },
          { date: "2025-10-10", drawdown: -1.25 },
          { date: "2025-10-13", drawdown: -1.38 },
          { date: "2025-10-14", drawdown: -1.51 },
          { date: "2025-10-15", drawdown: -1.72 },
          { date: "2025-10-16", drawdown: -0.81 },
          { date: "2025-10-17", drawdown: -1.15 },
          { date: "2025-10-20", drawdown: -0.67 },
          { date: "2025-10-23", drawdown: -0.45 },
          { date: "2025-10-24", drawdown: -0.46 },
          { date: "2025-10-27", drawdown: -1.12 },
          { date: "2025-10-28", drawdown: -1.59 },
          { date: "2025-10-29", drawdown: -1.43 },
          { date: "2025-10-30", drawdown: -1.59 },
          { date: "2025-10-31", drawdown: -1.44 },
          { date: "2025-11-03", drawdown: -1.00 },
          { date: "2025-11-04", drawdown: -0.73 },
          { date: "2025-11-06", drawdown: -1.00 },
          { date: "2025-11-07", drawdown: -0.76 },
          { date: "2025-11-10", drawdown: -0.76 },
          { date: "2025-11-11", drawdown: -0.78 },
          { date: "2025-11-12", drawdown: -0.52 },
          { date: "2025-11-13", drawdown: -0.61 },
          { date: "2025-11-14", drawdown: -0.60 },
          { date: "2025-11-17", drawdown: -0.37 },
          { date: "2025-11-18", drawdown: -0.56 },
          { date: "2025-11-19", drawdown: -0.41 },
          { date: "2025-11-20", drawdown: -0.18 },
          { date: "2025-11-21", drawdown: -0.59 },
          { date: "2025-11-24", drawdown: -0.51 },
          { date: "2025-11-25", drawdown: -0.11 },
          { date: "2025-11-26", drawdown: -0.57 },
          { date: "2025-11-27", drawdown: -0.47 },
          { date: "2025-11-28", drawdown: -0.45 },
          { date: "2025-12-01", drawdown: -0.70 },
          { date: "2025-12-02", drawdown: -0.43 },
          { date: "2025-12-03", drawdown: -0.25 },
          { date: "2025-12-04", drawdown: -0.54 },
          { date: "2025-12-05", drawdown: -0.57 },
          { date: "2025-12-08", drawdown: -0.37 },
          { date: "2025-12-09", drawdown: 0.00 },
          { date: "2025-12-10", drawdown: 0.00 },
          { date: "2025-12-11", drawdown: -0.47 },
          { date: "2025-12-12", drawdown: -0.45 },
          { date: "2025-12-15", drawdown: -0.49 },
          { date: "2025-12-16", drawdown: -0.53 },
          { date: "2025-12-17", drawdown: -0.42 },
          { date: "2025-12-18", drawdown: -0.62 },
          { date: "2025-12-19", drawdown: -1.09 },
          { date: "2025-12-22", drawdown: -0.95 },
          { date: "2025-12-23", drawdown: -0.95 },
          { date: "2025-12-24", drawdown: -0.91 },
          { date: "2025-12-26", drawdown: -0.88 },
          { date: "2025-12-29", drawdown: -0.85 },
          { date: "2025-12-30", drawdown: -0.78 },
          { date: "2025-12-31", drawdown: -1.01 },
          { date: "2026-01-01", drawdown: -0.97 },
          { date: "2026-01-02", drawdown: -0.83 },
          { date: "2026-01-05", drawdown: -0.84 },
          { date: "2026-01-06", drawdown: -0.79 },
          { date: "2026-01-07", drawdown: -0.75 },
          { date: "2026-01-08", drawdown: -0.01 },
          { date: "2026-01-09", drawdown: 0.00 },
        ],
        quarterlyPnl: {
          "2025": {
            percent: { q1: "0", q2: "3.71", q3: "0.96", q4: "0", total: "4.67" },
            cash: { q1: "0", q2: "1884297.79", q3: "541294.31", q4: "0", total: "2425592.10" },
            yearCash: "2425592.10",
          },
          "2026": {
            percent: { q1: "0", q2: "0", q3: "0", q4: "1.47", total: "1.47" },
            cash: { q1: "0", q2: "0", q3: "0", q4: "829790.01", total: "829790.01" },
            yearCash: "829790.01",
          },
        },
        monthlyPnl: {
          "2025": {
            months: {
              January: { percent: "-", cash: "-", capitalInOut: "-" },
              February: { percent: "-", cash: "-", capitalInOut: "-" },
              March: { percent: "-", cash: "-", capitalInOut: "-" },
              April: { percent: "-", cash: "-", capitalInOut: "-" },
              May: { percent: "-", cash: "-", capitalInOut: "-" },
              June: { percent: "-", cash: "-", capitalInOut: "-" },
              July: { percent: "-", cash: "-", capitalInOut: "-" },
              August: { percent: "1.95", cash: "975485.98", capitalInOut: "5646309.10" },
              September: { percent: "1.73", cash: "908811.81", capitalInOut: "-711081.80" },
              October: { percent: "-0.61", cash: "-321654.44", capitalInOut: "668081.60" },
              November: { percent: "1.01", cash: "551995.89", capitalInOut: "-720002.73" },
              December: { percent: "0.57", cash: "310952.86", capitalInOut: "-331241.06" },
            },
            totalPercent: 4.64,
            totalCash: 2425592.10,
            totalCapitalInOut: 4552065.11,
          },
          "2026": {
            months: {
              January: { percent: "1.47", cash: "829790.01", capitalInOut: "-196688.99" },
              February: { percent: "-", cash: "-", capitalInOut: "-" },
              March: { percent: "-", cash: "-", capitalInOut: "-" },
              April: { percent: "-", cash: "-", capitalInOut: "-" },
              May: { percent: "-", cash: "-", capitalInOut: "-" },
              June: { percent: "-", cash: "-", capitalInOut: "-" },
              July: { percent: "-", cash: "-", capitalInOut: "-" },
              August: { percent: "-", cash: "-", capitalInOut: "-" },
              September: { percent: "-", cash: "-", capitalInOut: "-" },
              October: { percent: "-", cash: "-", capitalInOut: "-" },
              November: { percent: "-", cash: "-", capitalInOut: "-" },
              December: { percent: "-", cash: "-", capitalInOut: "-" },
            },
            totalPercent: 1.47,
            totalCash: 829790.01,
            totalCapitalInOut: -196688.99,
          },
        },
        cashFlows: [
          { date: "2025-08-26", amount: 49999904.70, dividend: 0 },
          { date: "2026-01-09", amount: -56805342.00, dividend: 0 },
        ],
        strategyName: "Scheme QTF",
      },
      metadata: {
        icode: "Scheme QTF",
        accountCount: 1,
        lastUpdated: "2026-01-09T00:00:00.000Z",
        filtersApplied: { accountType: null, broker: null, startDate: null, endDate: null },
        inceptionDate: "2025-08-26",
        dataAsOfDate: "2026-01-09",
        strategyName: "Scheme QTF",
        isActive: false,
      },
    },
  };

  private static getPortfolioNames(accountCode: string, scheme: string): PortfolioConfig {
    return PORTFOLIO_MAPPING[accountCode]?.[scheme] || {
      current: "",
      metrics: "",
      nav: "",
      isActive: false,
    };
  }

  public static async GET(request: Request): Promise<NextResponse> {
    const accountCode = "AC9";

    try {
      const results: Record<string, PortfolioResponse> = {};
      const url = new URL(request.url);
      const qcode = url.searchParams.get("qcode") || "QAC00053";

      const allSchemes = Object.keys(PORTFOLIO_MAPPING[accountCode]);
      const schemes = ["Scheme QTF", ...allSchemes.filter(s => s !== "Scheme QTF")];

      for (const scheme of schemes) {
        const portfolioNames = PortfolioApi.getPortfolioNames(accountCode, scheme);
        const hardcodedData = PortfolioApi.DINESH_HARDCODED_DATA[scheme];

        if (hardcodedData) {
          results[scheme] = {
            data: hardcodedData.data,
            metadata: {
              ...hardcodedData.metadata,
              isActive: portfolioNames.isActive,
            },
          };
        }
      }

      return NextResponse.json(results, { status: 200 });
    } catch (error) {
      console.error("Dinesh Portfolio API Error:", error);
      return NextResponse.json(
        {
          error: "Internal server error",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  }
}
