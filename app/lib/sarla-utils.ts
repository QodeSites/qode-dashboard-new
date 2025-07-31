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

// Additional value to add to Scheme A portfolio returns
const SCHEME_A_ADDITIONAL_VALUE = 10370149.13;

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

// Hardcoded AC5 Scheme A quarterly P&L values with percentages
const AC5_SCHEME_A_QUARTERLY_PNL = {
  "2022": {
    Q3: { cash: -1609424.1, percent: -15.2 },
    Q4: { cash: 176694.7, percent: 2.1 },
    total: { cash: -1432729.4, percent: -13.5 },
  },
  "2023": {
    Q1: { cash: -395793.6, percent: -4.7 },
    Q2: { cash: 2672374.2, percent: 34.2 },
    Q3: { cash: 6690923.8, percent: 52.1 },
    Q4: { cash: 13138234.8, percent: 46.3 },
    total: { cash: 22105739.2, percent: 262.9 },
  },
  "2024": {
    Q1: { cash: 3266707.5, percent: 18.7 },
    Q2: { cash: 16847614.5, percent: 78.2 },
    Q3: { cash: 14142910.4, percent: 42.8 },
    Q4: { cash: 12837438.5, percent: 28.9 },
    total: { cash: 47094671.0, percent: 560.2 },
  },
  "2025": {
    Q1: { cash: -8038030.0, percent: -12.4 },
    Q2: { cash: 20053523.7, percent: 35.6 },
    total: { cash: 12015493.7, percent: 18.5 },
  },
};

