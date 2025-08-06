import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

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

interface DrawdownMetrics {
  currentDD: number;
  mdd: number;
  ddCurve: { date: string; drawdown: number }[];
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

const PORTFOLIO_MAPPING = {
  AC5: {
    "Scheme B": {
      current: "Zerodha Total Portfolio",
      metrics: "Total Portfolio Value",
      nav: "Total Portfolio Value",
      isActive: true,
    },
    "Scheme QAW": {
      current: "Zerodha Total Portfolio QAW",
      metrics: "Zerodha Total Portfolio QAW",
      nav: "Zerodha Total Portfolio QAW",
      isActive: false,
    },
    "Scheme A": {
      current: "Zerodha Total Portfolio A",
      metrics: "Zerodha Total Portfolio A",
      nav: "Zerodha Total Portfolio A",
      isActive: false,
    },
    "Scheme C": {
      current: "Zerodha Total Portfolio C",
      metrics: "Zerodha Total Portfolio C",
      nav: "Zerodha Total Portfolio C",
      isActive: false,
    },
    "Scheme D": {
      current: "Zerodha Total Portfolio D",
      metrics: "Zerodha Total Portfolio D",
      nav: "Zerodha Total Portfolio D",
      isActive: false,
    },
    "Scheme E": {
      current: "Zerodha Total Portfolio E",
      metrics: "Zerodha Total Portfolio E",
      nav: "Zerodha Total Portfolio E",
      isActive: false,
    },
    "Scheme F": {
      current: "Zerodha Total Portfolio F",
      metrics: "Zerodha Total Portfolio F",
      nav: "Zerodha Total Portfolio F",
      isActive: false,
    },
    "Scheme PMS QAW": {
      current: "PMS QAW Portfolio",
      metrics: "PMS QAW Portfolio",
      nav: "PMS QAW Portfolio",
      isActive: true,
    },
    "Total Portfolio": {
      current: "Sarla Performance fibers Scheme Total Portfolio",
      metrics: "Sarla Performance fibers Scheme Total Portfolio",
      nav: "Sarla Performance fibers Scheme Total Portfolio",
      isActive: true,
    },
  },
};

// Frozen return values for specific schemes
const FROZEN_RETURN_VALUES = {
  "Scheme A": 21.79,
  "Scheme C": 8.10,
  "Scheme D": 2.33,
  "Scheme E": 5.21,
  "Scheme F": 4.38,
};


// Hardcoded since-inception returns
const HARDCODED_SINCE_INCEPTION_RETURNS = {
  AC5: {
    "Scheme A": 24.10,
    "Scheme C": 30.78,
    "Scheme D": 2.33,
    "Scheme E": 5.21,
    "Scheme F": 4.38,
  },
};

// Hardcoded cash flows for AC8
const HARDCODED_CASH_FLOWS_AC8 = {
  "Scheme A (Old)": [
    { date: "2024-06-18", amount: 67999205.0, dividend: 0, active_inactive: "Active" },
    { date: "2024-06-25", amount: -67562885.2, dividend: 0, active_inactive: "Active" },
  ],
  "Scheme B": [
    { date: "2024-06-25", amount: 74561820.2, dividend: 0, active_inactive: "Active" },
    { date: "2024-11-16", amount: -77915199.0, dividend: 0, active_inactive: "Active" },
  ],
  "Scheme A": [
    { date: "2024-11-17", amount: 77914968.5, dividend: 0, active_inactive: "Active" },
    { date: "2024-12-02", amount: 20000000.0, dividend: 0, active_inactive: "Active" },
    { date: "2025-01-08", amount: 26335800.4, dividend: 0, active_inactive: "Active" },
    { date: "2025-01-15", amount: 7500000.0, dividend: 0, active_inactive: "Active" },
    { date: "2025-02-14", amount: -10000000.0, dividend: 0, active_inactive: "Active" },
    { date: "2025-05-29", amount: -50000000.0, dividend: 0, active_inactive: "Active" },
    { date: "2025-05-30", amount: -44080573.0, dividend: 0, active_inactive: "Active" },
    { date: "2025-05-30", amount: 30157181.60, dividend: 0, active_inactive: "Active" },
  ],
};

// Hardcoded AC5 quarterly P&L values with added amounts
const AC5_QUARTERLY_PNL = {
  "2022": {
    Q3: -1609424.1,
    Q4: 176694.73,
    total: -1432729.4,
  },
  "2023": {
    Q1: -395793.61,
    Q2: 2672374.193,
    Q3: 5417561.9 + 1273362.0,
    Q4: 13138235,
    total: -395793.61 + 2672374.193 + (5417561.9 + 1273362.0) + 13138235,
  },
  "2024": {
    Q1: 2469230.5,
    Q2: 25393463.51,
    Q3: 16982324 + 2881647.1,
    Q4: 31414712,
    total: 2469230.5 + 25393463.51 + (16982324 + 2881647.1) + 31414712,
  },
  "2025": {
    Q1: 9538524.5,
    Q2: 76149895.76 + 6215140.1,
    total: 9538524.5 + (76149895.76 + 6215140.1),
  },
};

// Hardcoded Q2 2025 value for Scheme PMS QAW
const PMS_QAW_Q2_2025_VALUE = 10338478.61;

export class PortfolioApi {
  private static normalizeDate(date: string | Date): string | null {
    if (!date) return null;
    if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date;
    }
    const parsed = new Date(date);
    if (!isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
    }
    console.warn(`Invalid date format: ${date}`);
    return null;
  }

  private static getSystemTag(scheme: string): string {
    const systemTagMap: Record<string, string> = {
      "Total Portfolio": "Sarla Performance fibers Scheme Total Portfolio",
      "Scheme B": "Total Portfolio Value",
      "Scheme QAW": "Zerodha Total Portfolio QAW",
      "Scheme A": "Zerodha Total Portfolio A",
      "Scheme C": "Zerodha Total Portfolio C",
      "Scheme D": "Zerodha Total Portfolio D",
      "Scheme E": "Zerodha Total Portfolio E",
      "Scheme F": "Zerodha Total Portfolio F",
      "Scheme PMS QAW": "PMS QAW Portfolio",
    };
    return systemTagMap[scheme] || `Zerodha Total Portfolio ${scheme}`;
  }


