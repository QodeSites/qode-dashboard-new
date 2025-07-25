import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

interface CashFlow {
  date: string;
  amount: number29;
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
  trailingReturns: Record<string, number | null>;
  drawdown: string;
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
}

interface PortfolioResponse {
  data: PortfolioData;
  metadata: Metadata;
}

const DEFAULT_PAGE_SIZE = 2000;

const PORTFOLIO_MAPPING = {
  AC5: {
    "Scheme B": {
      current: "Zerodha Total Portfolio",
      metrics: "Zerodha Total Portfolio",
      nav: "Zerodha Total Portfolio",
    },
    "Scheme QAW": {
      current: "Zerodha Total Portfolio QAW",
      metrics: "Zerodha Total Portfolio QAW",
      nav: "Zerodha Total Portfolio QAW",
    },
    "Scheme A": {
      current: "Zerodha Total Portfolio A",
      metrics: "Zerodha Total Portfolio A",
      nav: "Zerodha Total Portfolio A",
    },
    "Scheme C": {
      current: "Zerodha Total Portfolio C",
      metrics: "Zerodha Total Portfolio C",
      nav: "Zerodha Total Portfolio C",
    },
    "Scheme D": {
      current: "Zerodha Total Portfolio D",
      metrics: "Zerodha Total Portfolio D",
      nav: "Zerodha Total Portfolio D",
    },
    "Scheme E": {
      current: "Zerodha Total Portfolio E",
      metrics: "Zerodha Total Portfolio E",
      nav: "Zerodha Total Portfolio E",
    },
    "Scheme F": {
      current: "Zerodha Total Portfolio F",
      metrics: "Zerodha Total Portfolio F",
      nav: "Zerodha Total Portfolio F",
    },
    "Total Portfolio": {
      current: "Sarla Performance fibers Scheme Total Portfolio",
      metrics: "Sarla Performance fibers Scheme Total Portfolio",
      nav: "Sarla Performance fibers Scheme Total Portfolio",
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

// Hardcoded AC5 quarterly P&L values with added amounts
const AC5_QUARTERLY_PNL = {
  "2022": {
    Q3: -1609424.1,
    Q4: 176694.73,
    total: -1432729.4
  },
  "2023": {
    Q1: -395793.61,
    Q2: 2672374.193,
    Q3: 5417561.9 + 1273362.0,
    Q4: 13138235,
    total: -395793.61 + 2672374.193 + (5417561.9 + 1273362.0) + 13138235
  },
  "2024": {
    Q1: 2469230.5,
    Q2: 25393463.51,
    Q3: 16982324 + 2881647.1,
    Q4: 31414712,
    total: 2469230.5 + 25393463.51 + (16982324 + 2881647.1) + 31414712
  },
  "2025": {
    Q1: 9538524.5,
    Q2: 76149895.76 + 6215140.1,
    total: 9538524.5 + (76149895.76 + 6215140.1)
  }
};

// Hardcoded AC5 Scheme A quarterly P&L values
const AC5_SCHEME_A_QUARTERLY_PNL = {
  "2022": {
    Q3: -1609424.1,
    Q4: 176694.7,
    total: -1432729.4,
  },
  "2023": {
    Q1: -395793.6,
    Q2: 2672374.2,
    Q3: 6690923.8,
    Q4: 13138234.8,
    total: 22105739.2,
  },
  "2024": {
    Q1: 3266707.5,
    Q2: 16847614.5,
    Q3: 14142910.4,
    Q4: 12837438.5,
    total: 47094671.0,
  },
  "2025": {
    Q1: -8038030.0,
    Q2: 20053523.7,
    total: 12015493.7,
  },
};

export class PortfolioApi {
  private static normalizeDate(date: string | Date): string | null {
    if (!date) return null;
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date;
    }
    const parsed = new Date(date);
    if (!isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
    }
    console.warn(`Invalid date format: ${date}`);
    return null;
  }

  private static getSystemTag(scheme: string): string {
    const systemTagMap: Record<string, string> = {
      "Total Portfolio": "Total Portfolio",
      "Scheme B": "Zerodha Total Portfolio",
      "Scheme QAW": "Zerodha Total Portfolio QAW",
      "Scheme A": "Zerodha Total Portfolio A",
      "Scheme C": "Zerodha Total Portfolio C",
      "Scheme D": "Zerodha Total Portfolio D",
      "Scheme E": "Zerodha Total Portfolio E",
      "Scheme F": "Zerodha Total Portfolio F",
    };
    return systemTagMap[scheme] || `Zerodha Total Portfolio ${scheme}`;
  }

  private static async getAmountDeposited(qcode: string, scheme: string): Promise<number> {
    if (scheme === "Total Portfolio") {
      const schemes = Object.keys(PORTFOLIO_MAPPING.AC5).filter(s => s !== "Total Portfolio" && s !== "Scheme PMS-QAW");
      let totalDeposited = 0;
      for (const s of schemes) {
        if (s !== "Scheme B") continue;
        const systemTag = PortfolioApi.getSystemTag(s);
        const depositSum = await prisma.master_sheet.aggregate({
          where: {
            qcode,
            system_tag: systemTag,
            capital_in_out: { not: null }
          },
          _sum: { capital_in_out: true },
        });
        totalDeposited += Number(depositSum._sum.capital_in_out) || 0;
      }
      return totalDeposited;
    }

    if (scheme !== "Scheme B") {
      return 0;
    }

    const systemTag = PortfolioApi.getSystemTag(scheme);
    console.log(`Getting amount deposited for qcode: ${qcode}, systemTag: ${systemTag}`);

    const depositSum = await prisma.master_sheet.aggregate({
      where: {
        qcode,
        system_tag: systemTag,
        capital_in_out: { not: null }
      },
      _sum: { capital_in_out: true },
    });
    return Number(depositSum._sum.capital_in_out) || 0;
  }

  private static async getLatestExposure(qcode: string, scheme: string): Promise<{ portfolioValue: number; drawdown: number; nav: number; date: Date } | null> {
    if (scheme === "Total Portfolio") {
      const schemes = Object.keys(PORTFOLIO_MAPPING.AC5).filter(s => s !== "Total Portfolio" && s !== "Scheme PMS-QAW");
      let totalPortfolioValue = 0;
      let latestDrawdown = 0;
      let latestNav = 0;
      let latestDate: Date | null = null;

      for (const s of schemes) {
        const systemTag = PortfolioApi.getSystemTag(s);
        const record = await prisma.master_sheet.findFirst({
          where: { qcode, system_tag: systemTag },
          orderBy: { date: "desc" },
          select: { portfolio_value: true, drawdown: true, nav: true, date: true },
        });
        if (record) {
          totalPortfolioValue += (s === "Scheme B" ? Number(record.portfolio_value) : 0) || 0;
          latestDrawdown = Math.abs(Number(record.drawdown) || 0);
          latestNav += Number(record.nav) || 0;
          if (!latestDate || record.date > latestDate) {
            latestDate = record.date;
          }
        }
      }
      return latestDate ? { portfolioValue: totalPortfolioValue, drawdown: latestDrawdown, nav: latestNav, date: latestDate } : null;
    }

    if (scheme !== "Scheme B") {
      const systemTag = PortfolioApi.getSystemTag(scheme);
      const record = await prisma.master_sheet.findFirst({
        where: { qcode, system_tag: systemTag },
        orderBy: { date: "desc" },
        select: { portfolio_value: true, drawdown: true, nav: true, date: true },
      });
      if (!record) return null;
      return {
        portfolioValue: 0,
        drawdown: Math.abs(Number(record.drawdown) || 0),
        nav: Number(record.nav) || 0,
        date: record.date,
      };
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
    if (scheme === "Total Portfolio") {
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

      console.log(`NAV calculation for Total Portfolio - Initial: ${initialNav}, Final: ${finalNav}`);
      return initialNav !== 0 ? ((finalNav / initialNav) - 1) * 100 : 0;
    }

    if (FROZEN_RETURN_VALUES[scheme]) {
      return FROZEN_RETURN_VALUES[scheme];
    }

    try {
      const systemTag = PortfolioApi.getSystemTag(scheme);
      console.log(`Getting portfolio returns for qcode: ${qcode}, systemTag: ${systemTag}`);

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

      console.log(`NAV calculation - Initial: ${initialNav}, Final: ${finalNav}`);
      return initialNav !== 0 ? ((finalNav / initialNav) - 1) * 100 : 0;
    } catch (error) {
      console.error(`Error calculating portfolio returns for qcode ${qcode}, scheme ${scheme}:`, error);
      return 0;
    }
  }

  private static async getTotalProfit(qcode: string, scheme: string): Promise<number> {
    if (scheme === "Total Portfolio") {
      const systemTag = PortfolioApi.getSystemTag(scheme);
      console.log(`Getting total profit for qcode: ${qcode}, systemTag: ${systemTag}`);

      const profitSum = await prisma.master_sheet.aggregate({
        where: { qcode, system_tag: systemTag },
        _sum: { pnl: true },
      });
      return Number(profitSum._sum.pnl) || 0;
    }

    const systemTag = PortfolioApi.getSystemTag(scheme);
    console.log(`Getting total profit for qcode: ${qcode}, systemTag: ${systemTag}`);

    const profitSum = await prisma.master_sheet.aggregate({
      where: { qcode, system_tag: systemTag },
      _sum: { pnl: true },
    });
    return Number(profitSum._sum.pnl) || 0;
  }

  private static async getHistoricalData(qcode: string, scheme: string): Promise<{ date: Date; nav: number; drawdown: number; pnl: number; capitalInOut: number }[]> {
    const systemTag = PortfolioApi.getSystemTag(scheme);
    console.log(`Getting historical data for qcode: ${qcode}, systemTag: ${systemTag}`);

    const data = await prisma.master_sheet.findMany({
      where: {
        qcode,
        system_tag: systemTag,
        nav: { not: null },
        drawdown: { not: null }
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

  private static async getCashFlows(qcode: string, scheme: string): Promise<CashFlow[]> {
    if (scheme === "Total Portfolio") {
      const schemes = Object.keys(PORTFOLIO_MAPPING.AC5).filter(s => s !== "Total Portfolio" && s !== "Scheme PMS-QAW");
      let cashFlows: CashFlow[] = [];
      for (const s of schemes) {
        if (s !== "Scheme B") continue;
        const systemTag = PortfolioApi.getSystemTag(s);
        const schemeCashFlows = await prisma.master_sheet.findMany({
          where: {
            qcode,
            system_tag: systemTag,
            capital_in_out: { not: null, not: new Decimal(0) },
          },
          select: { date: true, capital_in_out: true },
          orderBy: { date: "asc" },
        });
        cashFlows = cashFlows.concat(schemeCashFlows.map(entry => ({
          date: PortfolioApi.normalizeDate(entry.date)!,
          amount: entry.capital_in_out!.toNumber(),
          dividend: 0,
        })));
      }
      return cashFlows.sort((a, b) => a.date.localeCompare(b.date));
    }

    if (scheme !== "Scheme B") {
      return [];
    }

    const systemTag = PortfolioApi.getSystemTag(scheme);
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

    return cashFlows.map(entry => ({
      date: PortfolioApi.normalizeDate(entry.date)!,
      amount: entry.capital_in_out!.toNumber(),
      dividend: 0,
    }));
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
  ): Promise<Record<string, number | null>> {
    const navData = await PortfolioApi.getHistoricalData(qcode, scheme);
    if (!navData || navData.length === 0) {
      console.log("No NAV data found for trailing returns calculation");
      return {};
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

    console.log(`Trailing Returns Debug - Current Date: ${currentDate}, Last NAV: ${lastNav}`);
    console.log(`Total NAV data points: ${normalizedNavData.length}`);
    console.log(`Date range: ${oldestDate} to ${currentDate}`);

    if (!currentDate || lastNav === undefined) return {};

    const dataRangeDays = (new Date(currentDate).getTime() - new Date(oldestDate).getTime()) / (1000 * 60 * 60 * 24);
    console.log(`Actual data range: ${Math.round(dataRangeDays)} days`);

    const returns: Record<string, number | null> = {};

    for (const [period, targetCount] of Object.entries(periods)) {
      if (period === "sinceInception") {
        const oldestEntry = normalizedNavData[0];
        if (oldestEntry) {
          const years = (new Date(currentDate).getTime() - new Date(oldestEntry.date).getTime()) / (365 * 24 * 60 * 60 * 1000);
          returns[period] = years < 1
            ? ((lastNav - oldestEntry.nav) / oldestEntry.nav) * 100
            : (Math.pow(lastNav / oldestEntry.nav, 1 / years) - 1) * 100;
        } else {
          returns[period] = null;
        }
        continue;
      }

      const requiredDays = targetCount as number;
      if (requiredDays > dataRangeDays) {
        console.log(`${period}: Not enough data. Required: ${requiredDays} days, Available: ${Math.round(dataRangeDays)} days`);
        returns[period] = null;
        continue;
      }

      let targetDate: Date;
      const currentDateObj = new Date(currentDate);

      if (period === "1m") {
        targetDate = new Date(currentDateObj.getFullYear(), currentDateObj.getMonth() - 1, currentDateObj.getDate());
      } else if (period === "3m") {
        targetDate = new Date(currentDateObj.getFullYear(), currentDateObj.getMonth() - 3, currentDateObj.getDate());
      } else if (period === "6m") {
        targetDate = new Date(currentDateObj.getFullYear(), currentDateObj.getMonth() - 6, currentDateObj.getDate());
      } else if (period === "1y") {
        targetDate = new Date(currentDateObj.getFullYear() - 1, currentDateObj.getMonth(), currentDateObj.getDate());
      } else if (period === "2y") {
        targetDate = new Date(currentDateObj.getFullYear() - 2, currentDateObj.getMonth(), currentDateObj.getDate());
      } else {
        targetDate = new Date(currentDateObj);
        targetDate.setDate(currentDateObj.getDate() - requiredDays);
      }

      if (targetDate < new Date(oldestDate)) {
        console.log(`${period}: Target date ${targetDate.toISOString().split('T')[0]} is before oldest data ${oldestDate}`);
        returns[period] = null;
        continue;
      }

      console.log(`${period}: Looking for NAV around ${targetDate.toISOString().split('T')[0]}`);

      const targetDateTime = targetDate.getTime();
      let candidate = null;
      let minDiff = Infinity;

      for (const dataPoint of normalizedNavData) {
        const dataDateTime = new Date(dataPoint.date).getTime();
        const diff = Math.abs(dataDateTime - targetDateTime);

        if (diff < minDiff) {
          minDiff = diff;
          candidate = { nav: dataPoint.nav, date: new Date(dataPoint.date) };
        }
      }

      if (candidate) {
        const daysDifference = Math.round(minDiff / (1000 * 60 * 60 * 24));
        const maxAcceptableDifference = requiredDays <= 30 ? 7 : 30;

        if (daysDifference > maxAcceptableDifference) {
          console.log(`${period}: Closest match is ${daysDifference} days away, which is too far (max: ${maxAcceptableDifference})`);
          returns[period] = null;
          continue;
        }

        console.log(`${period}: Found closest NAV ${candidate.nav} on ${candidate.date.toISOString().split('T')[0]} (${daysDifference} days difference)`);

        if (["1y", "2y"].includes(period)) {
          const tPeriod = period === "1y" ? 1 : 2;
          returns[period] = (Math.pow(lastNav / candidate.nav, 1 / tPeriod) - 1) * 100;
        } else {
          returns[period] = ((lastNav - candidate.nav) / candidate.nav) * 100;
        }

        console.log(`${period}: Return calculated as ${returns[period]}% (from ${candidate.nav} to ${lastNav})`);
      } else {
        console.log(`${period}: No candidate found`);
        returns[period] = null;
      }
    }

    console.log("Final trailing returns:", returns);
    return returns;
  }

  private static getMonthName(month: number): string {
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return monthNames[month];
  }

  private static calculateMonthlyPnL(navData: { date: string; nav: number; pnl: number; capitalInOut: number }[]): MonthlyPnL {
    if (!navData || navData.length === 0) return {};

    const monthlyData: { [yearMonth: string]: { entries: { date: string; nav: number; pnl: number; capitalInOut: number }[] } } = {};
    navData.forEach(entry => {
      const dateStr = PortfolioApi.normalizeDate(entry.date);
      if (!dateStr) return;
      const [year, month] = dateStr.split('-').map(Number);
      const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
      if (!monthlyData[yearMonth]) {
        monthlyData[yearMonth] = { entries: [] };
      }
      monthlyData[yearMonth].entries.push({ ...entry, date: dateStr });
    });

    const formattedMonthlyPnl: MonthlyPnL = {};
    const sortedYearMonths = Object.keys(monthlyData).sort((a, b) => a.localeCompare(b));

    sortedYearMonths.forEach((yearMonth, index) => {
      const [year, month] = yearMonth.split('-').map(Number);
      const monthName = PortfolioApi.getMonthName(month - 1);
      const entries = monthlyData[yearMonth].entries.sort((a, b) => a.date.localeCompare(b.date));

      if (entries.length === 0) return;

      const totalCapitalInOut = entries.reduce((sum, entry) => sum + entry.capitalInOut, 0);
      const totalCashPnL = entries.reduce((sum, entry) => sum + entry.pnl, 0);
      const startNav = entries[0].nav;
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
        `DEBUG Monthly PnL ${yearMonth}: ` +
        `startDate=${entries[0].date}, startNav=${startNav.toFixed(4)}; ` +
        `endDate=${entries[entries.length - 1].date}, endNav=${endNav.toFixed(4)}, ` +
        `percent=${percent}, cash=${totalCashPnL.toFixed(2)}, capitalInOut=${totalCapitalInOut.toFixed(2)}`
      );
    });

    Object.keys(formattedMonthlyPnl).forEach(year => {
      const monthOrder = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
      const monthNames = Object.keys(formattedMonthlyPnl[year].months);
      const sortedMonths = monthNames.sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b));

      let compoundedReturn = 1;
      let hasValidData = false;

      sortedMonths.forEach(month => {
        const monthPercentStr = formattedMonthlyPnl[year].months[month].percent;
        if (monthPercentStr !== "-") {
          const monthReturn = Number(monthPercentStr) / 100;
          compoundedReturn *= (1 + monthReturn);
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

      console.log(
        `DEBUG Yearly PnL - ${year}: totalPercent=${formattedMonthlyPnl[year].totalPercent}%, ` +
        `totalCash=${formattedMonthlyPnl[year].totalCash}, ` +
        `totalCapitalInOut=${formattedMonthlyPnl[year].totalCapitalInOut}`
      );
    });

    return formattedMonthlyPnl;
  }

  private static async calculateQuarterlyPnLWithDailyPL(
    qcode: string,
    scheme: string,
    navData: { date: string; nav: number; pnl: number }[]
  ): Promise<QuarterlyPnL> {
    if (scheme === "Total Portfolio") {
      const quarterlyPnL: QuarterlyPnL = {};
      Object.entries(AC5_QUARTERLY_PNL).forEach(([year, quarters]) => {
        quarterlyPnL[year] = {
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
      return quarterlyPnL;
    }

    const systemTag = PortfolioApi.getSystemTag(scheme);
    console.log(`Getting quarterly P&L for qcode: ${qcode}, systemTag: ${systemTag}`);

    const portfolioValues = await prisma.master_sheet.findMany({
      where: { qcode, system_tag: systemTag, portfolio_value: { not: null } },
      select: { date: true, portfolio_value: true, daily_p_l: true },
      orderBy: { date: "asc" },
    });

    if (!portfolioValues.length) return {};

    const getQuarter = (month: number): string => {
      if (month < 3) return 'q1';
      if (month < 6) return 'q2';
      if (month < 9) return 'q3';
      return 'q4';
    };

    const sortedPortfolioValues = portfolioValues
      .map(item => ({
        date: PortfolioApi.normalizeDate(item.date)!,
        portfolio_value: Number(item.portfolio_value) || 0,
        daily_pl: Number(item.daily_p_l) || 0,
      }))
      .filter(item => item.date)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const quarterlyData: { [yearQuarter: string]: { cash: number; entries: { date: string; nav: number; pnl: number }[] } } = {};
    navData.forEach(entry => {
      const date = new Date(entry.date);
      const year = date.getUTCFullYear();
      const quarter = getQuarter(date.getUTCMonth());
      const yearQuarter = `${year}`;
      if (!quarterlyData[yearQuarter]) {
        quarterlyData[yearQuarter] = { cash: 0, entries: [] };
      }
      quarterlyData[yearQuarter].entries.push(entry);
      quarterlyData[yearQuarter].cash += entry.pnl;
    });

    const formattedQuarterlyPnl: QuarterlyPnL = {};
    Object.keys(quarterlyData).forEach(year => {
      formattedQuarterlyPnl[year] = {
        percent: { q1: "-", q2: "-", q3: "-", q4: "-", total: "-" },
        cash: { q1: "0.00", q2: "0.00", q3: "0.00", q4: "0.00", total: "0.00" },
        yearCash: "0.00",
      };

      const quarters: { [key: string]: { startNav: number; endNav: number; cash: number } } = {
        q1: { startNav: 0, endNav: 0, cash: 0 },
        q2: { startNav: 0, endNav: 0, cash: 0 },
        q3: { startNav: 0, endNav: 0, cash: 0 },
        q4: { startNav: 0, endNav: 0, cash: 0 },
      };

      const entriesByQuarter: { [key: string]: { date: string; nav: number; pnl: number }[] } = {
        q1: [], q2: [], q3: [], q4: [],
      };

      quarterlyData[year].entries.forEach(entry => {
        const date = new Date(entry.date);
        const quarter = getQuarter(date.getUTCMonth());
        entriesByQuarter[quarter].push(entry);
      });

      let yearCompoundedReturn = 1;
      let yearTotalCash = 0;
      let hasValidYearData = false;

      Object.keys(quarters).forEach(quarter => {
        const entries = entriesByQuarter[quarter].sort((a, b) => a.date.localeCompare(b.date));
        if (entries.length > 0) {
          quarters[quarter].startNav = entries[0].nav;
          quarters[quarter].endNav = entries[entries.length - 1].nav;
          quarters[quarter].cash = entries.reduce((sum, entry) => sum + entry.pnl, 0);

          if (scheme === "Scheme A" && AC5_SCHEME_A_QUARTERLY_PNL[year]?.[quarter.toUpperCase()]) {
            quarters[quarter].cash += Number(AC5_SCHEME_A_QUARTERLY_PNL[year][quarter.toUpperCase()]);
          }

          const quarterReturn = quarters[quarter].startNav > 0
            ? ((quarters[quarter].endNav - quarters[quarter].startNav) / quarters[quarter].startNav) * 100
            : 0;

          if (quarterReturn !== 0) {
            formattedQuarterlyPnl[year].percent[quarter] = quarterReturn.toFixed(2);
            yearCompoundedReturn *= (1 + quarterReturn / 100);
            hasValidYearData = true;
          } else {
            formattedQuarterlyPnl[year].percent[quarter] = "0.00";
          }

          formattedQuarterlyPnl[year].cash[quarter] = quarters[quarter].cash.toFixed(2);
          yearTotalCash += quarters[quarter].cash;
        }
      });

      if (hasValidYearData && yearCompoundedReturn !== 1) {
        formattedQuarterlyPnl[year].percent.total = ((yearCompoundedReturn - 1) * 100).toFixed(2);
      } else if (hasValidYearData && yearCompoundedReturn === 1) {
        formattedQuarterlyPnl[year].percent.total = "0.00";
      }

      formattedQuarterlyPnl[year].cash.total = yearTotalCash.toFixed(2);
      formattedQuarterlyPnl[year].yearCash = yearTotalCash.toFixed(2);

      console.log(
        `DEBUG Quarterly PnL - ${year}: ` +
        `percent=${JSON.stringify(formattedQuarterlyPnl[year].percent)}, ` +
        `cash=${JSON.stringify(formattedQuarterlyPnl[year].cash)}, ` +
        `yearCash=${formattedQuarterlyPnl[year].yearCash}`
      );
    });

    return formattedQuarterlyPnl;
  }

  private static getPortfolioNames(accountCode: string, scheme: string): any {
    if (!PORTFOLIO_MAPPING[accountCode]?.[scheme]) {
      throw new Error(`Invalid account code (${accountCode}) or scheme (${scheme})`);
    }
    return PORTFOLIO_MAPPING[accountCode][scheme];
  }

  public static async GET(request: Request): Promise<NextResponse> {
    try {
      let results: Record<string, PortfolioResponse> = {};
      const accountCode = "AC5";
      const allSchemes = Object.keys(PORTFOLIO_MAPPING[accountCode]).filter(s => s !== "Scheme PMS-QAW");
      const schemes = ["Total Portfolio", ...allSchemes.filter(s => s !== "Total Portfolio")];


      console.log(`Processing schemes: ${schemes.join(', ')}`);

      for (const scheme of schemes) {
        const qcode = `QAC00041`;
        const portfolioNames = PortfolioApi.getPortfolioNames(accountCode, scheme);
        const systemTag = PortfolioApi.getSystemTag(scheme);  

        console.log(`Processing ${scheme} with qcode: ${qcode}, systemTag: ${systemTag}`);

        const [cashInOutData, masterSheetData] = await Promise.all([
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
        const cashFlows = await PortfolioApi.getCashFlows(qcode, scheme);
        const trailingReturns = await PortfolioApi.calculateTrailingReturns(qcode, scheme);
        const drawdownMetrics = PortfolioApi.calculateDrawdownMetrics(historicalData.map(d => ({ date: PortfolioApi.normalizeDate(d.date)!, nav: d.nav })));
        const monthlyPnl = PortfolioApi.calculateMonthlyPnL(historicalData.map(d => ({
          date: PortfolioApi.normalizeDate(d.date)!,
          nav: d.nav,
          pnl: d.pnl,
          capitalInOut: d.capitalInOut
        })));
        const quarterlyPnl = await PortfolioApi.calculateQuarterlyPnLWithDailyPL(
          qcode,
          scheme,
          historicalData.map(d => ({
            date: PortfolioApi.normalizeDate(d.date)!,
            nav: d.nav,
            pnl: d.pnl
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
          inceptionDate: "2024-03-18",
          dataAsOfDate: latestExposure?.date.toISOString().split('T')[0] || "2025-07-18",
          strategyName: scheme,
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
      return NextResponse.json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }, { status: 500 });
    }
  }
}