// Hardcoded quarterly P&L for inactive schemes (C, D, E, F)
const HARDCODED_QUARTERLY_PNL = {
  "Scheme C": {
    "2022": {
      Q3: { cash: -245000.0, percent: -2.8 },
      Q4: { cash: 89000.0, percent: 1.0 },
      total: { cash: -156000.0, percent: -1.8 },
    },
    "2023": {
      Q1: { cash: 125000.0, percent: 1.4 },
      Q2: { cash: 567000.0, percent: 6.5 },
      Q3: { cash: 890000.0, percent: 9.8 },
      Q4: { cash: 1230000.0, percent: 12.4 },
      total: { cash: 2812000.0, percent: 32.1 },
    },
    "2024": {
      Q1: { cash: 456000.0, percent: 4.2 },
      Q2: { cash: 789000.0, percent: 7.1 },
      Q3: { cash: 345000.0, percent: 2.9 },
      Q4: { cash: 234000.0, percent: 1.9 },
      total: { cash: 1824000.0, percent: 16.8 },
    },
  },
  "Scheme D": {
    "2022": {
      Q3: { cash: -89000.0, percent: -1.2 },
      Q4: { cash: 45000.0, percent: 0.6 },
      total: { cash: -44000.0, percent: -0.6 },
    },
    "2023": {
      Q1: { cash: 67000.0, percent: 0.9 },
      Q2: { cash: 123000.0, percent: 1.6 },
      Q3: { cash: 178000.0, percent: 2.3 },
      Q4: { cash: 234000.0, percent: 2.9 },
      total: { cash: 602000.0, percent: 7.9 },
    },
  },
  "Scheme E": {
    "2022": {
      Q4: { cash: 123000.0, percent: 1.8 },
      total: { cash: 123000.0, percent: 1.8 },
    },
    "2023": {
      Q1: { cash: 89000.0, percent: 1.3 },
      Q2: { cash: 156000.0, percent: 2.2 },
      Q3: { cash: 234000.0, percent: 3.2 },
      Q4: { cash: 345000.0, percent: 4.6 },
      total: { cash: 824000.0, percent: 11.8 },
    },
  },
  "Scheme F": {
    "2023": {
      Q1: { cash: 45000.0, percent: 0.7 },
      Q2: { cash: 78000.0, percent: 1.2 },
      Q3: { cash: 123000.0, percent: 1.8 },
      Q4: { cash: 167000.0, percent: 2.4 },
      total: { cash: 413000.0, percent: 6.2 },
    },
    "2024": {
      Q1: { cash: 89000.0, percent: 1.2 },
      Q2: { cash: 145000.0, percent: 1.9 },
      total: { cash: 234000.0, percent: 3.1 },
    },
  },
};

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

  private static getCurrentSystemTag(scheme: string): string {
    const systemTagMap: Record<string, string> = {
      "Total Portfolio": "Sarla Performance fibers Scheme Total Portfolio",
      "Scheme B": "Zerodha Total Portfolio",
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
    console.log(`Getting PMS data for account code: ${accountCode}`);

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

    console.log(`Found ${pmsData.length} PMS records`);

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

  private static async getAmountDeposited(qcode: string, scheme: string): Promise<number> {
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

      console.log(`Total Portfolio amount deposited: ${totalDeposited}`);
      return totalDeposited;
    }

    if (scheme === "Scheme PMS QAW") {
      const pmsData = await this.getPMSData();
      console.log(`Scheme PMS QAW amount deposited: ${pmsData.amountDeposited}`);
      return pmsData.amountDeposited;
    }

    if (scheme === "Scheme B") {
      const systemTag = "Zerodha Total Portfolio";
      console.log(`Getting amount deposited for qcode: ${qcode}, systemTag: ${systemTag}`);

      const depositSum = await prisma.master_sheet.aggregate({
        where: {
          qcode,
          system_tag: systemTag,
          capital_in_out: { not: null },
        },
        _sum: { capital_in_out: true },
      });
      const amount = Number(depositSum._sum.capital_in_out) || 0;
      console.log(`Scheme B amount deposited: ${amount}`);
      return amount;
    }

    // For Scheme A, add the additional value
    if (scheme === "Scheme A") {
      const systemTag = this.getSystemTag(scheme);
      const depositSum = await prisma.master_sheet.aggregate({
        where: {
          qcode,
          system_tag: systemTag,
          capital_in_out: { not: null },
        },
        _sum: { capital_in_out: true },
      });
      const baseAmount = Number(depositSum._sum.capital_in_out) || 0;
      const totalAmount = baseAmount + SCHEME_A_ADDITIONAL_VALUE;
      console.log(`Scheme A amount deposited: ${baseAmount} + ${SCHEME_A_ADDITIONAL_VALUE} = ${totalAmount}`);
      return totalAmount;
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

      console.log(`Total Portfolio latest exposure: ${totalPortfolioValue}, drawdown: ${latestDrawdown}, nav: ${latestNav}, date: ${latestDate}`);
      return latestDate ? { portfolioValue: totalPortfolioValue, drawdown: latestDrawdown, nav: latestNav, date: latestDate } : null;
    }

    if (scheme === "Scheme PMS QAW") {
      const pmsData = await this.getPMSData();
      console.log(`Scheme PMS QAW latest exposure: ${pmsData.latestData?.portfolioValue}`);
      return pmsData.latestData;
    }

    if (scheme === "Scheme B") {
      const systemTag = "Zerodha Total Portfolio";
      console.log(`Getting latest exposure for qcode: ${qcode}, systemTag: ${systemTag}`);

      const record = await prisma.master_sheet.findFirst({
        where: { qcode, system_tag: systemTag },
        orderBy: { date: "desc" },
        select: { portfolio_value: true, drawdown: true, nav: true, date: true },
      });
      if (!record) {
        console.log(`No exposure data found for Scheme B, systemTag: ${systemTag}`);
        return null;
      }
      const result = {
        portfolioValue: Number(record.portfolio_value) || 0,
        drawdown: Math.abs(Number(record.drawdown) || 0),
        nav: Number(record.nav) || 0,
        date: record.date,
      };
      console.log(`Scheme B latest exposure: ${result.portfolioValue}, drawdown: ${result.drawdown}, nav: ${result.nav}, date: ${result.date}`);
      return result;
    }

    // For Scheme A, add the additional value to portfolio value
    if (scheme === "Scheme A") {
      const systemTag = PortfolioApi.getSystemTag(scheme);
      console.log(`Getting latest exposure for qcode: ${qcode}, systemTag: ${systemTag}`);

      const record = await prisma.master_sheet.findFirst({
        where: { qcode, system_tag: systemTag },
        orderBy: { date: "desc" },
        select: { portfolio_value: true, drawdown: true, nav: true, date: true },
      });
      if (!record) return null;

      const basePortfolioValue = Number(record.portfolio_value) || 0;
      const totalPortfolioValue = basePortfolioValue + SCHEME_A_ADDITIONAL_VALUE;

      const result = {
        portfolioValue: totalPortfolioValue,
        drawdown: Math.abs(Number(record.drawdown) || 0),
        nav: Number(record.nav) || 0,
        date: record.date,
      };
      console.log(`Scheme A latest exposure: ${basePortfolioValue} + ${SCHEME_A_ADDITIONAL_VALUE} = ${totalPortfolioValue}`);
      return result;
    }

    const systemTag = PortfolioApi.getSystemTag(scheme);
    console.log(`Getting latest exposure for qcode: ${qcode}, systemTag: ${systemTag}`);

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
    if (HARDCODED_SINCE_INCEPTION_RETURNS.AC5[scheme]) {
      console.log(`Using hardcoded since-inception return for ${scheme}: ${HARDCODED_SINCE_INCEPTION_RETURNS.AC5[scheme]}%`);
      return HARDCODED_SINCE_INCEPTION_RETURNS.AC5[scheme];
    }

    if (scheme === "Total Portfolio" || scheme === "Scheme B") {
      const amountDeposited = await PortfolioApi.getAmountDeposited(qcode, scheme);
      const latestExposure = await PortfolioApi.getLatestExposure(qcode, scheme);

      if (!latestExposure || amountDeposited === 0) {
        console.log(`Insufficient data for ${scheme} return calculation. Amount Deposited: ${amountDeposited}, Latest Exposure: ${latestExposure?.portfolioValue}`);
        return 0;
      }

      const currentPortfolioValue = latestExposure.portfolioValue;
      const returnPercentage = ((currentPortfolioValue - amountDeposited) / amountDeposited) * 100;

      console.log(`${scheme} return calculation - Amount Deposited: ${amountDeposited}, Current Portfolio Value: ${currentPortfolioValue}, Return: ${returnPercentage.toFixed(2)}%`);

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

      console.log(`PMS NAV calculation - Initial: ${initialNav}, Final: ${finalNav}, Duration (years): ${durationYears}`);

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
        console.log(`No NAV records found for qcode: ${qcode}, systemTag: ${systemTag}`);
        return 0;
      }

      const initialNav = Number(firstNavRecord.nav) || 0;
      const finalNav = Number(latestNavRecord.nav) || 0;

      const durationYears = (new Date(latestNavRecord.date).getTime() - new Date(firstNavRecord.date).getTime()) / (365 * 24 * 60 * 60 * 1000);

      console.log(`NAV calculation - Initial: ${initialNav}, Final: ${finalNav}, Duration (years): ${durationYears}`);

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

      console.log(`Total Portfolio total profit: ${totalProfit}`);
      return totalProfit;
    }

    const systemTag = PortfolioApi.getSystemTag(scheme);
    console.log(`Getting total profit for qcode: ${qcode}, systemTag: ${systemTag}`);

    const profitSum = await prisma.master_sheet.aggregate({
      where: { qcode, system_tag: systemTag },
      _sum: { pnl: true },
    });
    let profit = Number(profitSum._sum.pnl) || 0;

    // For Scheme A, add the additional value as profit
    if (scheme === "Scheme A") {
      profit += SCHEME_A_ADDITIONAL_VALUE;
      console.log(`Scheme A total profit: ${Number(profitSum._sum.pnl) || 0} + ${SCHEME_A_ADDITIONAL_VALUE} = ${profit}`);
    } else {
      console.log(`Scheme ${scheme} total profit: ${profit}`);
    }

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
    console.log(`Getting historical data for qcode: ${qcode}, systemTag: ${systemTag}`);

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

    console.log(`Found ${data.length} historical records for ${scheme}`);

    return data.map(entry => ({
      date: entry.date,
      nav: Number(entry.nav) || 0,
      drawdown: Math.abs(Number(entry.drawdown) || 0),
      pnl: Number(entry.pnl) || 0,
      capitalInOut: Number(entry.capital_in_out) || 0,
    }));
  }

  private static async getCashFlows(qcode: string, scheme: string, accountCode: string = "AC5"): Promise<CashFlow[]> {
    if (accountCode === "AC8" && HARDCODED_CASH_FLOWS_AC8[scheme]) {
      console.log(`Using hardcoded cash flows for AC8 scheme: ${scheme}`);
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
    console.log(`Getting cash flows for qcode: ${qcode}, systemTag: ${systemTag}`);

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

    // For Scheme A, add the additional value as a cash flow
    if (scheme === "Scheme A" && flows.length > 0) {
      flows.push({
        date: flows[flows.length - 1].date, // Use the same date as the last cash flow
        amount: SCHEME_A_ADDITIONAL_VALUE,
        dividend: 0,
      });
    }

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
        console.log(`Using hardcoded since-inception return for ${scheme}: ${returns[period]}%`);
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

    let targetDate = new Date(currentDate);
    if (["1m", "3m", "6m", "1y", "2y"].includes(period)) {
      const periodMap: Record<string, () => void> = {
        "1m": () => targetDate.setMonth(targetDate.getMonth() - 1),
        "3m": () => targetDate.setMonth(targetDate.getMonth() - 3),
        "6m": () => targetDate.setMonth(targetDate.getMonth() - 6),
        "1y": () => targetDate.setFullYear(targetDate.getFullYear() - 1),
        "2y": () => targetDate.setFullYear(targetDate.getFullYear() - 2),
      };
      periodMap[period]();
    } else {
      targetDate.setDate(targetDate.getDate() - requiredDays);
    }

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

      console.log(
        `[${scheme}] Trailing Return for ${period}: Start NAV (${candidate.date.toISOString().split("T")[0]}) = ${candidate.nav.toFixed(2)}, ` +
        `End NAV (${currentDate}) = ${lastNav.toFixed(2)}, Return = ${returnValue.toFixed(2)}%`
      );

      returns[period] = returnValue;
    } else {
      returns[period] = null;
    }
  }

  returns["MDD"] = drawdownMetrics?.mdd.toFixed(2) || "0.00";
  returns["currentDD"] = drawdownMetrics?.currentDD.toFixed(2) || "0.00";
  console.log(`Trailing returns for ${scheme} with MDD and currentDD:`, returns);

  return returns;
}

  private static getMonthName(month: number): string {
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return monthNames[month];
  }

  private static async calculateMonthlyPnL(qcode: string, scheme: string): Promise<MonthlyPnL> {
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
        console.log(`No historical data found for Total Portfolio`);
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

        console.log(
          `DEBUG Monthly PnL ${yearMonth} for Total Portfolio: ` +
          `startDate=${index > 0 ? sortedNavData.find(e => e.date === monthlyData[sortedYearMonths[index - 1]].entries[monthlyData[sortedYearMonths[index - 1]].entries.length - 1].date)?.date : entries[0].date}, startNav=${startNav.toFixed(4)}; ` +
          `endDate=${entries[entries.length - 1].date}, endNav=${endNav.toFixed(4)}, ` +
          `percent=${percent}, cash=${totalCashPnL.toFixed(2)}, capitalInOut=${totalCapitalInOut.toFixed(2)}`
        );
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

        console.log(`DEBUG Yearly PnL - ${year} for Total Portfolio: totalPercent=${formattedMonthlyPnl[year].totalPercent}%, totalCash=${formattedMonthlyPnl[year].totalCash}`);
      });

      return formattedMonthlyPnl;
    }

    // For other schemes
    const navData = await PortfolioApi.getHistoricalData(qcode, scheme);
    if (!navData || navData.length === 0) {
      console.log(`No historical data found for ${scheme}`);
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

      console.log(
        `DEBUG Monthly PnL ${yearMonth} for ${scheme}: ` +
        `startDate=${index > 0 ? sortedNavData.find(e => e.date === monthlyData[sortedYearMonths[index - 1]].entries[monthlyData[sortedYearMonths[index - 1]].entries.length - 1].date)?.date : entries[0].date}, startNav=${startNav.toFixed(4)}; ` +
        `endDate=${entries[entries.length - 1].date}, endNav=${endNav.toFixed(4)}, ` +
        `percent=${percent}, cash=${totalCashPnL.toFixed(2)}, capitalInOut=${totalCapitalInOut.toFixed(2)}`
      );
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

      console.log(`DEBUG Yearly PnL - ${year} for ${scheme}: totalPercent=${formattedMonthlyPnl[year].totalPercent}%, totalCash=${formattedMonthlyPnl[year].totalCash}`);
    });

    return formattedMonthlyPnl;
  }

  private static async calculateQuarterlyPnLWithDailyPL(
    qcode: string,
    scheme: string,
    navData: { date: string; nav: number; pnl: number }[]
  ): Promise<QuarterlyPnL> {
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

      console.log(`PMS quarterly P&L:`, pmsQuarterlyPnl);
      console.log(`Scheme B quarterly P&L:`, schemeBQuarterlyPnl);

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
            q1: quarters.Q1 ? quarters.Q1.toFixed(2) : "0.00",
            q2: quarters.Q2 ? quarters.Q2.toFixed(2) : "0.00",
            q3: quarters.Q3 ? quarters.Q3.toFixed(2) : "0.00",
            q4: quarters.Q4 ? quarters.Q4.toFixed(2) : "0.00",
            total: quarters.total ? quarters.total.toFixed(2) : "0.00",
          },
          yearCash: quarters.total ? quarters.total.toFixed(2) : "0.00",
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
            cash: { q1: "0.00", q2: "0.00", q3: "0.00", q4: "0.00", total: "0.00" },
            yearCash: "0.00",
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

            console.log(`Dynamic calculation for ${year} ${quarter}: PMS=${pmsValue}, SchemeB=${schemeBValue}, Combined=${combinedValue}`);
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

              console.log(`Hardcoded + PMS for ${year} ${quarter}: Existing=${existingValue}, PMS=${pmsValue}, Combined=${combinedValue}`);
            }
          }

          yearTotal += parseFloat(combinedQuarterlyPnL[year].cash[quarter]);
        });

        // Update year totals
        combinedQuarterlyPnL[year].cash.total = yearTotal.toFixed(2);
        combinedQuarterlyPnL[year].yearCash = yearTotal.toFixed(2);

        console.log(`Total for ${year}: ${yearTotal.toFixed(2)}`);
      });

      return combinedQuarterlyPnL;
    }

    // Rest of the method remains the same for other schemes...
    if (scheme === "Scheme PMS QAW") {
      const pmsQuarterlyPnl = this.calculateQuarterlyPnLFromNavData(navData);

      console.log(`cash pnl for Scheme PMS QAW:`, pmsQuarterlyPnl);

      if (pmsQuarterlyPnl["2025"]) {
        pmsQuarterlyPnl["2025"].cash.q2 = PMS_QAW_Q2_2025_VALUE.toFixed(2);
        const quarters = ["q1", "q2", "q3", "q4"] as const;
        const newTotal = quarters.reduce((sum, quarter) => sum + parseFloat(pmsQuarterlyPnl["2025"].cash[quarter] || "0.00"), 0);
        pmsQuarterlyPnl["2025"].cash.total = newTotal.toFixed(2);
        pmsQuarterlyPnl["2025"].yearCash = newTotal.toFixed(2);

        console.log(`Processing quarterly P&L for year: 2025`, pmsQuarterlyPnl);
        console.log(`Quarterly P&L for 2025:`, {
          schemeTotal: newTotal
        });
      }

      return pmsQuarterlyPnl;
    }

    if (scheme === "Scheme A") {
      const quarterlyPnl: QuarterlyPnL = {};
      Object.entries(AC5_SCHEME_A_QUARTERLY_PNL).forEach(([year, quarters]) => {
        quarterlyPnl[year] = {
          percent: {
            q1: quarters.Q1?.percent?.toFixed(2) || "-",
            q2: quarters.Q2?.percent?.toFixed(2) || "-",
            q3: quarters.Q3?.percent?.toFixed(2) || "-",
            q4: quarters.Q4?.percent?.toFixed(2) || "-",
            total: quarters.total?.percent?.toFixed(2) || "-",
          },
          cash: {
            q1: quarters.Q1?.cash ? quarters.Q1.cash.toFixed(2) : "0.00",
            q2: quarters.Q2?.cash ? quarters.Q2.cash.toFixed(2) : "0.00",
            q3: quarters.Q3?.cash ? quarters.Q3.cash.toFixed(2) : "0.00",
            q4: quarters.Q4?.cash ? quarters.Q4.cash.toFixed(2) : "0.00",
            total: quarters.total?.cash ? quarters.total.cash.toFixed(2) : "0.00",
          },
          yearCash: quarters.total?.cash ? quarters.total.cash.toFixed(2) : "0.00",
        };

        console.log(`cash pnl for Scheme A:`, { [year]: quarterlyPnl[year] });
        console.log(`Processing quarterly P&L for year: ${year}`, quarterlyPnl);
        console.log(`Quarterly P&L for ${year}:`, {
          schemeTotal: parseFloat(quarterlyPnl[year].yearCash),
        });
      });

      return quarterlyPnl;
    }

    const systemTag = PortfolioApi.getSystemTag(scheme);
    console.log(`Getting quarterly P&L for qcode: ${qcode}, systemTag: ${systemTag}`);

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

    Object.entries(quarterlyPnl).forEach(([year, yearData]) => {
      console.log(`cash pnl for scheme ${scheme}:`, { [year]: yearData });
      console.log(`Processing quarterly P&L for year: ${year}`, quarterlyPnl);
      console.log(`Quarterly P&L for ${year}:`, {
        schemeTotal: parseFloat(yearData.yearCash)
      });
    });

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
        cash: { q1: "0.00", q2: "0.00", q3: "0.00", q4: "0.00", total: "0.00" },
        yearCash: "0.00",
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
            formattedQuarterlyPnl[year].percent[quarter] = "0.00";
          }

          formattedQuarterlyPnl[year].cash[quarter] = totalCash.toFixed(2);
          yearTotalCash += totalCash;

          console.log(
            `DEBUG QPnL ${year} ${quarter.toUpperCase()}: ` +
            `Start NAV = ${startNav.toFixed(4)}, End NAV = ${endNav.toFixed(4)}, ` +
            `Return = ${quarterReturn.toFixed(2)}%, Cash PnL = ${totalCash.toFixed(2)}`
          );
        }
      });

      if (hasValidYearData && yearCompoundedReturn !== 1) {
        formattedQuarterlyPnl[year].percent.total = ((yearCompoundedReturn - 1) * 100).toFixed(2);
      } else if (hasValidYearData && yearCompoundedReturn === 1) {
        formattedQuarterlyPnl[year].percent.total = "0.00";
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

      console.log(`Processing schemes in order: ${schemes.join(", ")}`);

      for (const scheme of schemes) {
        const qcode = `QAC00041`;
        const portfolioNames = PortfolioApi.getPortfolioNames(accountCode, scheme);
        const systemTag = PortfolioApi.getSystemTag(scheme);

        console.log(`Processing ${scheme} with qcode: ${qcode}, systemTag: ${systemTag}`);

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

        console.log(`Found ${cashInOutData.length} cash in/out records and ${masterSheetData.length} master sheet records for ${scheme}`);

        const normalizedData = {
          cashInOut: cashInOutData.map(item => ({
            ...item,
            date: PortfolioApi.normalizeDate(item.date)!,
            capital_in_out: Number(item.capital_in_out) || 0,
          })),
          masterSheet: masterSheetData.map(item => ({
            ...item,
            date: PortfolioApi.normalizeDate(item.date)!,
            nav: Number(item.nav) || 0,
            drawdown: Number(item.drawdown) || 0,
            portfolio_value: Number(item.portfolio_value) || 0,
            daily_pl: Number(item.daily_p_l) || 0,
            pnl: Number(item.pnl) || 0,
            capital_in_out: Number(item.capital_in_out) || 0,
          })),
        };

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

        console.log(`Processed data for ${scheme}:`, {
          investedAmount,
          currentExposure: latestExposure?.portfolioValue || 0,
          returns,
          historicalDataPoints: historicalData.length,
          cashFlowsCount: cashFlows.length,
        });

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

      console.log(`Successfully processed ${Object.keys(results).length} schemes`);
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