  private static async getPMSData(accountCode: string = "QAW00023"): Promise<{
    amountDeposited: number;
    currentExposure: number;
    totalProfit: number;
    historicalData: { date: string; nav: number; drawdown: number; pnl: number; capitalInOut: number }[];
    cashFlows: CashFlow[];
    latestData: { portfolioValue: number; drawdown: number; nav: number; date: Date } | null;
  }> {

    const pmsData = await prisma.pms_master_sheet.findMany({
      where: { account_code: accountCode },
      select: {
        report_date: true,
        portfolio_value: true,
        cash_in_out: true,
        nav: true,
        pnl: true,
        drawdown_percent: true,
      },
      orderBy: { report_date: "asc" },
    });


    if (!pmsData.length) {
      return {
        amountDeposited: 0,
        currentExposure: 0,
        totalProfit: 0,
        historicalData: [],
        cashFlows: [],
        latestData: null,
      };
    }

    const amountDeposited = pmsData.reduce((sum, record) => sum + (Number(record.cash_in_out) || 0), 0);

    const latestRecord = pmsData[pmsData.length - 1];
    const latestData = {
      portfolioValue: Number(latestRecord.portfolio_value) || 0,
      drawdown: Math.abs(Number(latestRecord.drawdown_percent) || 0),
      nav: Number(latestRecord.nav) || 0,
      date: latestRecord.report_date,
    };

    const totalProfit = pmsData.reduce((sum, record) => sum + (Number(record.pnl) || 0), 0);

    const historicalData = pmsData.map(record => ({
      date: this.normalizeDate(record.report_date)!,
      nav: Number(record.nav) || 0,
      drawdown: Math.abs(Number(record.drawdown_percent) || 0),
      pnl: Number(record.pnl) || 0,
      capitalInOut: Number(record.cash_in_out) || 0,
    }));

    const cashFlows: CashFlow[] = pmsData
      .filter(record => Number(record.cash_in_out) !== 0)
      .map(record => ({
        date: this.normalizeDate(record.report_date)!,
        amount: Number(record.cash_in_out) || 0,
        dividend: 0,
      }));

    return {
      amountDeposited,
      currentExposure: latestData.portfolioValue,
      totalProfit,
      historicalData,
      cashFlows,
      latestData,
    };
  }

private static SARLA_HARDCODED_DATA: Record<string, PortfolioData & { metadata: Metadata }> = {
  "Scheme A": {
    data: {
      amountDeposited: "0.00",
      currentExposure: "0.00",
      return: "24.10",
      totalProfit: "79783174.52",
      trailingReturns: {
        "5d": 0.02,
        "10d": -0.94,
        "15d": -2.16,
        "1m": 2.39,
        "3m": 6.30,
        "6m": 4.66,
        "1y": 14.23,
        "2y": 30.31,
        "5y": null,
        sinceInception: 24.10,
        MDD: -12.12,
        currentDD: -2.16,
      },
      drawdown: "-2.16",
      maxDrawdown: "-12.12",
      equityCurve: [],
      drawdownCurve: [],
      quarterlyPnl: {
        "2022": {
          percent: { q1: "-", q2: "-", q3: "-15.2", q4: "2.1", total: "-13.5" },
          cash: { q1: "-", q2: "-", q3: "-1609424.10", q4: "176694.70", total: "-1432729.40" },
          yearCash: "-1432729.40",
        },
        "2023": {
          percent: { q1: "-4.7", q2: "34.2", q3: "52.1", q4: "46.3", total: "262.9" },
          cash: { q1: "-395793.60", q2: "2672374.20", q3: "6690923.80", q4: "13138234.80", total: "22105739.20" },
          yearCash: "22105739.20",
        },
        "2024": {
          percent: { q1: "18.7", q2: "78.-2", q3: "42.8", q4: "28.9", total: "560.2" },
          cash: { q1: "3266707.50", q2: "16847614.50", q3: "14142910.40", q4: "12837438.50", total: "47094670.90" },
          yearCash: "47094670.90",
        },
        "2025": {
          percent: { q1: "-12.4", q2: "35.6", q3: "-", q4: "-", total: "18.5" },
          cash: { q1: "-8038030.00", q2: "20053523.70", q3: "-", q4: "-", total: "12015493.70" },
          yearCash: "12015493.70",
        },
      },
      monthlyPnl: {
        "2022": {
          months: {
            September: { percent: "-3.22", cash: "-1609424.10", capitalInOut: "50000000.00" },
            October: { percent: "-3.13", cash: "0.00", capitalInOut: "0.00" },
            November: { percent: "0.23", cash: "0.00", capitalInOut: "0.00" },
            December: { percent: "3.37", cash: "176694.70", capitalInOut: "0.00" },
          },
          totalPercent: -2.87,
          totalCash: -1432729.4,
          totalCapitalInOut: 50000000.00,
        },
        "2023": {
          months: {
            January: { percent: "0.28", cash: "0.00", capitalInOut: "0.00" },
            February: { percent: "-1.70", cash: "-395793.60", capitalInOut: "0.00" },
            March: { percent: "0.62", cash: "0.00", capitalInOut: "0.00" },
            April: { percent: "2.24", cash: "0.00", capitalInOut: "0.00" },
            May: { percent: "-0.03", cash: "0.00", capitalInOut: "0.00" },
            June: { percent: "3.66", cash: "2672374.20", capitalInOut: "0.00" },
            July: { percent: "2.81", cash: "0.00", capitalInOut: "0.00" },
            August: { percent: "3.69", cash: "0.00", capitalInOut: "0.00" },
            September: { percent: "3.59", cash: "6690923.80", capitalInOut: "0.00" },
            October: { percent: "7.22", cash: "0.00", capitalInOut: "18000000.00" },
            November: { percent: "0.39", cash: "0.00", capitalInOut: "17533740.85" },
            December: { percent: "9.39", cash: "13138234.80", capitalInOut: "0.00" },
          },
          totalPercent: 36.64,
          totalCash: 22105739.2,
          totalCapitalInOut: 35533740.85,
        },
        "2024": {
          months: {
            January: { percent: "6.30", cash: "0.00", capitalInOut: "52816909.26" },
            February: { percent: "0.46", cash: "0.00", capitalInOut: "-12894139.92" },
            March: { percent: "-2.53", cash: "3266707.50", capitalInOut: "0.00" },
            April: { percent: "7.58", cash: "0.00", capitalInOut: "49798928.27" },
            May: { percent: "-0.01", cash: "0.00", capitalInOut: "0.00" },
            June: { percent: "2.00", cash: "16847614.50", capitalInOut: "30000000.00" },
            July: { percent: "2.30", cash: "0.00", capitalInOut: "45079267.40" },
            August: { percent: "0.47", cash: "0.00", capitalInOut: "-50000000.00" },
            September: { percent: "1.97", cash: "14142910.40", capitalInOut: "0.00" },
            October: { percent: "0.63", cash: "0.00", capitalInOut: "-0.73" },
            November: { percent: "6.28", cash: "0.00", capitalInOut: "0.00" },
            December: { percent: "-2.02", cash: "12837438.50", capitalInOut: "-31883821.00" },
          },
          totalPercent: 25.43,
          totalCash: 47094670.9,
          totalCapitalInOut: 84930964.98,
        },
        "2025": {
          months: {
            January: { percent: "-3.21", cash: "0.00", capitalInOut: "0.00" },
            February: { percent: "-1.87", cash: "0.00", capitalInOut: "0.00" },
            March: { percent: "1.64", cash: "-8038030.00", capitalInOut: "0.00" },
            April: { percent: "6.08", cash: "0.00", capitalInOut: "-10000000.00" },
            May: { percent: "-0.11", cash: "20053523.70", capitalInOut: "-1450229217.73" },
          },
          totalPercent: 2.3,
          totalCash: 12015493.7,
          totalCapitalInOut: -1460229217.73,
        },
      },
      cashFlows: [
        { date: "2022-09-14", amount: 50000000.00, dividend: 286392.65 },
        { date: "2023-11-08", amount: 18000000.00, dividend: 0.00 },
        { date: "2023-11-21", amount: 18428022.85, dividend: 0.00 },
        { date: "2023-11-29", amount: -894282.00, dividend: 0.00 },
        { date: "2024-01-11", amount: 32816909.26, dividend: 0.00 },
        { date: "2024-01-24", amount: -18894139.92, dividend: 0.00 },
        { date: "2024-01-30", amount: 19000000.00, dividend: 0.00 },
        { date: "2024-02-09", amount: 6000000.00, dividend: 0.00 },
        { date: "2024-04-15", amount: 30000000.00, dividend: 0.00 },
        { date: "2024-04-15", amount: 19798928.27, dividend: 0.00 },
        { date: "2024-06-28", amount: 30000000.00, dividend: 0.00 },
        { date: "2024-07-26", amount: 25079267.40, dividend: 0.00 },
        { date: "2024-07-31", amount: 20000000.00, dividend: 0.00 },
        { date: "2024-08-21", amount: -50000000.00, dividend: 0.00 },
        { date: "2024-10-24", amount: 27690160.00, dividend: 0.00 },
        { date: "2024-10-24", amount: -10469772.73, dividend: 0.00 },
        { date: "2024-10-25", amount: -24360000.00, dividend: 0.00 },
        { date: "2024-10-25", amount: 7139612.73, dividend: 0.00 },
        { date: "2024-12-06", amount: -7383821.00, dividend: 0.00 },
        { date: "2024-12-09", amount: -24500000.00, dividend: 0.00 },
        { date: "2025-04-25", amount: -50000000.00, dividend: 0.00 },
        { date: "2025-05-02", amount: -50000000.00, dividend: 0.00 },
        { date: "2025-05-05", amount: -50000000.00, dividend: 0.00 },
        { date: "2025-05-07", amount: -5222716.88, dividend: 0.00 },
        { date: "2025-05-08", amount: -4955516.54, dividend: 0.00 },
        { date: "2025-05-08", amount: -84924701.31, dividend: 0.00 },
      ],
      strategyName: "Scheme A",
    },
    metadata: {
      icode: "Scheme A",
      accountCount: 1,
      lastUpdated: "2025-08-05",
      filtersApplied: { accountType: null, broker: null, startDate: null, endDate: null },
      inceptionDate: "2022-09-14",
      dataAsOfDate: "2025-07-18",
      strategyName: "Scheme A",
      isActive: false,
    },
  },
  "Scheme C": {
    data: {
      amountDeposited: "0.00",
      currentExposure: "0.00",
      return: "30.78",
      totalProfit: "4052160.65",
      trailingReturns: {
        "5d": 1.10,
        "10d": 2.09,
        "15d": 4.62,
        "1m": 5.87,
        "3m": 8.23,
        "6m": null,
        "1y": null,
        "2y": null,
        "5y": null,
        sinceInception: 30.78,
        MDD: -4.37,
        currentDD: 0.00,
      },
      drawdown: "0.00",
      maxDrawdown: "-4.37",
      equityCurve: [],
      drawdownCurve: [],
      quarterlyPnl: {
        "2024": {
          percent: { q1: "-", q2: "-", q3: "3.79", q4: "4.29", total: "8.07" },
          cash: { q1: "0.00", q2: "0.00", q3: "1820621.13", q4: "2214539.53", total: "4035160.65" },
          yearCash: "4035160.65",
        },
      },
      monthlyPnl: {
        "2024": {
          months: {
            August: { percent: "-0.15", cash: "0.00", capitalInOut: "50000000.00" },
            September: { percent: "3.79", cash: "1820621.13", capitalInOut: "0.00" },
            October: { percent: "-1.48", cash: "0.00", capitalInOut: "0.00" },
            November: { percent: "4.69", cash: "0.00", capitalInOut: "0.00" },
            December: { percent: "1.10", cash: "2214539.53", capitalInOut: "-54052160.00" },
          },
          totalPercent: 8.07,
          totalCash: 4035160.65,
          totalCapitalInOut: -4052160.00,
        },
      },
      cashFlows: [
        { date: "2024-08-21", amount: 50000000.00, dividend: 0.00 },
        { date: "2024-12-04", amount: -54052160.00, dividend: 0.00 },
      ],
      strategyName: "Scheme C",
    },
    metadata: {
      icode: "Scheme C",
      accountCount: 1,
      lastUpdated: "2025-08-05",
      filtersApplied: { accountType: null, broker: null, startDate: null, endDate: null },
      inceptionDate: "2024-08-21",
      dataAsOfDate: "2024-12-04",
      strategyName: "Scheme C",
      isActive: false,
    },
  },
  "Scheme D": {
    data: {
      amountDeposited: "0.00",
      currentExposure: "0.00",
      return: "2.33",
      totalProfit: "232539.98",
      trailingReturns: {
        "5d": 1.72,
        "10d": 2.05,
        "15d": 1.17,
        "1m": 0.56,
        "3m": 2.24,
        "6m": null,
        "1y": null,
        "2y": null,
        "5y": null,
        sinceInception: 2.33,
        MDD: -3.38,
        currentDD: -0.98,
      },
      drawdown: "-0.98",
      maxDrawdown: "-3.38",
      equityCurve: [],
      drawdownCurve: [],
      quarterlyPnl: {
        "2024": {
          percent: { q1: "-", q2: "-", q3: "-", q4: "-0.16", total: "-0.16" },
          cash: { q1: "0.00", q2: "0.00", q3: "0.00", q4: "-12287.12", total: "-12287.12" },
          yearCash: "-12287.12",
        },
        "2025": {
          percent: { q1: "2.41", q2: "-", q3: "-", q4: "-", total: "2.41" },
          cash: { q1: "244827.10", q2: "0.00", q3: "0.00", q4: "0.00", total: "244827.10" },
          yearCash: "244827.10",
        },
      },
      monthlyPnl: {
        "2024": {
          months: {
            November: { percent: "-0.81", cash: "0.00", capitalInOut: "1500000.00" },
            December: { percent: "0.66", cash: "-12287.12", capitalInOut: "0.00" },
          },
          totalPercent: -0.16,
          totalCash: -12287.12,
          totalCapitalInOut: 1500000.00,
        },
        "2025": {
          months: {
            January: { percent: "0.67", cash: "0.00", capitalInOut: "0.00" },
            February: { percent: "1.73", cash: "244827.10", capitalInOut: "-1732540.00" },
          },
          totalPercent: 2.41,
          totalCash: 244827.10,
          totalCapitalInOut: -1732540.00,
        },
      },
      cashFlows: [
        { date: "2024-11-13", amount: 1500000.00, dividend: 0.00 },
        { date: "2025-02-14", amount: -1732540.00, dividend: 0.00 },
      ],
      strategyName: "Scheme D",
    },
    metadata: {
      icode: "Scheme D",
      accountCount: 1,
      lastUpdated: "2025-08-05",
      filtersApplied: { accountType: null, broker: null, startDate: null, endDate: null },
      inceptionDate: "2024-11-13",
      dataAsOfDate: "2025-02-14",
      strategyName: "Scheme D",
      isActive: false,
    },
  },
  "Scheme E": {
    data: {
      amountDeposited: "0.00",
      currentExposure: "0.00",
      return: "5.21",
      totalProfit: "13020843.30",
      trailingReturns: {
        "5d": 2.83,
        "10d": 3.31,
        "15d": 1.30,
        "1m": 0.64,
        "3m": null,
        "6m": null,
        "1y": null,
        "2y": null,
        "5y": null,
        sinceInception: 5.21,
        MDD: -5.04,
        currentDD: -1.89,
      },
      drawdown: "-1.89",
      maxDrawdown: "-5.04",
      equityCurve: [],
      drawdownCurve: [],
      quarterlyPnl: {
        "2024": {
          percent: { q1: "-", q2: "-", q3: "-", q4: "2.36", total: "2.36" },
          cash: { q1: "0.00", q2: "0.00", q3: "0.00", q4: "5914281.13", total: "5914281.13" },
          yearCash: "5914281.13",
        },
        "2025": {
          percent: { q1: "2.72", q2: "-", q3: "-", q4: "-", total: "2.72" },
          cash: { q1: "7106562.17", q2: "0.00", q3: "0.00", q4: "0.00", total: "7106562.17" },
          yearCash: "7106562.17",
        },
      },
      monthlyPnl: {
        "2024": {
          months: {
            January: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            February: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            March: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            April: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            May: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            June: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            July: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            August: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            September: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            October: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            November: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            December: { percent: "2.36", cash: "5914281.13", capitalInOut: "0.00" },
          },
          totalPercent: 2.36,
          totalCash: 5914281.13,
          totalCapitalInOut: 0.00,
        },
        "2025": {
          months: {
            January: { percent: "0.22", cash: "0.00", capitalInOut: "0.00" },
            February: { percent: "2.50", cash: "7106562.17", capitalInOut: "0.00" },
            March: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            April: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            May: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            June: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            July: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            August: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            September: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            October: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            November: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            December: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
          },
          totalPercent: 2.72,
          totalCash: 7106562.17,
          totalCapitalInOut: 0.00,
        },
      },
      cashFlows: [
        { date: "2024-12-05", amount: 240000000.00, dividend: 0.00 },
        { date: "2024-12-16", amount: 115000000.00, dividend: 0.00 },
        { date: "2025-02-14", amount: -48520843.00, dividend: 0.00 },
      ],
      strategyName: "Scheme E",
    },
    metadata: {
      icode: "Scheme E",
      accountCount: 1,
      lastUpdated: "2025-08-05",
      filtersApplied: { accountType: null, broker: null, startDate: null, endDate: null },
      inceptionDate: "2024-12-05",
      dataAsOfDate: "2025-02-14",
      strategyName: "Scheme E",
      isActive: false,
    },
  },
  "Scheme F": {
    data: {
      amountDeposited: "0.00",
      currentExposure: "0.00",
      return: "4.38",
      totalProfit: "10954459.70",
      trailingReturns: {
        "5d": 2.31,
        "10d": 2.56,
        "15d": 1.64,
        "1m": 1.28,
        "3m": null,
        "6m": null,
        "1y": null,
        "2y": null,
        "5y": null,
        sinceInception: 4.38,
        MDD: -3.91,
        currentDD: -1.45,
      },
      drawdown: "-1.45",
      maxDrawdown: "-3.91",
      equityCurve: [],
      drawdownCurve: [],
      quarterlyPnl: {
        "2024": {
          percent: { q1: "-", q2: "-", q3: "-", q4: "2.13", total: "2.13" },
          cash: { q1: "0.00", q2: "0.00", q3: "0.00", q4: "5399550.24", total: "5399550.24" },
          yearCash: "5399550.24",
        },
        "2025": {
          percent: { q1: "2.10", q2: "-", q3: "-", q4: "-", total: "2.10" },
          cash: { q1: "5554909.46", q2: "0.00", q3: "0.00", q4: "0.00", total: "5554909.46" },
          yearCash: "5554909.46",
        },
      },
      monthlyPnl: {
        "2024": {
          months: {
            January: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            February: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            March: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            April: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            May: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            June: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            July: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            August: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            September: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            October: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            November: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            December: { percent: "2.13", cash: "5399550.24", capitalInOut: "0.00" },
          },
          totalPercent: 2.13,
          totalCash: 5399550.24,
          totalCapitalInOut: 0.00,
        },
        "2025": {
          months: {
            January: { percent: "-0.16", cash: "0.00", capitalInOut: "0.00" },
            February: { percent: "2.26", cash: "5554909.46", capitalInOut: "0.00" },
            March: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            April: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            May: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            June: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            July: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            August: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            September: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            October: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            November: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            December: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
          },
          totalPercent: 2.10,
          totalCash: 5554909.46,
          totalCapitalInOut: 0.00,
        },
      },
      cashFlows: [
        { date: "2024-12-18", amount: 16403458.75, dividend: 0.00 },
        { date: "2025-02-14", amount: -27357918.70, dividend: 0.00 },
      ],
      strategyName: "Scheme F",
    },
    metadata: {
      icode: "Scheme F",
      accountCount: 1,
      lastUpdated: "2025-08-05",
      filtersApplied: { accountType: null, broker: null, startDate: null, endDate: null },
      inceptionDate: "2024-12-18",
      dataAsOfDate: "2025-02-14",
      strategyName: "Scheme F",
      isActive: false,
    },
  },
  "Scheme QAW": {
    data: {
      amountDeposited: "0.00",
      currentExposure: "0.00",
      return: "8.00",
      totalProfit: "7169015.29",
      trailingReturns: {
        "5d": 0.31,
        "10d": -0.30,
        "15d": 1.34,
        "1m": 3.36,
        "3m": null,
        "6m": null,
        "1y": null,
        "2y": null,
        "5y": null,
        sinceInception: 7.96,
        MDD: -3.86,
        currentDD: -1.60,
      },
      drawdown: "-1.60",
      maxDrawdown: "-3.86",
      equityCurve: [],
      drawdownCurve: [],
      quarterlyPnl: {
        "2025": {
          percent: { q1: "7.96", q2: "-", q3: "-", q4: "-", total: "7.96" },
          cash: { q1: "1504573.98", q2: "5664441.35", q3: "0.00", q4: "0.00", total: "7169015.32" },
          yearCash: "7169015.32",
        },
      },
      monthlyPnl: {
        "2025": {
          months: {
            January: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            February: { percent: "-2.17", cash: "0.00", capitalInOut: "0.00" },
            March: { percent: "3.88", cash: "1504573.98", capitalInOut: "0.00" },
            April: { percent: "7.01", cash: "5664441.35", capitalInOut: "0.00" },
            May: { percent: "-0.72", cash: "0.00", capitalInOut: "0.00" },
            June: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            July: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            August: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            September: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            October: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            November: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            December: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
          },
          totalPercent: 7.96,
          totalCash: 7169015.32,
          totalCapitalInOut: 0.00,
        },
      },
      cashFlows: [],
      strategyName: "Scheme QAW",
    },
    metadata: {
      icode: "Scheme QAW",
      accountCount: 1,
      lastUpdated: "2025-08-05",
      filtersApplied: { accountType: null, broker: null, startDate: null, endDate: null },
      inceptionDate: "2025-02-01",
      dataAsOfDate: "2025-05-31",
      strategyName: "Scheme QAW",
      isActive: false,
    },
  },
};

