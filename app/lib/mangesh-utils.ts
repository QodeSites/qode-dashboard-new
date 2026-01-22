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

// Dropdown order: Total Portfolio → Scheme QYE → Scheme QAW
const PORTFOLIO_MAPPING: Record<string, Record<string, PortfolioConfig>> = {
  AC10: {
    "Total Portfolio": {
      current: "Zerodha Total Portfolio",
      metrics: "Zerodha Total Portfolio",
      nav: "Zerodha Total Portfolio",
      isActive: true,
    },
    "Scheme QYE": {
      current: "Zerodha Total Portfolio",
      metrics: "Zerodha Total Portfolio",
      nav: "Zerodha Total Portfolio",
      isActive: true,
    },
    "Scheme QAW": {
      current: "QAW Zerodha Total Portfolio",
      metrics: "QAW Zerodha Total Portfolio",
      nav: "QAW Zerodha Total Portfolio",
      isActive: false,
    },
  },
};

export class PortfolioApi {
  private static readonly MANGESH_SYSTEM_TAGS: Record<string, string> = {
    "Scheme QAW": "QAW Zerodha Total Portfolio",
    "Scheme QYE": "Zerodha Total Portfolio",  // Same convention as Dinesh - uses base tag with date filter
  };

  // QAW final NAV (for reference)
  private static readonly QAW_FINAL_NAV = 105.12;
  // QYE start date for filtering
  private static readonly QYE_START_DATE = new Date("2025-12-09");

