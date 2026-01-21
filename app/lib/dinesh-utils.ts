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
      current: "QTF Zerodha Total Portfolio",
      metrics: "QTF Zerodha Total Portfolio",
      nav: "QTF Zerodha Total Portfolio",
      isActive: false,
    },
  },
};

export class PortfolioApi {
  private static readonly DINESH_SYSTEM_TAGS: Record<string, string> = {
    "Scheme QTF": "QTF Zerodha Total Portfolio",
  };

  private static DINESH_HARDCODED_DATA: Record<string, PortfolioData & { metadata: Metadata }> = {
    "Scheme QTF": {
      data: {
        amountDeposited: "0.00",
        currentExposure: "0.00",
        return: "13.95",
        totalProfit: "6805437.30",
        trailingReturns: {
          "5d": 0.36,
          "10d": -0.07,
          "15d": 0.04,
          "1m": 1.47,
          "3m": 4.27,
          "6m": null,
          "1y": null,
          "2y": null,
          "5y": null,
          sinceInception: 13.95,
          MDD: -2.53,
          currentDD: -0.07,
        },
        drawdown: "-0.07",
        maxDrawdown: "-2.53",
        equityCurve: [
          { date: "2025-08-26", nav: 99.66 },
          { date: "2025-08-28", nav: 100.93 },
          { date: "2025-08-29", nav: 101.24 },
          { date: "2025-09-01", nav: 101.32 },
          { date: "2025-09-02", nav: 101.60 },
          { date: "2025-09-03", nav: 102.44 },
          { date: "2025-09-04", nav: 103.38 },
          { date: "2025-09-05", nav: 102.72 },
          { date: "2025-09-08", nav: 102.98 },
          { date: "2025-09-09", nav: 103.55 },
          { date: "2025-09-10", nav: 103.99 },
          { date: "2025-09-11", nav: 103.99 },
          { date: "2025-09-12", nav: 104.51 },
          { date: "2025-09-15", nav: 104.41 },
          { date: "2025-09-16", nav: 105.17 },
          { date: "2025-09-17", nav: 105.54 },
          { date: "2025-09-18", nav: 105.56 },
          { date: "2025-09-19", nav: 105.28 },
          { date: "2025-09-22", nav: 105.64 },
          { date: "2025-09-23", nav: 105.59 },
          { date: "2025-09-24", nav: 105.26 },
          { date: "2025-09-25", nav: 105.59 },
          { date: "2025-09-26", nav: 106.69 },
          { date: "2025-09-29", nav: 106.05 },
          { date: "2025-09-30", nav: 105.81 },
          { date: "2025-10-01", nav: 106.92 },
          { date: "2025-10-03", nav: 106.74 },
          { date: "2025-10-06", nav: 107.74 },
          { date: "2025-10-07", nav: 107.66 },
          { date: "2025-10-08", nav: 107.49 },
          { date: "2025-10-09", nav: 107.85 },
          { date: "2025-10-10", nav: 108.18 },
          { date: "2025-10-13", nav: 108.31 },
          { date: "2025-10-14", nav: 108.64 },
          { date: "2025-10-15", nav: 108.89 },
          { date: "2025-10-16", nav: 110.42 },
          { date: "2025-10-17", nav: 111.03 },
          { date: "2025-10-20", nav: 111.25 },
          { date: "2025-10-23", nav: 110.70 },
          { date: "2025-10-24", nav: 110.20 },
          { date: "2025-10-27", nav: 109.68 },
          { date: "2025-10-28", nav: 108.44 },
          { date: "2025-10-29", nav: 109.60 },
          { date: "2025-10-30", nav: 109.02 },
          { date: "2025-10-31", nav: 108.89 },
          { date: "2025-11-03", nav: 109.49 },
          { date: "2025-11-04", nav: 109.39 },
          { date: "2025-11-06", nav: 108.93 },
          { date: "2025-11-07", nav: 109.01 },
          { date: "2025-11-10", nav: 109.76 },
          { date: "2025-11-11", nav: 110.34 },
          { date: "2025-11-12", nav: 110.86 },
          { date: "2025-11-13", nav: 111.45 },
          { date: "2025-11-14", nav: 111.09 },
          { date: "2025-11-17", nav: 111.20 },
          { date: "2025-11-18", nav: 110.63 },
          { date: "2025-11-19", nav: 111.36 },
          { date: "2025-11-20", nav: 111.51 },
          { date: "2025-11-21", nav: 110.80 },
          { date: "2025-11-24", nav: 110.38 },
          { date: "2025-11-25", nav: 111.06 },
          { date: "2025-11-26", nav: 111.63 },
          { date: "2025-11-27", nav: 111.76 },
          { date: "2025-11-28", nav: 112.08 },
          { date: "2025-12-01", nav: 112.07 },
          { date: "2025-12-02", nav: 111.72 },
          { date: "2025-12-03", nav: 111.52 },
          { date: "2025-12-04", nav: 111.10 },
          { date: "2025-12-05", nav: 111.71 },
          { date: "2025-12-08", nav: 110.94 },
          { date: "2025-12-09", nav: 112.68 },
          { date: "2025-12-10", nav: 111.96 },
          { date: "2025-12-11", nav: 111.94 },
          { date: "2025-12-12", nav: 113.13 },
          { date: "2025-12-15", nav: 113.22 },
          { date: "2025-12-16", nav: 112.54 },
          { date: "2025-12-17", nav: 112.26 },
          { date: "2025-12-18", nav: 112.14 },
          { date: "2025-12-19", nav: 112.22 },
          { date: "2025-12-22", nav: 113.10 },
          { date: "2025-12-23", nav: 113.53 },
          { date: "2025-12-24", nav: 113.61 },
          { date: "2025-12-26", nav: 113.65 },
          { date: "2025-12-29", nav: 113.10 },
          { date: "2025-12-30", nav: 112.72 },
          { date: "2025-12-31", nav: 111.93 },
          { date: "2026-01-01", nav: 112.22 },
          { date: "2026-01-02", nav: 113.16 },
          { date: "2026-01-05", nav: 113.33 },
          { date: "2026-01-06", nav: 113.62 },
          { date: "2026-01-07", nav: 113.57 },
          { date: "2026-01-08", nav: 113.30 },
          { date: "2026-01-09", nav: 113.57 },
        ],
        drawdownCurve: [
          { date: "2025-08-26", drawdown: -0.34 },
          { date: "2025-08-28", drawdown: 0.00 },
          { date: "2025-08-29", drawdown: 0.00 },
          { date: "2025-09-01", drawdown: 0.00 },
          { date: "2025-09-02", drawdown: 0.00 },
          { date: "2025-09-03", drawdown: 0.00 },
          { date: "2025-09-04", drawdown: 0.00 },
          { date: "2025-09-05", drawdown: -0.64 },
          { date: "2025-09-08", drawdown: -0.38 },
          { date: "2025-09-09", drawdown: 0.00 },
          { date: "2025-09-10", drawdown: 0.00 },
          { date: "2025-09-11", drawdown: 0.00 },
          { date: "2025-09-12", drawdown: 0.00 },
          { date: "2025-09-15", drawdown: -0.09 },
          { date: "2025-09-16", drawdown: 0.00 },
          { date: "2025-09-17", drawdown: 0.00 },
          { date: "2025-09-18", drawdown: 0.00 },
          { date: "2025-09-19", drawdown: -0.27 },
          { date: "2025-09-22", drawdown: 0.00 },
          { date: "2025-09-23", drawdown: -0.04 },
          { date: "2025-09-24", drawdown: -0.36 },
          { date: "2025-09-25", drawdown: -0.04 },
          { date: "2025-09-26", drawdown: 0.00 },
          { date: "2025-09-29", drawdown: -0.60 },
          { date: "2025-09-30", drawdown: -0.83 },
          { date: "2025-10-01", drawdown: 0.00 },
          { date: "2025-10-03", drawdown: -0.17 },
          { date: "2025-10-06", drawdown: 0.00 },
          { date: "2025-10-07", drawdown: -0.07 },
          { date: "2025-10-08", drawdown: -0.23 },
          { date: "2025-10-09", drawdown: 0.00 },
          { date: "2025-10-10", drawdown: 0.00 },
          { date: "2025-10-13", drawdown: 0.00 },
          { date: "2025-10-14", drawdown: 0.00 },
          { date: "2025-10-15", drawdown: 0.00 },
          { date: "2025-10-16", drawdown: 0.00 },
          { date: "2025-10-17", drawdown: 0.00 },
          { date: "2025-10-20", drawdown: 0.00 },
          { date: "2025-10-23", drawdown: -0.49 },
          { date: "2025-10-24", drawdown: -0.95 },
          { date: "2025-10-27", drawdown: -1.41 },
          { date: "2025-10-28", drawdown: -2.53 },
          { date: "2025-10-29", drawdown: -1.48 },
          { date: "2025-10-30", drawdown: -2.01 },
          { date: "2025-10-31", drawdown: -2.12 },
          { date: "2025-11-03", drawdown: -1.59 },
          { date: "2025-11-04", drawdown: -1.67 },
          { date: "2025-11-06", drawdown: -2.09 },
          { date: "2025-11-07", drawdown: -2.01 },
          { date: "2025-11-10", drawdown: -1.34 },
          { date: "2025-11-11", drawdown: -0.82 },
          { date: "2025-11-12", drawdown: -0.35 },
          { date: "2025-11-13", drawdown: 0.00 },
          { date: "2025-11-14", drawdown: -0.33 },
          { date: "2025-11-17", drawdown: -0.23 },
          { date: "2025-11-18", drawdown: -0.74 },
          { date: "2025-11-19", drawdown: -0.08 },
          { date: "2025-11-20", drawdown: 0.00 },
          { date: "2025-11-21", drawdown: -0.63 },
          { date: "2025-11-24", drawdown: -1.01 },
          { date: "2025-11-25", drawdown: -0.40 },
          { date: "2025-11-26", drawdown: 0.00 },
          { date: "2025-11-27", drawdown: 0.00 },
          { date: "2025-11-28", drawdown: 0.00 },
          { date: "2025-12-01", drawdown: -0.01 },
          { date: "2025-12-02", drawdown: -0.32 },
          { date: "2025-12-03", drawdown: -0.50 },
          { date: "2025-12-04", drawdown: -0.88 },
          { date: "2025-12-05", drawdown: -0.33 },
          { date: "2025-12-08", drawdown: -1.02 },
          { date: "2025-12-09", drawdown: 0.00 },
          { date: "2025-12-10", drawdown: -0.64 },
          { date: "2025-12-11", drawdown: -0.66 },
          { date: "2025-12-12", drawdown: 0.00 },
          { date: "2025-12-15", drawdown: 0.00 },
          { date: "2025-12-16", drawdown: -0.60 },
          { date: "2025-12-17", drawdown: -0.85 },
          { date: "2025-12-18", drawdown: -0.96 },
          { date: "2025-12-19", drawdown: -0.89 },
          { date: "2025-12-22", drawdown: -0.11 },
          { date: "2025-12-23", drawdown: 0.00 },
          { date: "2025-12-24", drawdown: 0.00 },
          { date: "2025-12-26", drawdown: 0.00 },
          { date: "2025-12-29", drawdown: -0.48 },
          { date: "2025-12-30", drawdown: -0.82 },
          { date: "2025-12-31", drawdown: -1.51 },
          { date: "2026-01-01", drawdown: -1.26 },
          { date: "2026-01-02", drawdown: -0.43 },
          { date: "2026-01-05", drawdown: -0.28 },
          { date: "2026-01-06", drawdown: -0.03 },
          { date: "2026-01-07", drawdown: -0.07 },
          { date: "2026-01-08", drawdown: -0.31 },
          { date: "2026-01-09", drawdown: -0.07 },
        ],
        quarterlyPnl: {
          "2025": {
            percent: { q1: "0", q2: "0", q3: "6.17", q4: "5.78", total: "11.95" },
            cash: { q1: "0", q2: "0", q3: "3073926.70", q4: "2887170.83", total: "5961097.53" },
            yearCash: "5961097.53",
          },
          "2026": {
            percent: { q1: "1.47", q2: "0", q3: "0", q4: "0", total: "1.47" },
            cash: { q1: "844339.77", q2: "0", q3: "0", q4: "0", total: "844339.77" },
            yearCash: "844339.77",
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
              August: { percent: "1.59", cash: "790790.73", capitalInOut: "49999904.70" },
              September: { percent: "4.51", cash: "2283135.97", capitalInOut: "0" },
              October: { percent: "2.91", cash: "1535912.83", capitalInOut: "0" },
              November: { percent: "2.93", cash: "1595655.95", capitalInOut: "0" },
              December: { percent: "-0.13", cash: "-61942.29", capitalInOut: "0" },
            },
            totalPercent: 11.81,
            totalCash: 6143553.19,
            totalCapitalInOut: 49999904.70,
          },
          "2026": {
            months: {
              January: { percent: "1.47", cash: "844339.77", capitalInOut: "-56805342.00" },
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
            totalCash: 844339.77,
            totalCapitalInOut: -56805342.00,
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