  private static async getAmountDeposited(qcode: string, scheme: string): Promise<number> {
    if (qcode === "QAC00041" && this.SARLA_HARDCODED_DATA[scheme]) {
      return parseFloat(this.SARLA_HARDCODED_DATA[scheme].data.amountDeposited);
    }
    if (scheme === "Total Portfolio") {
      const schemes = ["Scheme B", "Scheme PMS QAW"];
      let totalDeposited = 0;

      for (const s of schemes) {
        if (s === "Scheme B") {
          const systemTag = "Zerodha Total Portfolio";
          const depositSum = await prisma.master_sheet.aggregate({
            where: {
              qcode,
              system_tag: systemTag,
              capital_in_out: { not: null },
            },
            _sum: { capital_in_out: true },
          });
          totalDeposited += Number(depositSum._sum.capital_in_out) || 0;
        }
      }

      const pmsData = await this.getPMSData();
      totalDeposited += pmsData.amountDeposited;

      return totalDeposited;
    }

    if (scheme === "Scheme PMS QAW") {
      const pmsData = await this.getPMSData();
      return pmsData.amountDeposited;
    }

    if (scheme === "Scheme B") {
      const systemTag = "Zerodha Total Portfolio";

      const depositSum = await prisma.master_sheet.aggregate({
        where: {
          qcode,
          system_tag: systemTag,
          capital_in_out: { not: null },
        },
        _sum: { capital_in_out: true },
      });
      const amount = Number(depositSum._sum.capital_in_out) || 0;
      return amount;
    }

    return 0;
  }