  private static MANGESH_HARDCODED_DATA: Record<string, PortfolioData & { metadata: Metadata }> = {
    "Scheme QAW": {
      data: {
        amountDeposited: "0.00",
        currentExposure: "0.00",
        return: "5.12",
        totalProfit: "1757504.85",
        trailingReturns: {
          "5d": 0.34,
          "10d": 2.09,
          "15d": 1.16,
          "1m": 1.98,
          "3m": null,
          "6m": null,
          "1y": null,
          "2y": null,
          "5y": null,
          sinceInception: 5.12,
          MDD: -1.23,
          currentDD: 0.00,
        },
        drawdown: "0.00",
        maxDrawdown: "-1.23",
        equityCurve: [
          { date: "2025-11-23", nav: 100 },
          { date: "2025-11-24", nav: 99.73 },
          { date: "2025-11-25", nav: 100.57 },
          { date: "2025-11-26", nav: 100.74 },
          { date: "2025-11-27", nav: 100.87 },
          { date: "2025-11-28", nav: 101.13 },
          { date: "2025-12-01", nav: 101.14 },
          { date: "2025-12-02", nav: 101.11 },
          { date: "2025-12-03", nav: 101.11 },
          { date: "2025-12-04", nav: 100.72 },
          { date: "2025-12-05", nav: 100.92 },
          { date: "2025-12-08", nav: 101.10 },
          { date: "2025-12-09", nav: 103.08 },
          { date: "2025-12-10", nav: 102.69 },
          { date: "2025-12-11", nav: 102.56 },
          { date: "2025-12-12", nav: 103.72 },
          { date: "2025-12-15", nav: 103.88 },
          { date: "2025-12-16", nav: 103.24 },
          { date: "2025-12-17", nav: 103.23 },
          { date: "2025-12-18", nav: 102.94 },
          { date: "2025-12-19", nav: 102.61 },
          { date: "2025-12-22", nav: 103.48 },
          { date: "2025-12-23", nav: 103.91 },
          { date: "2025-12-24", nav: 104.03 },
          { date: "2025-12-26", nav: 104.25 },
          { date: "2025-12-29", nav: 103.88 },
          { date: "2025-12-30", nav: 103.54 },
          { date: "2025-12-31", nav: 102.97 },
          { date: "2026-01-01", nav: 103.20 },
          { date: "2026-01-02", nav: 104.07 },
          { date: "2026-01-05", nav: 104.29 },
          { date: "2026-01-06", nav: 104.55 },
          { date: "2026-01-07", nav: 104.53 },
          { date: "2026-01-08", nav: 104.76 },
          { date: "2026-01-09", nav: 105.12 },
        ],
        drawdownCurve: [
          { date: "2025-11-23", drawdown: 0 },
          { date: "2025-11-24", drawdown: -0.27 },
          { date: "2025-11-25", drawdown: 0.00 },
          { date: "2025-11-26", drawdown: 0.00 },
          { date: "2025-11-27", drawdown: 0.00 },
          { date: "2025-11-28", drawdown: 0.00 },
          { date: "2025-12-01", drawdown: 0.00 },
          { date: "2025-12-02", drawdown: -0.03 },
          { date: "2025-12-03", drawdown: -0.03 },
          { date: "2025-12-04", drawdown: -0.42 },
          { date: "2025-12-05", drawdown: -0.22 },
          { date: "2025-12-08", drawdown: -0.04 },
          { date: "2025-12-09", drawdown: 0.00 },
          { date: "2025-12-10", drawdown: -0.38 },
          { date: "2025-12-11", drawdown: -0.51 },
          { date: "2025-12-12", drawdown: 0.00 },
          { date: "2025-12-15", drawdown: 0.00 },
          { date: "2025-12-16", drawdown: -0.61 },
          { date: "2025-12-17", drawdown: -0.62 },
          { date: "2025-12-18", drawdown: -0.91 },
          { date: "2025-12-19", drawdown: -1.22 },
          { date: "2025-12-22", drawdown: -0.39 },
          { date: "2025-12-23", drawdown: 0.00 },
          { date: "2025-12-24", drawdown: 0.00 },
          { date: "2025-12-26", drawdown: 0.00 },
          { date: "2025-12-29", drawdown: -0.36 },
          { date: "2025-12-30", drawdown: -0.69 },
          { date: "2025-12-31", drawdown: -1.23 },
          { date: "2026-01-01", drawdown: -1.01 },
          { date: "2026-01-02", drawdown: -0.17 },
          { date: "2026-01-05", drawdown: 0.00 },
          { date: "2026-01-06", drawdown: 0.00 },
          { date: "2026-01-07", drawdown: -0.01 },
          { date: "2026-01-08", drawdown: 0.00 },
          { date: "2026-01-09", drawdown: 0.00 },
        ],
        quarterlyPnl: {
          "2025": {
            percent: { q1: "0", q2: "0", q3: "0", q4: "2.97", total: "2.97" },
            cash: { q1: "0", q2: "0", q3: "0", q4: "1527932.68", total: "1527932.68" },
            yearCash: "1527932.68",
          },
          "2026": {
            percent: { q1: "2.09", q2: "0", q3: "0", q4: "0", total: "2.09" },
            cash: { q1: "229572.17", q2: "0", q3: "0", q4: "0", total: "229572.17" },
            yearCash: "229572.17",
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
              August: { percent: "-", cash: "-", capitalInOut: "-" },
              September: { percent: "-", cash: "-", capitalInOut: "-" },
              October: { percent: "-", cash: "-", capitalInOut: "-" },
              November: { percent: "1.13", cash: "568058.32", capitalInOut: "50000870.01" },
              December: { percent: "1.82", cash: "959874.36", capitalInOut: "-40526354.22" },
            },
            totalPercent: 2.95,
            totalCash: 1527932.68,
            totalCapitalInOut: 9474515.79,
          },
          "2026": {
            months: {
              January: { percent: "2.09", cash: "229572.17", capitalInOut: "-11232020.62" },
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
            totalPercent: 2.09,
            totalCash: 229572.17,
            totalCapitalInOut: -11232020.62,
          },
        },
        cashFlows: [
          { date: "2025-11-24", amount: 50000870.01, dividend: 0 },
          { date: "2025-12-09", amount: -40526354.22, dividend: 0 },
          { date: "2026-01-09", amount: -11232020.62, dividend: 0 },
        ],
        strategyName: "Scheme QAW",
      },
      metadata: {
        icode: "Scheme QAW",
        accountCount: 1,
        lastUpdated: "2026-01-09T00:00:00.000Z",
        filtersApplied: { accountType: null, broker: null, startDate: null, endDate: null },
        inceptionDate: "2025-11-23",
        dataAsOfDate: "2026-01-09",
        strategyName: "Scheme QAW",
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

  private static getSystemTag(scheme: string): string {
    return this.MANGESH_SYSTEM_TAGS[scheme] || "Zerodha Total Portfolio";
  }

  private static normalizeDate(date: Date | string): string {
    if (typeof date === "string") return date.split("T")[0];
    return date.toISOString().split("T")[0];
  }

  // ==================== Database Fetching Methods (READ-ONLY) ====================

  private static async getAmountDeposited(qcode: string, scheme: string): Promise<number> {
    // QAW is hardcoded and closed (net 0 for display)
    if (scheme === "Scheme QAW") {
      return 0;
    }

    // Total Portfolio: Return QYE deposits only (QAW is closed)
    if (scheme === "Total Portfolio") {
      return this.getAmountDeposited(qcode, "Scheme QYE");
    }

    // QYE: Fetch from database (only from QYE start date onwards)
    const systemTag = this.getSystemTag(scheme);
    const depositSum = await prisma.master_sheet_test.aggregate({
      where: {
        qcode,
        system_tag: systemTag,
        date: { gte: this.QYE_START_DATE },
        capital_in_out: { not: null },
      },
      _sum: { capital_in_out: true },
    });
    return Number(depositSum._sum.capital_in_out) || 0;
  }

  private static async getLatestExposure(
    qcode: string,
    scheme: string
  ): Promise<{ portfolioValue: number; drawdown: number; nav: number; date: Date } | null> {
    // QAW is closed
    if (scheme === "Scheme QAW") {
      const hc = this.MANGESH_HARDCODED_DATA["Scheme QAW"];
      return {
        portfolioValue: 0,
        drawdown: parseFloat(hc.data.drawdown),
        nav: hc.data.equityCurve.at(-1)?.nav || 0,
        date: new Date(hc.metadata.dataAsOfDate),
      };
    }

    // Total Portfolio: Use QYE current exposure
    if (scheme === "Total Portfolio") {
      return this.getLatestExposure(qcode, "Scheme QYE");
    }

    // QYE: Fetch from database (only from QYE start date onwards)
    const systemTag = this.getSystemTag(scheme);
    const record = await prisma.master_sheet_test.findFirst({
      where: {
        qcode,
        system_tag: systemTag,
        date: { gte: this.QYE_START_DATE },
      },
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

  private static async getHistoricalData(
    qcode: string,
    scheme: string
  ): Promise<{ date: Date; nav: number; drawdown: number; pnl: number; capitalInOut: number }[]> {
    // QAW: Return hardcoded data
    if (scheme === "Scheme QAW") {
      const hc = this.MANGESH_HARDCODED_DATA["Scheme QAW"];
      return hc.data.equityCurve.map((entry) => {
        const drawdownEntry = hc.data.drawdownCurve.find((d) => d.date === entry.date);
        return {
          date: new Date(entry.date),
          nav: entry.nav,
          drawdown: drawdownEntry?.drawdown || 0,
          pnl: 0,
          capitalInOut: 0,
        };
      });
    }

    // Total Portfolio: Combine QAW + QYE with NAV rebasing
    if (scheme === "Total Portfolio") {
      const qawData = await this.getHistoricalData(qcode, "Scheme QAW");
      const qyeData = await this.getHistoricalData(qcode, "Scheme QYE");

      // Rebase QYE NAV to continue from QAW's final NAV
      const rebaseMultiplier = this.QAW_FINAL_NAV / 100;
      const rebasedQyeData = qyeData.map((entry) => ({
        ...entry,
        nav: entry.nav * rebaseMultiplier,
      }));

      // Combine: QAW data first, then QYE data
      return [...qawData, ...rebasedQyeData];
    }

    // QYE: Fetch from database (only from QYE start date onwards)
    const systemTag = this.getSystemTag(scheme);
    const data = await prisma.master_sheet_test.findMany({
      where: {
        qcode,
        system_tag: systemTag,
        date: { gte: this.QYE_START_DATE },
        nav: { not: null },
      },
      select: { date: true, nav: true, drawdown: true, pnl: true, capital_in_out: true },
      orderBy: { date: "asc" },
    });

    const result = data.map((entry) => ({
      date: entry.date,
      nav: Number(entry.nav) || 0,
      drawdown: Math.abs(Number(entry.drawdown) || 0),
      pnl: Number(entry.pnl) || 0,
      capitalInOut: Number(entry.capital_in_out) || 0,
    }));

    // Add baseline point with NAV = 100 (day before first entry)
    if (result.length > 0) {
      const firstDate = new Date(result[0].date);
      firstDate.setDate(firstDate.getDate() - 1);
      result.unshift({
        date: firstDate,
        nav: 100,
        drawdown: 0,
        pnl: 0,
        capitalInOut: 0,
      });
    }

    return result;
  }

  private static async getCashFlows(qcode: string, scheme: string): Promise<CashFlow[]> {
    // QAW: Return hardcoded cash flows
    if (scheme === "Scheme QAW") {
      return this.MANGESH_HARDCODED_DATA["Scheme QAW"].data.cashFlows;
    }

    // Total Portfolio: Combine QAW + QYE cash flows
    if (scheme === "Total Portfolio") {
      const qawCashFlows = await this.getCashFlows(qcode, "Scheme QAW");
      const qyeCashFlows = await this.getCashFlows(qcode, "Scheme QYE");
      return [...qawCashFlows, ...qyeCashFlows].sort((a, b) => a.date.localeCompare(b.date));
    }

    // QYE: Fetch from database (only from QYE start date onwards)
    const systemTag = this.getSystemTag(scheme);
    const data = await prisma.master_sheet_test.findMany({
      where: {
        qcode,
        system_tag: systemTag,
        date: { gte: this.QYE_START_DATE },
        AND: [
          { capital_in_out: { not: null } },
          { capital_in_out: { not: new Decimal(0) } },
        ],
      },
      select: { date: true, capital_in_out: true },
      orderBy: { date: "asc" },
    });

    return data.map((entry) => ({
      date: this.normalizeDate(entry.date),
      amount: entry.capital_in_out?.toNumber() || 0,
      dividend: 0,
    }));
  }

  private static async getTotalProfit(qcode: string, scheme: string): Promise<number> {
    // QAW: Return hardcoded profit
    if (scheme === "Scheme QAW") {
      return parseFloat(this.MANGESH_HARDCODED_DATA["Scheme QAW"].data.totalProfit);
    }

    // Total Portfolio: Combine QAW + QYE profits
    if (scheme === "Total Portfolio") {
      const qawProfit = await this.getTotalProfit(qcode, "Scheme QAW");
      const qyeProfit = await this.getTotalProfit(qcode, "Scheme QYE");
      return qawProfit + qyeProfit;
    }

    // QYE: Calculate from database (only from QYE start date onwards)
    const systemTag = this.getSystemTag(scheme);
    const profitSum = await prisma.master_sheet_test.aggregate({
      where: {
        qcode,
        system_tag: systemTag,
        date: { gte: this.QYE_START_DATE },
        pnl: { not: null },
      },
      _sum: { pnl: true },
    });
    return Number(profitSum._sum.pnl) || 0;
  }

  private static calculateDrawdownMetrics(
    equityCurve: { date: string; nav: number }[]
  ): { mdd: number; currentDD: number; ddCurve: { date: string; value: number }[] } {
    if (equityCurve.length === 0) {
      return { mdd: 0, currentDD: 0, ddCurve: [] };
    }

    let peak = equityCurve[0].nav;
    let mdd = 0;
    const ddCurve: { date: string; value: number }[] = [];

    for (const point of equityCurve) {
      if (point.nav > peak) {
        peak = point.nav;
      }
      const drawdown = ((point.nav - peak) / peak) * 100;
      ddCurve.push({ date: point.date, value: drawdown });
      if (drawdown < mdd) {
        mdd = drawdown;
      }
    }

    const currentDD = ddCurve.length > 0 ? ddCurve[ddCurve.length - 1].value : 0;
    return { mdd, currentDD, ddCurve };
  }

  private static async calculatePortfolioReturns(qcode: string, scheme: string): Promise<number> {
    // QAW: Return hardcoded returns
    if (scheme === "Scheme QAW") {
      return parseFloat(this.MANGESH_HARDCODED_DATA["Scheme QAW"].data.return);
    }

    const historicalData = await this.getHistoricalData(qcode, scheme);
    if (historicalData.length < 2) return 0;

    const firstNav = historicalData[0].nav;
    const lastNav = historicalData[historicalData.length - 1].nav;
    const days =
      (historicalData[historicalData.length - 1].date.getTime() - historicalData[0].date.getTime()) /
      (1000 * 60 * 60 * 24);

    // Use absolute return for < 365 days, CAGR for >= 365 days
    if (days < 365) {
      return ((lastNav / firstNav) - 1) * 100;
    } else {
      return (Math.pow(lastNav / firstNav, 365 / days) - 1) * 100;
    }
  }

  private static async calculateTrailingReturns(
    qcode: string,
    scheme: string,
    drawdownMetrics: { mdd: number; currentDD: number }
  ): Promise<Record<string, number | null | string>> {
    // QAW: Return hardcoded trailing returns
    if (scheme === "Scheme QAW") {
      return this.MANGESH_HARDCODED_DATA["Scheme QAW"].data.trailingReturns;
    }

    const historicalData = await this.getHistoricalData(qcode, scheme);
    if (historicalData.length === 0) {
      return {
        "5d": null,
        "10d": null,
        "15d": null,
        "1m": null,
        "3m": null,
        "6m": null,
        "1y": null,
        "2y": null,
        "5y": null,
        sinceInception: null,
        MDD: drawdownMetrics.mdd,
        currentDD: drawdownMetrics.currentDD,
      };
    }

    // Sort by date ascending
    const sorted = historicalData
      .map((e) => ({ date: new Date(e.date), nav: e.nav }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    const latestEntry = sorted[sorted.length - 1];
    const firstEntry = sorted[0];
    const lastNav = latestEntry.nav;
    const firstNav = firstEntry.nav;

    // Helper to find NAV entry by going back calendar days (not trading days)
    const getNavByCalendarDaysAgo = (daysBack: number): number | null => {
      const targetDate = new Date(latestEntry.date);
      targetDate.setDate(targetDate.getDate() - daysBack);

      // Find closest entry on or before target date
      const candidates = sorted.filter((e) => e.date.getTime() <= targetDate.getTime());
      if (candidates.length === 0) return null;

      return candidates[candidates.length - 1].nav;
    };

    // Calendar day periods (matching portfolio-utils.ts convention)
    const getTrailingReturn = (calendarDays: number): number | null => {
      const pastNav = getNavByCalendarDaysAgo(calendarDays);
      if (!pastNav) return null;
      return ((lastNav / pastNav) - 1) * 100;
    };

    const sinceInception = ((lastNav / firstNav) - 1) * 100;

    return {
      "5d": getTrailingReturn(5),
      "10d": getTrailingReturn(10),
      "15d": getTrailingReturn(15),
      "1m": getTrailingReturn(30),
      "3m": getTrailingReturn(90),
      "6m": getTrailingReturn(180),
      "1y": getTrailingReturn(365),
      "2y": getTrailingReturn(730),
      "5y": getTrailingReturn(1825),
      sinceInception,
      MDD: drawdownMetrics.mdd,
      currentDD: drawdownMetrics.currentDD,
    };
  }

  private static async calculateMonthlyPnL(qcode: string, scheme: string): Promise<MonthlyPnL> {
    // QAW: Return hardcoded monthly PnL
    if (scheme === "Scheme QAW") {
      return this.MANGESH_HARDCODED_DATA["Scheme QAW"].data.monthlyPnl;
    }

    // Total Portfolio: Combine QAW hardcoded + QYE calculated
    if (scheme === "Total Portfolio") {
      const qawMonthlyPnl = this.MANGESH_HARDCODED_DATA["Scheme QAW"].data.monthlyPnl;
      const qyeMonthlyPnl = await this.calculateMonthlyPnL(qcode, "Scheme QYE");

      // Merge: QAW has Nov-Dec 2025 + Jan 2026, QYE has Dec 2025+ data
      const combined: MonthlyPnL = JSON.parse(JSON.stringify(qawMonthlyPnl)); // Deep copy
      for (const year of Object.keys(qyeMonthlyPnl)) {
        if (!combined[year]) {
          combined[year] = qyeMonthlyPnl[year];
        } else {
          // Merge months if same year exists in both
          for (const month of Object.keys(qyeMonthlyPnl[year].months)) {
            if (qyeMonthlyPnl[year].months[month].percent !== "-") {
              combined[year].months[month] = qyeMonthlyPnl[year].months[month];
            }
          }
          combined[year].totalPercent += qyeMonthlyPnl[year].totalPercent;
          combined[year].totalCash += qyeMonthlyPnl[year].totalCash;
          combined[year].totalCapitalInOut += qyeMonthlyPnl[year].totalCapitalInOut;
        }
      }
      return combined;
    }

    // QYE: Calculate from historical data
    const historicalData = await this.getHistoricalData(qcode, scheme);
    const monthlyPnl: MonthlyPnL = {};
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];

    // Group data by year and month
    const grouped: Record<string, Record<string, { startNav: number; endNav: number; pnl: number; capitalInOut: number }>> = {};

    for (let i = 1; i < historicalData.length; i++) {
      const entry = historicalData[i];
      const date = new Date(entry.date);
      const year = date.getFullYear().toString();
      const month = monthNames[date.getMonth()];

      if (!grouped[year]) grouped[year] = {};
      if (!grouped[year][month]) {
        grouped[year][month] = {
          startNav: historicalData[i - 1]?.nav || entry.nav,
          endNav: entry.nav,
          pnl: entry.pnl,
          capitalInOut: entry.capitalInOut,
        };
      } else {
        grouped[year][month].endNav = entry.nav;
        grouped[year][month].pnl += entry.pnl;
        grouped[year][month].capitalInOut += entry.capitalInOut;
      }
    }

    // Format monthly PnL
    for (const year of Object.keys(grouped).sort()) {
      monthlyPnl[year] = {
        months: {},
        totalPercent: 0,
        totalCash: 0,
        totalCapitalInOut: 0,
      };

      for (const month of monthNames) {
        if (grouped[year]?.[month]) {
          const data = grouped[year][month];
          const percent = ((data.endNav / data.startNav) - 1) * 100;
          monthlyPnl[year].months[month] = {
            percent: percent.toFixed(2),
            cash: data.pnl.toFixed(2),
            capitalInOut: data.capitalInOut.toFixed(2),
          };
          monthlyPnl[year].totalPercent += percent;
          monthlyPnl[year].totalCash += data.pnl;
          monthlyPnl[year].totalCapitalInOut += data.capitalInOut;
        } else {
          monthlyPnl[year].months[month] = { percent: "-", cash: "-", capitalInOut: "-" };
        }
      }
    }

    return monthlyPnl;
  }

  private static async calculateQuarterlyPnL(qcode: string, scheme: string): Promise<QuarterlyPnL> {
    // QAW: Return hardcoded quarterly PnL
    if (scheme === "Scheme QAW") {
      return this.MANGESH_HARDCODED_DATA["Scheme QAW"].data.quarterlyPnl;
    }

    // Total Portfolio: Combine QAW hardcoded + QYE calculated
    if (scheme === "Total Portfolio") {
      const qawQuarterlyPnl = this.MANGESH_HARDCODED_DATA["Scheme QAW"].data.quarterlyPnl;
      const qyeQuarterlyPnl = await this.calculateQuarterlyPnL(qcode, "Scheme QYE");

      // Merge: QAW has Q4 2025 + Q1 2026, QYE has Q4 2025+ data
      const combined: QuarterlyPnL = {};

      // Copy QAW data
      for (const year of Object.keys(qawQuarterlyPnl)) {
        combined[year] = {
          percent: { ...qawQuarterlyPnl[year].percent },
          cash: { ...qawQuarterlyPnl[year].cash },
          yearCash: qawQuarterlyPnl[year].yearCash,
        };
      }

      // Merge QYE data
      for (const year of Object.keys(qyeQuarterlyPnl)) {
        if (!combined[year]) {
          combined[year] = qyeQuarterlyPnl[year];
        } else {
          // Merge quarters if same year exists in both
          for (const q of ["q1", "q2", "q3", "q4"] as const) {
            const qyePercent = parseFloat(qyeQuarterlyPnl[year].percent[q]) || 0;
            const qyeCash = parseFloat(qyeQuarterlyPnl[year].cash[q]) || 0;
            if (qyePercent !== 0 || qyeCash !== 0) {
              const existingPercent = parseFloat(combined[year].percent[q]) || 0;
              const existingCash = parseFloat(combined[year].cash[q]) || 0;
              combined[year].percent[q] = (existingPercent + qyePercent).toFixed(2);
              combined[year].cash[q] = (existingCash + qyeCash).toFixed(2);
            }
          }
          // Recalculate totals
          const totalPercent = ["q1", "q2", "q3", "q4"].reduce(
            (sum, q) => sum + (parseFloat(combined[year].percent[q as keyof typeof combined[string]["percent"]]) || 0),
            0
          );
          const totalCash = ["q1", "q2", "q3", "q4"].reduce(
            (sum, q) => sum + (parseFloat(combined[year].cash[q as keyof typeof combined[string]["cash"]]) || 0),
            0
          );
          combined[year].percent.total = totalPercent.toFixed(2);
          combined[year].cash.total = totalCash.toFixed(2);
          combined[year].yearCash = totalCash.toFixed(2);
        }
      }
      return combined;
    }

    // QYE: Calculate from historical data
    const historicalData = await this.getHistoricalData(qcode, scheme);
    const quarterlyPnl: QuarterlyPnL = {};

    // Group data by year and quarter
    const grouped: Record<string, Record<string, { startNav: number; endNav: number; pnl: number }>> = {};

    for (let i = 1; i < historicalData.length; i++) {
      const entry = historicalData[i];
      const date = new Date(entry.date);
      const year = date.getFullYear().toString();
      const quarter = `q${Math.floor(date.getMonth() / 3) + 1}`;

      if (!grouped[year]) grouped[year] = {};
      if (!grouped[year][quarter]) {
        grouped[year][quarter] = {
          startNav: historicalData[i - 1]?.nav || entry.nav,
          endNav: entry.nav,
          pnl: entry.pnl,
        };
      } else {
        grouped[year][quarter].endNav = entry.nav;
        grouped[year][quarter].pnl += entry.pnl;
      }
    }

    // Format quarterly PnL
    for (const year of Object.keys(grouped).sort()) {
      quarterlyPnl[year] = {
        percent: { q1: "0", q2: "0", q3: "0", q4: "0", total: "0" },
        cash: { q1: "0", q2: "0", q3: "0", q4: "0", total: "0" },
        yearCash: "0",
      };

      let yearTotalPercent = 0;
      let yearTotalCash = 0;

      for (const q of ["q1", "q2", "q3", "q4"]) {
        if (grouped[year]?.[q]) {
          const data = grouped[year][q];
          const percent = ((data.endNav / data.startNav) - 1) * 100;
          quarterlyPnl[year].percent[q as keyof typeof quarterlyPnl[string]["percent"]] = percent.toFixed(2);
          quarterlyPnl[year].cash[q as keyof typeof quarterlyPnl[string]["cash"]] = data.pnl.toFixed(2);
          yearTotalPercent += percent;
          yearTotalCash += data.pnl;
        }
      }

      quarterlyPnl[year].percent.total = yearTotalPercent.toFixed(2);
      quarterlyPnl[year].cash.total = yearTotalCash.toFixed(2);
      quarterlyPnl[year].yearCash = yearTotalCash.toFixed(2);
    }

    return quarterlyPnl;
  }

  // ==================== Main GET Handler ====================

  public static async GET(request: Request): Promise<NextResponse> {
    const accountCode = "AC10";

    try {
      const results: Record<string, PortfolioResponse> = {};
      const url = new URL(request.url);
      const qcode = url.searchParams.get("qcode") || "QAC00064";

      // Order: Total Portfolio → Scheme QYE → Scheme QAW
      const schemes = ["Total Portfolio", "Scheme QYE", "Scheme QAW"];

      for (const scheme of schemes) {
        const portfolioNames = PortfolioApi.getPortfolioNames(accountCode, scheme);

        // For hardcoded schemes (QAW), use cached data
        if (scheme === "Scheme QAW") {
          const hardcodedData = PortfolioApi.MANGESH_HARDCODED_DATA[scheme];
          results[scheme] = {
            data: hardcodedData.data,
            metadata: {
              ...hardcodedData.metadata,
              isActive: portfolioNames.isActive,
            },
          };
          continue;
        }

        // For dynamic schemes (QYE, Total Portfolio), fetch/calculate data
        const investedAmount = await PortfolioApi.getAmountDeposited(qcode, scheme);
        const latestExposure = await PortfolioApi.getLatestExposure(qcode, scheme);
        const totalProfit = await PortfolioApi.getTotalProfit(qcode, scheme);
        const returns = await PortfolioApi.calculatePortfolioReturns(qcode, scheme);
        const historicalData = await PortfolioApi.getHistoricalData(qcode, scheme);
        const cashFlows = await PortfolioApi.getCashFlows(qcode, scheme);

        const equityCurve = historicalData.map((d) => ({
          date: PortfolioApi.normalizeDate(d.date),
          nav: d.nav,
        }));

        const drawdownMetrics = PortfolioApi.calculateDrawdownMetrics(equityCurve);
        const trailingReturns = await PortfolioApi.calculateTrailingReturns(qcode, scheme, drawdownMetrics);
        const monthlyPnl = await PortfolioApi.calculateMonthlyPnL(qcode, scheme);
        const quarterlyPnl = await PortfolioApi.calculateQuarterlyPnL(qcode, scheme);

        const portfolioData: PortfolioData = {
          amountDeposited: investedAmount.toFixed(2),
          currentExposure: latestExposure?.portfolioValue.toFixed(2) || "0",
          return: returns.toFixed(2),
          totalProfit: totalProfit.toFixed(2),
          trailingReturns,
          drawdown: drawdownMetrics.currentDD.toFixed(2),
          maxDrawdown: drawdownMetrics.mdd.toFixed(2),
          equityCurve,
          drawdownCurve: drawdownMetrics.ddCurve.map((d) => ({ date: d.date, drawdown: d.value })),
          quarterlyPnl,
          monthlyPnl,
          cashFlows,
          strategyName: scheme,
        };

        const metadata: Metadata = {
          icode: scheme,
          accountCount: 1,
          lastUpdated: new Date().toISOString(),
          filtersApplied: {
            accountType: null,
            broker: null,
            startDate: null,
            endDate: null,
          },
          inceptionDate: historicalData.length > 0 ? PortfolioApi.normalizeDate(historicalData[0].date) : "2025-11-24",
          dataAsOfDate: latestExposure?.date.toISOString().split("T")[0] || new Date().toISOString().split("T")[0],
          strategyName: scheme,
          isActive: portfolioNames.isActive,
        };

        results[scheme] = { data: portfolioData, metadata };
      }

      return NextResponse.json(results, { status: 200 });
    } catch (error) {
      console.error("Mangesh Portfolio API Error:", error);
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