  private static async getLatestExposure(qcode: string, scheme: string): Promise<{ portfolioValue: number; drawdown: number; nav: number; date: Date } | null> {

    if (scheme === "Total Portfolio") {
      const schemes = ["Scheme B", "Scheme PMS QAW"];
      let totalPortfolioValue = 0;
      let latestDrawdown = 0;
      let latestNav = 0;
      let latestDate: Date | null = null;

      for (const s of schemes) {
        const systemTag = s === "Scheme B" ? "Zerodha Total Portfolio" : PortfolioApi.getSystemTag(s);
        if (s === "Scheme B") {
          const record = await prisma.master_sheet.findFirst({
            where: { qcode, system_tag: systemTag },
            orderBy: { date: "desc" },
            select: { portfolio_value: true, drawdown: true, nav: true, date: true },
          });
          if (record) {
            totalPortfolioValue += Number(record.portfolio_value) || 0;
            latestNav += Number(record.nav) || 0;
            if (!latestDate || record.date > latestDate) {
              latestDate = record.date;
              latestDrawdown = Math.abs(Number(record.drawdown) || 0);
            }
          }
        }
      }

      const pmsData = await this.getPMSData();
      if (pmsData.latestData) {
        totalPortfolioValue += pmsData.latestData.portfolioValue;
        latestNav += pmsData.latestData.nav;
        if (!latestDate || pmsData.latestData.date > latestDate) {
          latestDate = pmsData.latestData.date;
          latestDrawdown = pmsData.latestData.drawdown;
        }
      }

      return latestDate ? { portfolioValue: totalPortfolioValue, drawdown: latestDrawdown, nav: latestNav, date: latestDate } : null;
    }

    if (scheme === "Scheme PMS QAW") {
      const pmsData = await this.getPMSData();
      return pmsData.latestData;
    }

    if (scheme === "Scheme B") {
      const systemTag = "Zerodha Total Portfolio";

      const record = await prisma.master_sheet.findFirst({
        where: { qcode, system_tag: systemTag },
        orderBy: { date: "desc" },
        select: { portfolio_value: true, drawdown: true, nav: true, date: true },
      });
      if (!record) {
        return null;
      }
      const result = {
        portfolioValue: Number(record.portfolio_value) || 0,
        drawdown: Math.abs(Number(record.drawdown) || 0),
        nav: Number(record.nav) || 0,
        date: record.date,
      };
      return result;
    }


    const systemTag = PortfolioApi.getSystemTag(scheme);

    const record = await prisma.master_sheet.findFirst({
      where: { qcode, system_tag: systemTag },
      orderBy: { date: "desc" },
      select: { portfolio_value: true, drawdown: true, nav: true, date: true },
    });
    if (!record) return null;
    return {
      portfolioValue: Number(record.portfolio_value) || 0,
      drawdown: Math.abs(Number(record.drawdown) || 0),
      nav: Number(record.nav) || 0,
      date: record.date,
    };
  }

  private static async getPortfolioReturns(qcode: string, scheme: string): Promise<number> {
    // Check for hardcoded since-inception returns
    if (qcode === "QAC00041" && this.SARLA_HARDCODED_DATA[scheme]) {
      return parseFloat(this.SARLA_HARDCODED_DATA[scheme].data.return);
    }

    if (scheme === "Total Portfolio" || scheme === "Scheme B") {
      const amountDeposited = await PortfolioApi.getAmountDeposited(qcode, scheme);
      const latestExposure = await PortfolioApi.getLatestExposure(qcode, scheme);

      if (!latestExposure || amountDeposited === 0) {
        return 0;
      }

      const currentPortfolioValue = latestExposure.portfolioValue;
      const returnPercentage = ((currentPortfolioValue - amountDeposited) / amountDeposited) * 100;


      return Number(returnPercentage.toFixed(2));
    }

    if (scheme === "Scheme PMS QAW") {
      const pmsData = await this.getPMSData();
      if (pmsData.historicalData.length < 2) return 0;

      const firstRecord = pmsData.historicalData[0];
      const lastRecord = pmsData.historicalData[pmsData.historicalData.length - 1];

      const initialNav = firstRecord.nav;
      const finalNav = lastRecord.nav;

      const durationYears = (new Date(lastRecord.date).getTime() - new Date(firstRecord.date).getTime()) / (365 * 24 * 60 * 60 * 1000);


      if (initialNav === 0) return 0;

      return durationYears >= 1
        ? (Math.pow(finalNav / initialNav, 1 / durationYears) - 1) * 100 // CAGR
        : ((finalNav - initialNav) / initialNav) * 100; // Absolute
    }

    if (FROZEN_RETURN_VALUES[scheme]) {
      return FROZEN_RETURN_VALUES[scheme];
    }

    try {
      const systemTag = PortfolioApi.getSystemTag(scheme);

      const firstNavRecord = await prisma.master_sheet.findFirst({
        where: { qcode, system_tag: systemTag, nav: { not: null } },
        orderBy: { date: "asc" },
        select: { nav: true, date: true },
      });

      const latestNavRecord = await prisma.master_sheet.findFirst({
        where: { qcode, system_tag: systemTag, nav: { not: null } },
        orderBy: { date: "desc" },
        select: { nav: true, date: true },
      });

      if (!firstNavRecord || !latestNavRecord) {
        return 0;
      }

      const initialNav = Number(firstNavRecord.nav) || 0;
      const finalNav = Number(latestNavRecord.nav) || 0;

      const durationYears = (new Date(latestNavRecord.date).getTime() - new Date(firstNavRecord.date).getTime()) / (365 * 24 * 60 * 60 * 1000);


      if (initialNav === 0) return 0;

      return durationYears >= 1
        ? (Math.pow(finalNav / initialNav, 1 / durationYears) - 1) * 100 // CAGR
        : ((finalNav - initialNav) / initialNav) * 100; // Absolute
    } catch (error) {
      console.error(`Error calculating portfolio returns for qcode ${qcode}, scheme ${scheme}:`, error);
      return 0;
    }
  }

  private static async getTotalProfit(qcode: string, scheme: string): Promise<number> {
    // Check for hardcoded total profit
    if (qcode === "QAC00041" && this.SARLA_HARDCODED_DATA[scheme]) {
      return parseFloat(this.SARLA_HARDCODED_DATA[scheme].data.totalProfit);
    }

    if (scheme === "Scheme PMS QAW") {
      const pmsData = await this.getPMSData();
      return pmsData.totalProfit;
    }

    if (scheme === "Total Portfolio") {
      const schemes = ["Scheme B", "Scheme PMS QAW"];
      let totalProfit = 0;

      for (const s of schemes) {
        if (s === "Scheme B") {
          const systemTag = PortfolioApi.getSystemTag(s);
          const profitSum = await prisma.master_sheet.aggregate({
            where: { qcode, system_tag: systemTag },
            _sum: { pnl: true },
          });
          totalProfit += Number(profitSum._sum.pnl) || 0;
        }
      }

      const pmsData = await this.getPMSData();
      totalProfit += pmsData.totalProfit;

      return totalProfit;
    }

    const systemTag = PortfolioApi.getSystemTag(scheme);

    const profitSum = await prisma.master_sheet.aggregate({
      where: { qcode, system_tag: systemTag },
      _sum: { pnl: true },
    });
    let profit = Number(profitSum._sum.pnl) || 0;
    return profit;
  }

  private static async getHistoricalData(qcode: string, scheme: string): Promise<{ date: Date; nav: number; drawdown: number; pnl: number; capitalInOut: number }[]> {
    if (scheme === "Scheme PMS QAW") {
      const pmsData = await this.getPMSData();
      return pmsData.historicalData.map(item => ({
        date: new Date(item.date),
        nav: item.nav,
        drawdown: item.drawdown,
        pnl: item.pnl,
        capitalInOut: item.capitalInOut,
      }));
    }

    const systemTag = PortfolioApi.getSystemTag(scheme);

    const data = await prisma.master_sheet.findMany({
      where: {
        qcode,
        system_tag: systemTag,
        nav: { not: null },
        drawdown: { not: null },
      },
      select: { date: true, nav: true, drawdown: true, pnl: true, capital_in_out: true },
      orderBy: { date: "asc" },
    });


    return data.map(entry => ({
      date: entry.date,
      nav: Number(entry.nav) || 0,
      drawdown: Math.abs(Number(entry.drawdown) || 0),
      pnl: Number(entry.pnl) || 0,
      capitalInOut: Number(entry.capital_in_out) || 0,
    }));
  }

  private static async getCashFlows(qcode: string, scheme: string, accountCode: string = "AC5"): Promise<CashFlow[]> {
    if (qcode === "QAC00041" && this.SARLA_HARDCODED_DATA[scheme]) {
      return this.SARLA_HARDCODED_DATA[scheme].data.cashFlows.map(flow => ({
        date: flow.date,
        amount: flow.amount,
        dividend: flow.dividend,
      }));
    }
    if (accountCode === "AC8" && HARDCODED_CASH_FLOWS_AC8[scheme]) {
      return HARDCODED_CASH_FLOWS_AC8[scheme].map(flow => ({
        date: flow.date,
        amount: flow.amount,
        dividend: flow.dividend,
      }));
    }

    if (scheme === "Scheme PMS QAW") {
      const pmsData = await this.getPMSData();
      return pmsData.cashFlows;
    }

    if (scheme === "Total Portfolio") {
      const schemes = ["Scheme B", "Scheme PMS QAW"];
      let cashFlows: CashFlow[] = [];

      for (const s of schemes) {
        const systemTag = s === "Scheme B" ? "Zerodha Total Portfolio" : PortfolioApi.getSystemTag(s);
        if (s === "Scheme B") {
          const schemeCashFlows = await prisma.master_sheet.findMany({
            where: {
              qcode,
              system_tag: systemTag,
              capital_in_out: { not: null, not: new Decimal(0) },
            },
            select: { date: true, capital_in_out: true },
            orderBy: { date: "asc" },
          });
          cashFlows = cashFlows.concat(
            schemeCashFlows.map(entry => ({
              date: PortfolioApi.normalizeDate(entry.date)!,
              amount: entry.capital_in_out!.toNumber(),
              dividend: 0,
            }))
          );
        }
      }

      const pmsData = await this.getPMSData();
      cashFlows = cashFlows.concat(pmsData.cashFlows);

      return cashFlows.sort((a, b) => a.date.localeCompare(b.date));
    }

    const systemTag = scheme === "Scheme B" ? "Zerodha Total Portfolio" : PortfolioApi.getSystemTag(scheme);

    const cashFlows = await prisma.master_sheet.findMany({
      where: {
        qcode,
        system_tag: systemTag,
        capital_in_out: { not: null, not: new Decimal(0) },
      },
      select: { date: true, capital_in_out: true },
      orderBy: { date: "asc" },
    });

    let flows = cashFlows.map(entry => ({
      date: PortfolioApi.normalizeDate(entry.date)!,
      amount: entry.capital_in_out!.toNumber(),
      dividend: 0,
    }));

   return flows;
  }

  private static calculateDrawdownMetrics(navData: { date: string; nav: number }[]): DrawdownMetrics {
    if (!navData || navData.length === 0) return { currentDD: 0, mdd: 0, ddCurve: [] };
    let peak = navData[0].nav;
    let mdd = 0;
    const ddCurve: { date: string; drawdown: number }[] = [];
    navData.forEach(point => {
      if (point.nav > peak) peak = point.nav;
      const drawdown = ((peak - point.nav) / peak) * 100;
      mdd = Math.max(mdd, drawdown);
      ddCurve.push({ date: point.date, drawdown });
    });
    return { currentDD: ddCurve[ddCurve.length - 1]?.drawdown || 0, mdd, ddCurve };
  }

 private static async calculateTrailingReturns(
    qcode: string,
    scheme: string,
    drawdownMetrics?: DrawdownMetrics,
    periods: Record<string, number | null> = {
      "5d": 5,
      "10d": 10,
      "15d": 15,
      "1m": 30,
      "3m": 90,
      "6m": 180,
      "1y": 366,
      "2y": 731,
      "sinceInception": null,
    }
  ): Promise<Record<string, number | null | string>> {

    if (qcode === "QAC00041" && this.SARLA_HARDCODED_DATA[scheme]) {
    return this.SARLA_HARDCODED_DATA[scheme].data.trailingReturns;
  }
    const navData = await PortfolioApi.getHistoricalData(qcode, scheme);

    if (!navData || navData.length === 0) {
      console.warn(`No NAV data found for ${scheme} in trailing returns calculation`);
      return {
        MDD: drawdownMetrics?.mdd.toFixed(2) || "0.00",
        currentDD: drawdownMetrics?.currentDD.toFixed(2) || "0.00",
      };
    }

    const normalizedNavData = navData
      .filter(item => PortfolioApi.normalizeDate(item.date))
      .map(item => ({
        date: PortfolioApi.normalizeDate(item.date)!,
        nav: item.nav,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const lastNav = normalizedNavData[normalizedNavData.length - 1]?.nav;
    const currentDate = normalizedNavData[normalizedNavData.length - 1]?.date;
    const oldestDate = normalizedNavData[0]?.date;

    if (!currentDate || lastNav === undefined) {
      console.warn(`Invalid current date or last NAV for ${scheme}`);
      return {
        MDD: drawdownMetrics?.mdd.toFixed(2) || "0.00",
        currentDD: drawdownMetrics?.currentDD.toFixed(2) || "0.00",
      };
    }

    const dataRangeDays = (new Date(currentDate).getTime() - new Date(oldestDate).getTime()) / (1000 * 60 * 60 * 24);
    const returns: Record<string, number | null | string> = {};

    for (const [period, targetCount] of Object.entries(periods)) {
      if (period === "sinceInception") {
        if (HARDCODED_SINCE_INCEPTION_RETURNS.AC5[scheme]) {
          returns[period] = HARDCODED_SINCE_INCEPTION_RETURNS.AC5[scheme].toFixed(2);
        } else {
          const oldestEntry = normalizedNavData[0];
          if (oldestEntry) {
            const years = (new Date(currentDate).getTime() - new Date(oldestEntry.date).getTime()) / (365 * 24 * 60 * 60 * 1000);
            returns[period] = years < 1
              ? ((lastNav - oldestEntry.nav) / oldestEntry.nav) * 100
              : (Math.pow(lastNav / oldestEntry.nav, 1 / years) - 1) * 100;
          } else {
            returns[period] = null;
          }
        }
        continue;
      }

      const requiredDays = targetCount as number;
      if (requiredDays > dataRangeDays) {
        returns[period] = null;
        continue;
      }

      // Fix: Use consistent day-based calculation for all periods
      let targetDate = new Date(currentDate);
      targetDate.setDate(targetDate.getDate() - requiredDays);

      if (targetDate < new Date(oldestDate)) {
        returns[period] = null;
        continue;
      }

      const targetTime = targetDate.getTime();
      let candidate = null;

      for (const dataPoint of normalizedNavData) {
        const dataTime = new Date(dataPoint.date).getTime();
        if (dataTime <= targetTime) {
          if (!candidate || dataTime > new Date(candidate.date).getTime()) {
            candidate = { nav: dataPoint.nav, date: new Date(dataPoint.date) };
          }
        }
      }

      if (!candidate) {
        let minDiff = Infinity;
        for (const dataPoint of normalizedNavData) {
          const dataTime = new Date(dataPoint.date).getTime();
          const diff = dataTime - targetTime;
          if (diff > 0 && diff < minDiff) {
            minDiff = diff;
            candidate = { nav: dataPoint.nav, date: new Date(dataPoint.date) };
          }
        }
      }

      if (candidate) {
        const candidateTime = new Date(candidate.date).getTime();
        const daysDiff = Math.abs(candidateTime - targetTime) / (1000 * 60 * 60 * 24);
        const maxAllowedDiff = requiredDays <= 30 ? 7 : 30;

        if (daysDiff > maxAllowedDiff) {
          returns[period] = null;
          continue;
        }

        const durationYears = (new Date(currentDate).getTime() - candidate.date.getTime()) / (365 * 24 * 60 * 60 * 1000);
        let returnValue: number;
        if (durationYears >= 1) {
          returnValue = (Math.pow(lastNav / candidate.nav, 1 / durationYears) - 1) * 100;
        } else {
          returnValue = ((lastNav - candidate.nav) / candidate.nav) * 100;
        }
        returns[period] = returnValue;
      } else {
        returns[period] = null;
      }
    }

    returns["MDD"] = drawdownMetrics?.mdd.toFixed(2) || "0.00";
    returns["currentDD"] = drawdownMetrics?.currentDD.toFixed(2) || "0.00";

    return returns;
  }

  private static getMonthName(month: number): string {
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return monthNames[month];
  }

  private static async calculateMonthlyPnL(qcode: string, scheme: string): Promise<MonthlyPnL> {
    if (qcode === "QAC00041" && this.SARLA_HARDCODED_DATA[scheme]) {
      return this.SARLA_HARDCODED_DATA[scheme].data.monthlyPnl;
    }
    if (scheme === "Total Portfolio") {
      const schemes = ["Scheme B", "Scheme PMS QAW"];
      const allData: { date: string; nav: number; pnl: number; capitalInOut: number }[] = [];

      // Fetch data for Scheme B
      const schemeBData = await PortfolioApi.getHistoricalData(qcode, "Scheme B");
      allData.push(...schemeBData.map(item => ({
        date: PortfolioApi.normalizeDate(item.date)!,
        nav: item.nav,
        pnl: item.pnl,
        capitalInOut: item.capitalInOut,
      })));

      // Fetch data for Scheme PMS QAW
      const pmsData = await PortfolioApi.getPMSData();
      allData.push(...pmsData.historicalData.map(item => ({
        date: item.date,
        nav: item.nav,
        pnl: item.pnl,
        capitalInOut: item.capitalInOut,
      })));

      if (!allData.length) {
        return {};
      }

      // Sort and group data by year-month
      const sortedNavData = allData
        .filter(entry => entry.date)
        .sort((a, b) => a.date.localeCompare(b.date));

      const monthlyData: { [yearMonth: string]: { entries: { date: string; nav: number; pnl: number; capitalInOut: number }[] } } = {};

      sortedNavData.forEach(entry => {
        const [year, month] = entry.date.split("-").map(Number);
        const yearMonth = `${year}-${String(month).padStart(2, "0")}`;
        if (!monthlyData[yearMonth]) {
          monthlyData[yearMonth] = { entries: [] };
        }
        monthlyData[yearMonth].entries.push(entry);
      });

      const formattedMonthlyPnl: MonthlyPnL = {};
      const sortedYearMonths = Object.keys(monthlyData).sort((a, b) => a.localeCompare(b));

      sortedYearMonths.forEach((yearMonth, index) => {
        const [year, month] = yearMonth.split("-").map(Number);
        const monthName = PortfolioApi.getMonthName(month - 1);
        const entries = monthlyData[yearMonth].entries;

        if (entries.length === 0) return;

        // Aggregate PNL and capitalInOut for the month
        const totalCapitalInOut = entries.reduce((sum, entry) => sum + entry.capitalInOut, 0);
        const totalCashPnL = entries.reduce((sum, entry) => sum + entry.pnl, 0);

        // Calculate NAV for percentage return
        let startNav = entries[0].nav;
        if (index > 0) {
          const prevYearMonth = sortedYearMonths[index - 1];
          const prevEntries = monthlyData[prevYearMonth].entries;
          if (prevEntries.length > 0) {
            startNav = prevEntries[prevEntries.length - 1].nav;
          }
        }

        const endNav = entries[entries.length - 1].nav;

        if (!formattedMonthlyPnl[year]) {
          formattedMonthlyPnl[year] = {
            months: {},
            totalPercent: 0,
            totalCash: 0,
            totalCapitalInOut: 0,
          };
        }

        const percent = startNav > 0 ? (((endNav - startNav) / startNav) * 100).toFixed(2) : "-";

        formattedMonthlyPnl[year].months[monthName] = {
          percent,
          cash: totalCashPnL.toFixed(2),
          capitalInOut: totalCapitalInOut.toFixed(2),
        };

        formattedMonthlyPnl[year].totalCash += totalCashPnL;
        formattedMonthlyPnl[year].totalCapitalInOut += totalCapitalInOut;

      });

      Object.keys(formattedMonthlyPnl).forEach(year => {
        const monthOrder = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const monthNames = Object.keys(formattedMonthlyPnl[year].months);
        const sortedMonths = monthNames.sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b));

        let compoundedReturn = 1;
        let hasValidData = false;

        sortedMonths.forEach(month => {
          const monthPercentStr = formattedMonthlyPnl[year].months[month].percent;
          if (monthPercentStr !== "-") {
            const monthReturn = Number(monthPercentStr) / 100;
            compoundedReturn *= 1 + monthReturn;
            hasValidData = true;
          }
        });

        if (hasValidData && compoundedReturn !== 1) {
          formattedMonthlyPnl[year].totalPercent = Number(((compoundedReturn - 1) * 100).toFixed(2));
        } else if (hasValidData && compoundedReturn === 1) {
          formattedMonthlyPnl[year].totalPercent = 0;
        } else {
          formattedMonthlyPnl[year].totalPercent = "-" as any;
        }

        formattedMonthlyPnl[year].totalCash = Number(formattedMonthlyPnl[year].totalCash.toFixed(2));
        formattedMonthlyPnl[year].totalCapitalInOut = Number(formattedMonthlyPnl[year].totalCapitalInOut.toFixed(2));

      });

      return formattedMonthlyPnl;
    }

    // For other schemes
    const navData = await PortfolioApi.getHistoricalData(qcode, scheme);
    if (!navData || navData.length === 0) {
      return {};
    }

    const sortedNavData = navData
      .map(entry => ({ ...entry, date: PortfolioApi.normalizeDate(entry.date) }))
      .filter(entry => entry.date)
      .sort((a, b) => a.date!.localeCompare(b.date!));

    const monthlyData: { [yearMonth: string]: { entries: { date: string; nav: number; pnl: number; capitalInOut: number }[] } } = {};

    sortedNavData.forEach(entry => {
      const [year, month] = entry.date!.split("-").map(Number);
      const yearMonth = `${year}-${String(month).padStart(2, "0")}`;
      if (!monthlyData[yearMonth]) {
        monthlyData[yearMonth] = { entries: [] };
      }
      monthlyData[yearMonth].entries.push(entry);
    });

    const formattedMonthlyPnl: MonthlyPnL = {};
    const sortedYearMonths = Object.keys(monthlyData).sort((a, b) => a.localeCompare(b));

    sortedYearMonths.forEach((yearMonth, index) => {
      const [year, month] = yearMonth.split("-").map(Number);
      const monthName = PortfolioApi.getMonthName(month - 1);
      const entries = monthlyData[yearMonth].entries;

      if (entries.length === 0) return;

      const totalCapitalInOut = entries.reduce((sum, entry) => sum + entry.capitalInOut, 0);
      const totalCashPnL = entries.reduce((sum, entry) => sum + entry.pnl, 0);

      let startNav = entries[0].nav;
      if (index > 0) {
        const prevYearMonth = sortedYearMonths[index - 1];
        const prevEntries = monthlyData[prevYearMonth].entries;
        if (prevEntries.length > 0) {
          startNav = prevEntries[prevEntries.length - 1].nav;
        }
      }

      const endNav = entries[entries.length - 1].nav;

      if (!formattedMonthlyPnl[year]) {
        formattedMonthlyPnl[year] = {
          months: {},
          totalPercent: 0,
          totalCash: 0,
          totalCapitalInOut: 0,
        };
      }

      const percent = startNav > 0 ? (((endNav - startNav) / startNav) * 100).toFixed(2) : "-";

      formattedMonthlyPnl[year].months[monthName] = {
        percent,
        cash: totalCashPnL.toFixed(2),
        capitalInOut: totalCapitalInOut.toFixed(2),
      };

      formattedMonthlyPnl[year].totalCash += totalCashPnL;
      formattedMonthlyPnl[year].totalCapitalInOut += totalCapitalInOut;


    });

    Object.keys(formattedMonthlyPnl).forEach(year => {
      const monthOrder = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const monthNames = Object.keys(formattedMonthlyPnl[year].months);
      const sortedMonths = monthNames.sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b));

      let compoundedReturn = 1;
      let hasValidData = false;

      sortedMonths.forEach(month => {
        const monthPercentStr = formattedMonthlyPnl[year].months[month].percent;
        if (monthPercentStr !== "-") {
          const monthReturn = Number(monthPercentStr) / 100;
          compoundedReturn *= 1 + monthReturn;
          hasValidData = true;
        }
      });

      if (hasValidData && compoundedReturn !== 1) {
        formattedMonthlyPnl[year].totalPercent = Number(((compoundedReturn - 1) * 100).toFixed(2));
      } else if (hasValidData && compoundedReturn === 1) {
        formattedMonthlyPnl[year].totalPercent = 0;
      } else {
        formattedMonthlyPnl[year].totalPercent = "-" as any;
      }

      formattedMonthlyPnl[year].totalCash = Number(formattedMonthlyPnl[year].totalCash.toFixed(2));
      formattedMonthlyPnl[year].totalCapitalInOut = Number(formattedMonthlyPnl[year].totalCapitalInOut.toFixed(2));

    });

    return formattedMonthlyPnl;
  }

  private static async calculateQuarterlyPnLWithDailyPL(
    qcode: string,
    scheme: string,
    navData: { date: string; nav: number; pnl: number }[]
  ): Promise<QuarterlyPnL> {
    if (qcode === "QAC00041" && this.SARLA_HARDCODED_DATA[scheme]) {
      return this.SARLA_HARDCODED_DATA[scheme].data.quarterlyPnl;
    }
    if (scheme === "Total Portfolio") {
      // Get PMS data
      const pmsData = await this.getPMSData();
      const pmsQuarterlyPnl = this.calculateQuarterlyPnLFromNavData(
        pmsData.historicalData.map(d => ({
          date: d.date,
          nav: d.nav,
          pnl: d.pnl,
        }))
      );

      // Get Scheme B data
      const schemeBData = await PortfolioApi.getHistoricalData(qcode, "Scheme B");
      const schemeBQuarterlyPnl = this.calculateQuarterlyPnLFromNavData(
        schemeBData.map(d => ({
          date: PortfolioApi.normalizeDate(d.date)!,
          nav: d.nav,
          pnl: d.pnl,
        }))
      );



      const combinedQuarterlyPnL: QuarterlyPnL = {};

      // Helper function to check if a period is after Q2 2025
      const isAfterQ2_2025 = (year: string, quarter?: string): boolean => {
        const yearNum = parseInt(year);
        if (yearNum > 2025) return true;
        if (yearNum === 2025 && quarter) {
          const quarterNum = parseInt(quarter.replace('q', ''));
          return quarterNum > 2;
        }
        return false;
      };

      // First, add hardcoded values for periods up to Q2 2025
      Object.entries(AC5_QUARTERLY_PNL).forEach(([year, quarters]) => {
        combinedQuarterlyPnL[year] = {
          percent: { q1: "-", q2: "-", q3: "-", q4: "-", total: "-" },
          cash: {
            q1: quarters.Q1 ? quarters.Q1.toFixed(2) : "-",
            q2: quarters.Q2 ? quarters.Q2.toFixed(2) : "-",
            q3: quarters.Q3 ? quarters.Q3.toFixed(2) : "-",
            q4: quarters.Q4 ? quarters.Q4.toFixed(2) : "-",
            total: quarters.total ? quarters.total.toFixed(2) : "-",
          },
          yearCash: quarters.total ? quarters.total.toFixed(2) : "-",
        };
      });

      // Get all unique years from both PMS and Scheme B data
      const allYears = new Set([
        ...Object.keys(pmsQuarterlyPnl),
        ...Object.keys(schemeBQuarterlyPnl),
        ...Object.keys(combinedQuarterlyPnL)
      ]);

      // Process each year
      allYears.forEach(year => {
        if (!combinedQuarterlyPnL[year]) {
          combinedQuarterlyPnL[year] = {
            percent: { q1: "-", q2: "-", q3: "-", q4: "-", total: "-" },
            cash: { q1: "-", q2: "-", q3: "-", q4: "-", total: "-" },
            yearCash: "-",
          };
        }

        const quarters = ["q1", "q2", "q3", "q4"] as const;
        let yearTotal = 0;

        quarters.forEach(quarter => {
          const shouldUseDynamicCalculation = isAfterQ2_2025(year, quarter);

          if (shouldUseDynamicCalculation) {
            // Use dynamic calculation (sum of PMS and Scheme B)
            const pmsValue = pmsQuarterlyPnl[year]?.cash[quarter]
              ? parseFloat(pmsQuarterlyPnl[year].cash[quarter])
              : 0;
            const schemeBValue = schemeBQuarterlyPnl[year]?.cash[quarter]
              ? parseFloat(schemeBQuarterlyPnl[year].cash[quarter])
              : 0;

            const combinedValue = pmsValue + schemeBValue;
            combinedQuarterlyPnL[year].cash[quarter] = combinedValue.toFixed(2);

          } else {
            // Use existing hardcoded values or add PMS to existing AC5 values
            let existingValue = parseFloat(combinedQuarterlyPnL[year].cash[quarter]);

            // For periods up to Q2 2025, still add PMS data if available
            if (pmsQuarterlyPnl[year]?.cash[quarter]) {
              let pmsValue = parseFloat(pmsQuarterlyPnl[year].cash[quarter]);

              // Special handling for Q2 2025 PMS value
              if (year === "2025" && quarter === "q2") {
                pmsValue = PMS_QAW_Q2_2025_VALUE;
              }

              const combinedValue = existingValue + pmsValue;
              combinedQuarterlyPnL[year].cash[quarter] = combinedValue.toFixed(2);

            }
          }

          yearTotal += parseFloat(combinedQuarterlyPnL[year].cash[quarter]);
        });

        // Update year totals
        combinedQuarterlyPnL[year].cash.total = yearTotal.toFixed(2);
        combinedQuarterlyPnL[year].yearCash = yearTotal.toFixed(2);

      });

      return combinedQuarterlyPnL;
    }

    // Rest of the method remains the same for other schemes...
    if (scheme === "Scheme PMS QAW") {
      const pmsQuarterlyPnl = this.calculateQuarterlyPnLFromNavData(navData);


      if (pmsQuarterlyPnl["2025"]) {
        pmsQuarterlyPnl["2025"].cash.q2 = PMS_QAW_Q2_2025_VALUE.toFixed(2);
        const quarters = ["q1", "q2", "q3", "q4"] as const;
        const newTotal = quarters.reduce((sum, quarter) => sum + parseFloat(pmsQuarterlyPnl["2025"].cash[quarter] || "0.00"), 0);
        pmsQuarterlyPnl["2025"].cash.total = newTotal.toFixed(2);
        pmsQuarterlyPnl["2025"].yearCash = newTotal.toFixed(2);

      }

      return pmsQuarterlyPnl;
    }

    // if (scheme === "Scheme A") {
    //   const quarterlyPnl: QuarterlyPnL = {};
    //   Object.entries(AC5_SCHEME_A_QUARTERLY_PNL).forEach(([year, quarters]) => {
    //     quarterlyPnl[year] = {
    //       percent: {
    //         q1: quarters.Q1?.percent?.toFixed(2) || "-",
    //         q2: quarters.Q2?.percent?.toFixed(2) || "-",
    //         q3: quarters.Q3?.percent?.toFixed(2) || "-",
    //         q4: quarters.Q4?.percent?.toFixed(2) || "-",
    //         total: quarters.total?.percent?.toFixed(2) || "-",
    //       },
    //       cash: {
    //         q1: quarters.Q1?.cash ? quarters.Q1.cash.toFixed(2) : "0.00",
    //         q2: quarters.Q2?.cash ? quarters.Q2.cash.toFixed(2) : "0.00",
    //         q3: quarters.Q3?.cash ? quarters.Q3.cash.toFixed(2) : "0.00",
    //         q4: quarters.Q4?.cash ? quarters.Q4.cash.toFixed(2) : "0.00",
    //         total: quarters.total?.cash ? quarters.total.cash.toFixed(2) : "0.00",
    //       },
    //       yearCash: quarters.total?.cash ? quarters.total.cash.toFixed(2) : "0.00",
    //     };

    //   });

    //   return quarterlyPnl;
    // }

    const systemTag = PortfolioApi.getSystemTag(scheme);

    const portfolioValues = await prisma.master_sheet.findMany({
      where: { qcode, system_tag: systemTag, portfolio_value: { not: null } },
      select: { date: true, portfolio_value: true, daily_p_l: true },
      orderBy: { date: "asc" },
    });

    if (!portfolioValues.length) return {};

    const sortedNavData = navData
      .map(entry => ({ ...entry, date: PortfolioApi.normalizeDate(entry.date) }))
      .filter(entry => entry.date)
      .sort((a, b) => a.date!.localeCompare(b.date!));

    const quarterlyPnl = this.calculateQuarterlyPnLFromNavData(sortedNavData);
    return quarterlyPnl;
  }

  private static calculateQuarterlyPnLFromNavData(navData: { date: string; nav: number; pnl: number }[]): QuarterlyPnL {
    const getQuarter = (month: number): string => {
      if (month < 3) return "q1";
      if (month < 6) return "q2";
      if (month < 9) return "q3";
      return "q4";
    };

    const getQuarterNumber = (quarter: string): number => {
      const quarterMap = { q1: 1, q2: 2, q3: 3, q4: 4 };
      return quarterMap[quarter];
    };

    const quarterlyData: { [yearQuarter: string]: { cash: number; entries: { date: string; nav: number; pnl: number }[] } } = {};
    navData.forEach(entry => {
      const date = new Date(entry.date);
      const year = date.getUTCFullYear();
      const quarter = getQuarter(date.getUTCMonth());
      const yearQuarter = `${year}-${quarter}`;

      if (!quarterlyData[yearQuarter]) {
        quarterlyData[yearQuarter] = { cash: 0, entries: [] };
      }
      quarterlyData[yearQuarter].entries.push(entry);
      quarterlyData[yearQuarter].cash += entry.pnl;
    });

    const formattedQuarterlyPnl: QuarterlyPnL = {};

    const sortedYearQuarters = Object.keys(quarterlyData).sort((a, b) => {
      const [yearA, quarterA] = a.split("-");
      const [yearB, quarterB] = b.split("-");
      const yearCompare = parseInt(yearA) - parseInt(yearB);
      if (yearCompare !== 0) return yearCompare;
      return getQuarterNumber(quarterA) - getQuarterNumber(quarterB);
    });

    const yearlyQuarters: { [year: string]: string[] } = {};
    sortedYearQuarters.forEach(yearQuarter => {
      const [year] = yearQuarter.split("-");
      if (!yearlyQuarters[year]) yearlyQuarters[year] = [];
      yearlyQuarters[year].push(yearQuarter);
    });

    Object.keys(yearlyQuarters).forEach(year => {
      formattedQuarterlyPnl[year] = {
        percent: { q1: "-", q2: "-", q3: "-", q4: "-", total: "-" },
        cash: { q1: "-", q2: "-", q3: "-", q4: "-", total: "-" },
        yearCash: "-",
      };

      let yearCompoundedReturn = 1;
      let yearTotalCash = 0;
      let hasValidYearData = false;

      yearlyQuarters[year].forEach((yearQuarter, quarterIndex) => {
        const [, quarter] = yearQuarter.split("-");
        const entries = quarterlyData[yearQuarter].entries;

        if (entries.length > 0) {
          let startNav = entries[0].nav;

          if (quarterIndex > 0) {
            const prevYearQuarter = yearlyQuarters[year][quarterIndex - 1];
            const prevEntries = quarterlyData[prevYearQuarter].entries;
            if (prevEntries.length > 0) {
              startNav = prevEntries[prevEntries.length - 1].nav;
            }
          } else if (year !== sortedYearQuarters[0].split("-")[0]) {
            const prevYear = (parseInt(year) - 1).toString();
            const prevQ4 = `${prevYear}-q4`;
            if (quarterlyData[prevQ4] && quarterlyData[prevQ4].entries.length > 0) {
              const prevQ4Entries = quarterlyData[prevQ4].entries;
              startNav = prevQ4Entries[prevQ4Entries.length - 1].nav;
            }
          }

          const endEntry = entries[entries.length - 1];
          const endNav = endEntry.nav;
          const totalCash = entries.reduce((sum, entry) => sum + entry.pnl, 0);

          const quarterReturn = startNav > 0 ? ((endNav - startNav) / startNav) * 100 : 0;

          if (quarterReturn !== 0) {
            formattedQuarterlyPnl[year].percent[quarter] = quarterReturn.toFixed(2);
            yearCompoundedReturn *= 1 + quarterReturn / 100;
            hasValidYearData = true;
          } else {
            formattedQuarterlyPnl[year].percent[quarter] = "-";
          }

          formattedQuarterlyPnl[year].cash[quarter] = totalCash.toFixed(2);
          yearTotalCash += totalCash;


        }
      });

      if (hasValidYearData && yearCompoundedReturn !== 1) {
        formattedQuarterlyPnl[year].percent.total = ((yearCompoundedReturn - 1) * 100).toFixed(2);
      } else if (hasValidYearData && yearCompoundedReturn === 1) {
        formattedQuarterlyPnl[year].percent.total = "-";
      }

      formattedQuarterlyPnl[year].cash.total = yearTotalCash.toFixed(2);
      formattedQuarterlyPnl[year].yearCash = yearTotalCash.toFixed(2);
    });

    return formattedQuarterlyPnl;
  }

  private static getPortfolioNames(accountCode: string, scheme: string): any {
    if (!PORTFOLIO_MAPPING[accountCode]?.[scheme]) {
      throw new Error(`Invalid account code (${accountCode}) or scheme (${scheme})`);
    }
    return {
      ...PORTFOLIO_MAPPING[accountCode][scheme],
      isActive: PORTFOLIO_MAPPING[accountCode][scheme].isActive,
    };
  }

  public static async GET(request: Request): Promise<NextResponse> {
    try {
      let results: Record<string, PortfolioResponse> = {};
      const accountCode = "AC5";
      const allSchemes = Object.keys(PORTFOLIO_MAPPING[accountCode]).filter(s => s !== "Scheme PMS-QAW");

      const prioritySchemes = ["Total Portfolio", "Scheme B", "Scheme PMS QAW"];
      const remainingSchemes = allSchemes.filter(s => !prioritySchemes.includes(s));
      const schemes = [...prioritySchemes, ...remainingSchemes];


      for (const scheme of schemes) {
        const qcode = `QAC00041`;
        const portfolioNames = PortfolioApi.getPortfolioNames(accountCode, scheme);
        const systemTag = PortfolioApi.getSystemTag(scheme);


        let cashInOutData, masterSheetData;

        if (scheme === "Scheme PMS QAW") {
          cashInOutData = [];
          masterSheetData = [];
        } else {
          [cashInOutData, masterSheetData] = await Promise.all([
            prisma.master_sheet.findMany({
              where: { qcode, system_tag: systemTag, capital_in_out: { not: null } },
              select: { date: true, capital_in_out: true },
              orderBy: { date: "asc" },
            }),
            prisma.master_sheet.findMany({
              where: { qcode, system_tag: systemTag },
              select: { date: true, nav: true, drawdown: true, portfolio_value: true, daily_p_l: true, pnl: true, capital_in_out: true },
              orderBy: { date: "asc" },
            }),
          ]);
        }
        const investedAmount = await PortfolioApi.getAmountDeposited(qcode, scheme);
        const latestExposure = await PortfolioApi.getLatestExposure(qcode, scheme);
        const totalProfit = await PortfolioApi.getTotalProfit(qcode, scheme);
        const returns = await PortfolioApi.getPortfolioReturns(qcode, scheme);
        const historicalData = await PortfolioApi.getHistoricalData(qcode, scheme);
        const cashFlows = await PortfolioApi.getCashFlows(qcode, scheme, accountCode);
        const drawdownMetrics = PortfolioApi.calculateDrawdownMetrics(historicalData.map(d => ({ date: PortfolioApi.normalizeDate(d.date)!, nav: d.nav })));
        const trailingReturns = await PortfolioApi.calculateTrailingReturns(qcode, scheme, drawdownMetrics);
        const monthlyPnl = await PortfolioApi.calculateMonthlyPnL(qcode, scheme);
        const quarterlyPnl = await PortfolioApi.calculateQuarterlyPnLWithDailyPL(
          qcode,
          scheme,
          historicalData.map(d => ({
            date: PortfolioApi.normalizeDate(d.date)!,
            nav: d.nav,
            pnl: d.pnl,
          }))
        );


        const portfolioData: PortfolioData = {
          amountDeposited: investedAmount.toFixed(2),
          currentExposure: latestExposure?.portfolioValue.toFixed(2) || "0",
          return: returns.toFixed(2),
          totalProfit: totalProfit.toFixed(2),
          trailingReturns,
          drawdown: drawdownMetrics.currentDD.toFixed(2),
          maxDrawdown: drawdownMetrics.mdd.toFixed(2),
          equityCurve: historicalData.map(d => ({ date: PortfolioApi.normalizeDate(d.date)!, nav: d.nav })),
          drawdownCurve: drawdownMetrics.ddCurve,
          quarterlyPnl,
          monthlyPnl,
          cashFlows,
          strategyName: scheme,
        };

        const metadata: Metadata = {
          icode: `${scheme}`,
          accountCount: 1,
          lastUpdated: new Date().toISOString(),
          filtersApplied: {
            accountType: null,
            broker: null,
            startDate: null,
            endDate: null,
          },
          inceptionDate: scheme === "Scheme PMS QAW" ? "2024-01-01" : "2024-03-18",
          dataAsOfDate: latestExposure?.date.toISOString().split("T")[0] || "2025-07-18",
          strategyName: scheme,
          isActive: portfolioNames.isActive,
        };

        results = {
          ...results,
          [scheme]: { data: portfolioData, metadata },
        };
      }
      return NextResponse.json(results, { status: 200 });
    } catch (error) {
      console.error("Sarla Portfolio API Error:", error);
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