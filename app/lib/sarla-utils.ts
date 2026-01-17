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
  AC8: {
    "Scheme PMS QAW": {
      current: "PMS QAW Portfolio",
      metrics: "PMS QAW Portfolio",
      nav: "PMS QAW Portfolio",
      isActive: true,
    },
    "Scheme QAW++ QUS00081": {
      current: "Zerodha Total Portfolio",
      metrics: "Total Portfolio Value",
      nav: "Total Portfolio Value",
      isActive: true,
      // This scheme uses QAC00066 instead of QAC00046
    },
    "Scheme A": {
      current: "Total Portfolio Value A",
      metrics: "Total Portfolio Value A",
      nav: "Total Portfolio Value A",
      isActive: false
    },
    "Scheme B": {
      current: "Total Portfolio Value B",
      metrics: "Total Portfolio Value B",
      nav: "Total Portfolio Value B",
      isActive: false
    },
    "Scheme A (Old)": {
      current: "Total Portfolio Value Old",
      metrics: "Total Portfolio Value Old",
      nav: "Total Portfolio Value Old",
      isActive: false
    },
    "Total Portfolio": {
      current: "Total Portfolio Value A",
      metrics: "Total Portfolio Value A",
      nav: "Total Portfolio Value A",
      isActive: true
    },
    "Scheme QYE++": {
      current: "QYE Total Portfolio Value",
      metrics: "QYE Total Portfolio Value",
      nav: "QYE Total Portfolio Value",
      isActive: false,
    },
  },
};
const FROZEN_RETURN_VALUES = {
  "Scheme A": 21.79,
  "Scheme C": 8.10,
  "Scheme D": 2.33,
  "Scheme E": 5.21,
  "Scheme F": 4.38,
};
const HARDCODED_SINCE_INCEPTION_RETURNS = {
  AC5: {
    "Scheme A": 24.10,
    "Scheme C": 30.78,
    "Scheme D": 2.33,
    "Scheme E": 5.21,
    "Scheme F": 4.38,
  },
};
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
const AC8_QUARTERLY_PNL = {
  "2024": {
    Q1: 0,
    Q2: -266592.46,
    Q3: 785096.50,
    Q4: 444459.79,
    total: 962963.83,
  },
  "2025": {
    Q1: -6141212.18,
    Q2: 7131527.27,
    Q3: -2290478.24,
    Q4: 0,
    total: -1300163.15,
  },
};
const PMS_QAW_Q2_2025_VALUE = 10336722.03;

export class PortfolioApi {
  // 1) Add a helper that NEVER sums "Total Portfolio"
  private static async getSingleSchemeProfit(qcode: string, scheme: string): Promise<number> {
    // Hardcoded?
    const HC = this.getHardcoded(qcode);
    if (HC?.[scheme]) return parseFloat(HC[scheme].data.totalProfit);

    if (scheme === "Scheme PMS QAW") {
      const pms = await this.getPMSData(qcode);
      return pms.totalProfit;
    }

    // Get effective qcode for schemes with overrides (e.g., Scheme QAW++ QUS00081 uses QAC00066)
    const effectiveQcode = PortfolioApi.getEffectiveQcode(scheme, qcode);

    // Everything else from master_sheet by (effectiveQcode + system_tag)
    const systemTag = PortfolioApi.getSystemTag(scheme, effectiveQcode);
    const profitSum = await prisma.master_sheet.aggregate({
      where: { qcode: effectiveQcode, system_tag: systemTag },
      _sum: { pnl: true },
    });
    return Number(profitSum._sum.pnl) || 0;
  }
  private static getHardcoded(qcode: string) {
    if (qcode === "QAC00041") return this.SARLA_HARDCODED_DATA;
    if (qcode === "QAC00046") return this.SATIDHAM_HARDCODED_DATA;
    return null;
  }
  private static safeNum(v: unknown): number {
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    if (v == null) return 0;
    const n = parseFloat(String(v).replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
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
  private static readonly SARLA_SYSTEM_TAGS: Record<string, string> = {
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
  private static readonly SATIDHAM_SYSTEM_TAGS: Record<string, string> = {
    "Total Portfolio": "Total Portfolio Value A",
    "Scheme A": "Total Portfolio Value A",
    "Scheme B": "Total Portfolio Value B",
    "Scheme A (Old)": "Total Portfolio Value Old",
    "Scheme PMS QAW": "PMS QAW Portfolio",
    "Scheme QAW++ QUS00081": "Zerodha Total Portfolio", // Uses QAC00066
    "Scheme QYE++": "QYE Total Portfolio Value", // Inactive scheme - uses hardcoded data
  };

  // Scheme to qcode override mapping - schemes that use a different qcode than the default
  private static readonly SCHEME_QCODE_OVERRIDE: Record<string, string> = {
    "Scheme QAW++ QUS00081": "QAC00066", // This scheme fetches from QAC00066 instead of the default qcode
  };

  // Helper method to get the effective qcode for a scheme (handles overrides)
  private static getEffectiveQcode(scheme: string, defaultQcode: string): string {
    return this.SCHEME_QCODE_OVERRIDE[scheme] || defaultQcode;
  }

  private static getSystemTag(scheme: string, qcode?: string, accountCode?: string): string {
    // Use accountCode if provided, otherwise infer from qcode
    const isSatidham = accountCode === "AC8" || qcode === "QAC00046" || qcode === "QAC00066";
    const map = isSatidham ? this.SATIDHAM_SYSTEM_TAGS : this.SARLA_SYSTEM_TAGS;
    return map[scheme] || `Zerodha Total Portfolio ${scheme}`;
  }
  private static resolvePmsAccountCode(input?: string): string {
    if (!input) return "QAW00023";                  // sensible default
    if (input.startsWith("QAW")) return input;      // already a PMS code

    // Map account qcodes to PMS nuvama codes
    const map: Record<string, string> = {
      "QAC00041": "QAW00023",  // Sarla -> PMS code
      "QAC00046": "QAW00041",  // Satidham -> PMS code
    };

    return map[input] || "QAW00023";
  }
  private static async getPMSData(qcode: string = "QAW00023"): Promise<{
    amountDeposited: number;
    currentExposure: number;
    totalProfit: number;
    historicalData: { date: string; nav: number; drawdown: number; pnl: number; capitalInOut: number }[];
    cashFlows: CashFlow[];
    latestData: { portfolioValue: number; drawdown: number; nav: number; date: Date } | null;
  }> {
    // Use QAW00041 for Satidham (QAC00046), otherwise use the provided qcode or default
    const accountCodeForPMS = this.resolvePmsAccountCode(qcode);
    console.log(`Fetching PMS data for account code: ${accountCodeForPMS}, original qcode: ${qcode}`);

    const pmsData = await prisma.pms_master_sheet.findMany({
      where: { account_code: accountCodeForPMS },
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

    console.log(`Found ${pmsData.length} PMS records for account code: ${accountCodeForPMS}`);

    if (!pmsData.length) {
      console.warn(`No PMS data found for account code: ${accountCodeForPMS}`);
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
        dataAsOfDate: "2025-05-08",
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
            cash: { q1: "0.00", q2: "0.00", q3: "1820621.13", q4: "2231539.52", total: "4052160.65" },
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
        dataAsOfDate: "2024-12-05",
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
          { date: "2024-12-05", amount: 24000000.00, dividend: 0.00 },
          { date: "2024-12-16", amount: 11500000.00, dividend: 0.00 },
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
        return: "7.96",
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
        cashFlows: [
          { date: "2025-02-19", amount: 53299301.70, dividend: 0.00 },
          { date: "2025-02-21", amount: 24308966.42, dividend: 0.00 },
          { date: "2025-05-06", amount: -50000000.00, dividend: 0.00 },
          { date: "2025-05-07", amount: -34777283.42, dividend: 0.00 },
        ],
        strategyName: "Scheme QAW",
      },
      metadata: {
        icode: "Scheme QAW",
        accountCount: 1,
        lastUpdated: "2025-08-05",
        filtersApplied: { accountType: null, broker: null, startDate: null, endDate: null },
        inceptionDate: "2025-02-01",
        dataAsOfDate: "2025-05-07",
        strategyName: "Scheme QAW",
        isActive: false,
      },
    },
  };
  private static SATIDHAM_HARDCODED_DATA: Record<string, PortfolioData & { metadata: Metadata }> = {
    "Scheme A": {
      data: {
        amountDeposited: "0.00",
        currentExposure: "0.00",
        return: "-1.20",
        totalProfit: "-1234832.40",
        trailingReturns: {
          "5d": -0.79,
          "10d": -0.97,
          "15d": -1.32,
          "1m": -0.97,
          "3m": 4.47,
          "6m": -3.67,
          "1y": null,
          "2y": null,
          "5y": null,
          sinceInception: -1.20,
          MDD: -12.67,
          currentDD: -5.24,
        },
        drawdown: "-5.24",
        maxDrawdown: "-12.67",
        equityCurve: [],
        drawdownCurve: [],
        quarterlyPnl: {
          "2024": {
            percent: { q1: "-", q2: "-", q3: "-", q4: "-0.36", total: "-0.36" },
            cash: { q1: "0.00", q2: "0.00", q3: "0.00", q4: "-246093.44", total: "-246093.44" },
            yearCash: "-246093.44",
          },
          "2025": {
            percent: { q1: "-1.7", q2: "-", q3: "-", q4: "-", total: "-1.7" },
            cash: { q1: "-6141212.18", q2: "5152473.27", q3: "0.00", q4: "0.00", total: "-988738.91" },
            yearCash: "-988738.91",
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
              November: { percent: "2.41", cash: "0.00", capitalInOut: "0.00" },
              December: { percent: "-2.01", cash: "-246093.44", capitalInOut: "0.00" },
            },
            totalPercent: 0.36,
            totalCash: -246093.44,
            totalCapitalInOut: 0.00,
          },
          "2025": {
            months: {
              January: { percent: "-3.7", cash: "0.00", capitalInOut: "0.00" },
              February: { percent: "-2.29", cash: "0.00", capitalInOut: "0.00" },
              March: { percent: "0.86", cash: "-6141212.18", capitalInOut: "0.00" },
              April: { percent: "4.59", cash: "5152473.27", capitalInOut: "0.00" },
              May: { percent: "-0.98", cash: "0.00", capitalInOut: "0.00" },
              June: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
              July: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
              August: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
              September: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
              October: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
              November: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
              December: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            },
            totalPercent: -1.7,
            totalCash: -988738.91,
            totalCapitalInOut: 0.00,
          },
        },
        cashFlows: [
          { date: "2024-11-17", amount: 77914968.50, dividend: 0.00 },
          { date: "2024-12-02", amount: 20000000.00, dividend: 0.00 },
          { date: "2025-01-08", amount: 26335800.40, dividend: 0.00 },
          { date: "2025-01-15", amount: 7500000.00, dividend: 0.00 },
          { date: "2025-02-14", amount: -10000000.00, dividend: 0.00 },
          { date: "2025-05-29", amount: -50000000.00, dividend: 0.00 },
          { date: "2025-05-30", amount: -44080573.00, dividend: 0.00 },
          { date: "2025-05-30", amount: -30157181.60, dividend: 0.00 },
        ],
        strategyName: "Scheme A",
      },
      metadata: {
        icode: "Scheme A",
        accountCount: 1,
        lastUpdated: "2025-08-05",
        filtersApplied: { accountType: null, broker: null, startDate: null, endDate: null },
        inceptionDate: "2024-11-17",
        dataAsOfDate: "2025-05-30",
        strategyName: "Scheme A",
        isActive: false,
      },
    },
    "Scheme B": {
      data: {
        amountDeposited: "0.00",
        currentExposure: "0.00",
        return: "2.21",
        totalProfit: "1645377.07",
        trailingReturns: {
          "5d": 0.009,
          "10d": 0.12,
          "15d": -0.058,
          "1m": 1.04,
          "3m": 3.14,
          "6m": null,
          "1y": null,
          "2y": null,
          "5y": null,
          sinceInception: 2.21,
          MDD: -2.35,
          currentDD: -0.47,
        },
        drawdown: "-0.47",
        maxDrawdown: "-2.35",
        equityCurve: [],
        drawdownCurve: [],
        quarterlyPnl: {
          "2024": {
            percent: { q1: "-", q2: "0.3", q3: "-0.75", q4: "0.91", total: "2.23" },
            cash: { q1: "0.00", q2: "169727.34", q3: "785096.50", q4: "690553.23", total: "1645377.07" },
            yearCash: "1645377.07",
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
              June: { percent: "0.3", cash: "169727.34", capitalInOut: "74561820.20" },
              July: { percent: "-0.72", cash: "0.00", capitalInOut: "0.00" },
              August: { percent: "-0.75", cash: "785096.50", capitalInOut: "0.00" },
              September: { percent: "2.5", cash: "0.00", capitalInOut: "0.00" },
              October: { percent: "0.52", cash: "0.00", capitalInOut: "0.00" },
              November: { percent: "0.39", cash: "690553.23", capitalInOut: "-77915199.00" },
              December: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            },
            totalPercent: 2.23,
            totalCash: 1645377.07,
            totalCapitalInOut: -3353378.80,
          },
        },
        cashFlows: [
          { date: "2024-06-25", amount: 74561820.20, dividend: 0.00 },
          { date: "2024-11-16", amount: -77915199.00, dividend: 0.00 },
        ],
        strategyName: "Scheme B",
      },
      metadata: {
        icode: "Scheme B",
        accountCount: 1,
        lastUpdated: "2025-08-05",
        filtersApplied: { accountType: null, broker: null, startDate: null, endDate: null },
        inceptionDate: "2024-06-25",
        dataAsOfDate: "2024-11-16",
        strategyName: "Scheme B",
        isActive: false,
      },
    },
    "Scheme A (Old)": {
      data: {
        amountDeposited: "0.00",
        currentExposure: "0.00",
        return: "-0.64",
        totalProfit: "-436319.80",
        trailingReturns: {
          "5d": -0.6,
          "10d": null,
          "15d": null,
          "1m": null,
          "3m": null,
          "6m": null,
          "1y": null,
          "2y": null,
          "5y": null,
          sinceInception: -0.64,
          MDD: -0.98,
          currentDD: -0.64,
        },
        drawdown: "-0.64",
        maxDrawdown: "-0.98",
        equityCurve: [],
        drawdownCurve: [],
        quarterlyPnl: {
          "2024": {
            percent: { q1: "-", q2: "-0.64", q3: "-", q4: "-", total: "-0.64" },
            cash: { q1: "0.00", q2: "-436319.80", q3: "0.00", q4: "0.00", total: "-436319.80" },
            yearCash: "-436319.80",
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
              June: { percent: "-0.64", cash: "-436319.80", capitalInOut: "67999205.00" },
              July: { percent: "-", cash: "0.00", capitalInOut: "-67562885.20" },
              August: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
              September: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
              October: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
              November: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
              December: { percent: "-", cash: "0.00", capitalInOut: "0.00" },
            },
            totalPercent: -0.64,
            totalCash: -436319.80,
            totalCapitalInOut: 436319.80,
          },
        },
        cashFlows: [
          { date: "2024-06-18", amount: 67999205.00, dividend: 0.00 },
          { date: "2024-06-25", amount: -67562885.20, dividend: 0.00 },
        ],
        strategyName: "Scheme A (Old)",
      },
      metadata: {
        icode: "Scheme A (Old)",
        accountCount: 1,
        lastUpdated: "2025-08-05",
        filtersApplied: { accountType: null, broker: null, startDate: null, endDate: null },
        inceptionDate: "2024-06-18",
        dataAsOfDate: "2024-06-25",
        strategyName: "Scheme A (Old)",
        isActive: false,
      },
    },
    "Scheme QYE++": {
      data: {
        amountDeposited: "0.00",
        currentExposure: "0.00",
        return: "1.04",
        totalProfit: "787288.79",
        trailingReturns: {
          "5d": 0.4,
          "10d": 0.64,
          "15d": 0.85,
          "1m": 0.91,
          "3m": null,
          "6m": null,
          "1y": null,
          "2y": null,
          "5y": null,
          sinceInception: 1.04,
          MDD: -0.87,
          currentDD: 0,
        },
        drawdown: "0.00",
        maxDrawdown: "-0.87",
        equityCurve: [
          { date: "2025-11-28", nav: 100.01 },
          { date: "2025-12-01", nav: 99.83 },
          { date: "2025-12-02", nav: 100.04 },
          { date: "2025-12-03", nav: 100.18 },
          { date: "2025-12-04", nav: 100.07 },
          { date: "2025-12-05", nav: 100.14 },
          { date: "2025-12-08", nav: 100.26 },
          { date: "2025-12-09", nav: 100.88 },
          { date: "2025-12-10", nav: 100.88 },
          { date: "2025-12-11", nav: 100.71 },
          { date: "2025-12-12", nav: 100.84 },
          { date: "2025-12-15", nav: 100.76 },
          { date: "2025-12-16", nav: 100.66 },
          { date: "2025-12-17", nav: 100.83 },
          { date: "2025-12-18", nav: 100.5 },
          { date: "2025-12-19", nav: 100 },
          { date: "2025-12-22", nav: 100.2 },
          { date: "2025-12-23", nav: 100.21 },
          { date: "2025-12-24", nav: 100.3 },
          { date: "2025-12-26", nav: 100.41 },
          { date: "2025-12-29", nav: 100.53 },
          { date: "2025-12-30", nav: 100.72 },
          { date: "2025-12-31", nav: 100.56 },
          { date: "2026-01-01", nav: 100.65 },
          { date: "2026-01-02", nav: 100.94 },
          { date: "2026-01-05", nav: 100.92 },
          { date: "2026-01-06", nav: 101.05 },
        ],
        drawdownCurve: [
          { date: "2025-11-28", drawdown: 0 },
          { date: "2025-12-01", drawdown: 0.18 },
          { date: "2025-12-02", drawdown: 0 },
          { date: "2025-12-03", drawdown: 0 },
          { date: "2025-12-04", drawdown: 0.11 },
          { date: "2025-12-05", drawdown: 0.04 },
          { date: "2025-12-08", drawdown: 0 },
          { date: "2025-12-09", drawdown: 0 },
          { date: "2025-12-10", drawdown: 0 },
          { date: "2025-12-11", drawdown: 0.17 },
          { date: "2025-12-12", drawdown: 0.04 },
          { date: "2025-12-15", drawdown: 0.12 },
          { date: "2025-12-16", drawdown: 0.22 },
          { date: "2025-12-17", drawdown: 0.05 },
          { date: "2025-12-18", drawdown: 0.38 },
          { date: "2025-12-19", drawdown: 0.87 },
          { date: "2025-12-22", drawdown: 0.67 },
          { date: "2025-12-23", drawdown: 0.66 },
          { date: "2025-12-24", drawdown: 0.57 },
          { date: "2025-12-26", drawdown: 0.47 },
          { date: "2025-12-29", drawdown: 0.35 },
          { date: "2025-12-30", drawdown: 0.16 },
          { date: "2025-12-31", drawdown: 0.32 },
          { date: "2026-01-01", drawdown: 0.23 },
          { date: "2026-01-02", drawdown: 0 },
          { date: "2026-01-05", drawdown: 0.02 },
          { date: "2026-01-06", drawdown: 0 },
        ],
        quarterlyPnl: {
          "2025": {
            percent: { q1: "-", q2: "-", q3: "-", q4: "0.56", total: "0.56" },
            cash: { q1: "-", q2: "-", q3: "-", q4: "539872.40", total: "539872.40" },
            yearCash: "539872.40",
          },
          "2026": {
            percent: { q1: "0.49", q2: "-", q3: "-", q4: "-", total: "0.49" },
            cash: { q1: "247416.39", q2: "-", q3: "-", q4: "-", total: "247416.39" },
            yearCash: "247416.39",
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
              November: { percent: "0.01", cash: "8424.89", capitalInOut: "10000000.04" },
              December: { percent: "0.55", cash: "531447.51", capitalInOut: "2087253.24" },
            },
            totalPercent: 0.56,
            totalCash: 539872.4,
            totalCapitalInOut: 12087253.28,
          },
          "2026": {
            months: {
              January: { percent: "0.49", cash: "247416.39", capitalInOut: "-65002.54" },
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
            totalPercent: 0.49,
            totalCash: 247416.39,
            totalCapitalInOut: -65002.54,
          },
        },
        cashFlows: [
          // Source: "QYE Zerodha Total Portfolio" (instead of "QYE Total Portfolio Value")
          { date: "2025-11-28", amount: 79998180.50, dividend: 0 },
          { date: "2025-12-12", amount: -30000000.00, dividend: 0 },
          { date: "2026-01-06", amount: -51041445.53, dividend: 0 },
        ],
        strategyName: "Scheme QYE++",
      },
      metadata: {
        icode: "Scheme QYE++",
        accountCount: 1,
        lastUpdated: "2026-01-16",
        filtersApplied: { accountType: null, broker: null, startDate: null, endDate: null },
        inceptionDate: "2025-11-28",
        dataAsOfDate: "2026-01-06",
        strategyName: "Scheme QYE++",
        isActive: false,
      },
    },
  };
  private static async getAmountDeposited(qcode: string, scheme: string): Promise<number> {
    const HC = this.getHardcoded(qcode);
    if (HC?.[scheme]) {
      return parseFloat(HC[scheme].data.amountDeposited);
    }

    if (scheme === "Total Portfolio") {
      // Satidham (QAC00046) includes different schemes than Sarla (QAC00041)
      const isSatidham = qcode === "QAC00046";
      const schemes = isSatidham
        ? ["Scheme A", "Scheme B", "Scheme PMS QAW", "Scheme QAW++ QUS00081", "Scheme QYE++"]
        : ["Scheme B", "Scheme PMS QAW"];
      let totalDeposited = 0;

      for (const s of schemes) {
        // Check for hardcoded data first (for inactive schemes like QYE++)
        if (HC?.[s]) {
          const schemeCashFlows = HC[s].data.cashFlows || [];
          const schemeDeposited = schemeCashFlows.reduce((sum: number, cf: { amount: number }) => sum + cf.amount, 0);
          totalDeposited += schemeDeposited;
        } else if (s === "Scheme B" || s === "Scheme A") {
          const systemTag = s === "Scheme B" ? "Zerodha Total Portfolio" : PortfolioApi.getSystemTag(s, qcode);
          const depositSum = await prisma.master_sheet.aggregate({
            where: {
              qcode,
              system_tag: systemTag,
              capital_in_out: { not: null },
            },
            _sum: { capital_in_out: true },
          });
          totalDeposited += Number(depositSum._sum.capital_in_out) || 0;
        } else if (s === "Scheme QAW++ QUS00081") {
          // This scheme uses QAC00066 instead of QAC00046
          const effectiveQcode = PortfolioApi.getEffectiveQcode(s, qcode);
          const systemTag = PortfolioApi.getSystemTag(s, effectiveQcode);
          const depositSum = await prisma.master_sheet.aggregate({
            where: {
              qcode: effectiveQcode,
              system_tag: systemTag,
              capital_in_out: { not: null },
            },
            _sum: { capital_in_out: true },
          });
          totalDeposited += Number(depositSum._sum.capital_in_out) || 0;
        }
      }

      const pmsData = await this.getPMSData(qcode);
      totalDeposited += pmsData.amountDeposited;

      return totalDeposited;
    }

    if (scheme === "Scheme PMS QAW") {
      const pmsData = await this.getPMSData(qcode);
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
      return Number(depositSum._sum.capital_in_out) || 0;
    }

    // Handle Scheme QAW++ QUS00081 (uses QAC00066 instead of default qcode)
    if (scheme === "Scheme QAW++ QUS00081") {
      const effectiveQcode = PortfolioApi.getEffectiveQcode(scheme, qcode);
      const systemTag = PortfolioApi.getSystemTag(scheme, effectiveQcode);
      const depositSum = await prisma.master_sheet.aggregate({
        where: {
          qcode: effectiveQcode,
          system_tag: systemTag,
          capital_in_out: { not: null },
        },
        _sum: { capital_in_out: true },
      });
      return Number(depositSum._sum.capital_in_out) || 0;
    }

    return 0;
  }
  private static async getLatestExposure(qcode: string, scheme: string): Promise<{ portfolioValue: number; drawdown: number; nav: number; date: Date } | null> {

    const HC = this.getHardcoded(qcode);
    if (HC?.[scheme]) {
      return {
        portfolioValue: parseFloat(HC[scheme].data.currentExposure),
        drawdown: parseFloat(HC[scheme].data.drawdown),
        nav: HC[scheme].data.equityCurve.length > 0 ? HC[scheme].data.equityCurve.at(-1)!.nav : 0,
        date: new Date(HC[scheme].metadata.dataAsOfDate),
      };
    }
    if (scheme === "Total Portfolio") {
      // Satidham (QAC00046) includes different schemes than Sarla (QAC00041)
      const isSatidham = qcode === "QAC00046";
      const schemes = isSatidham
        ? ["Scheme A", "Scheme B", "Scheme PMS QAW", "Scheme QAW++ QUS00081", "Scheme QYE++"]
        : ["Scheme B", "Scheme PMS QAW"];
      let totalPortfolioValue = 0;
      let latestDrawdown = 0;
      let latestNav = 0;
      let latestDate: Date | null = null;

      for (const s of schemes) {
        // Check for hardcoded data first (for inactive schemes like QYE++)
        if (HC?.[s]) {
          const schemeData = HC[s];
          totalPortfolioValue += parseFloat(schemeData.data.currentExposure) || 0;
          const schemeNav = schemeData.data.equityCurve.length > 0 ? schemeData.data.equityCurve.at(-1)!.nav : 0;
          latestNav += schemeNav;
          const schemeDate = new Date(schemeData.metadata.dataAsOfDate);
          if (!latestDate || schemeDate > latestDate) {
            latestDate = schemeDate;
            latestDrawdown = Math.abs(parseFloat(schemeData.data.drawdown)) || 0;
          }
        } else if (s === "Scheme B" || s === "Scheme A") {
          const systemTag = s === "Scheme B" ? "Zerodha Total Portfolio" : PortfolioApi.getSystemTag(s, qcode);
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
        } else if (s === "Scheme QAW++ QUS00081") {
          // This scheme uses QAC00066 instead of QAC00046
          const effectiveQcode = PortfolioApi.getEffectiveQcode(s, qcode);
          const systemTag = PortfolioApi.getSystemTag(s, effectiveQcode);
          const record = await prisma.master_sheet.findFirst({
            where: { qcode: effectiveQcode, system_tag: systemTag },
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

      const pmsData = await this.getPMSData(qcode);
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
      const pmsData = await this.getPMSData(qcode);
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


    // Get effective qcode for schemes with overrides (e.g., Scheme QAW++ QUS00081 uses QAC00066)
    const effectiveQcode = PortfolioApi.getEffectiveQcode(scheme, qcode);
    const systemTag = PortfolioApi.getSystemTag(scheme, effectiveQcode);

    const record = await prisma.master_sheet.findFirst({
      where: { qcode: effectiveQcode, system_tag: systemTag },
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
    const HC = this.getHardcoded(qcode);
    if (HC?.[scheme]) {
      return parseFloat(HC[scheme].data.return);
    }


    const tryNavCagr = async (): Promise<number | null> => {
      try {
        // For Total Portfolio you might not have a proper combined NAV series.
        // So only do this path for Scheme B (or any scheme with its own NAV stream).
        if (scheme === "Scheme B" || scheme === "Scheme PMS QAW" || !["Total Portfolio"].includes(scheme)) {
          const navData = await PortfolioApi.getHistoricalData(qcode, scheme);
          if (navData && navData.length >= 2) {
            const first = navData[0];
            const last = navData[navData.length - 1];

            const firstDate = new Date(first.date);
            const lastDate = new Date(last.date);
            const years = (lastDate.getTime() - firstDate.getTime()) / (365 * 24 * 60 * 60 * 1000);

            const initialNav = Number(first.nav) || 0;
            const finalNav = Number(last.nav) || 0;

            if (initialNav > 0) {
              if (years >= 1) {
                // CAGR
                const cagr = (Math.pow(finalNav / initialNav, 1 / years) - 1) * 100;
                return Number(cagr.toFixed(2));
              } else {
                // Absolute return if < 1 year
                const abs = ((finalNav - initialNav) / initialNav) * 100;
                return Number(abs.toFixed(2));
              }
            }
          }
        }
        return null;
      } catch {
        return null;
      }
    };

    if (scheme === "Scheme B") {
      const navCagr = await tryNavCagr();
      if (navCagr !== null) return navCagr;
      // fall back to deposit/exposure if NAV missing
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
      const pmsData = await this.getPMSData(qcode);
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
      // Get effective qcode for schemes with overrides (e.g., Scheme QAW++ QUS00081 uses QAC00066)
      const effectiveQcode = PortfolioApi.getEffectiveQcode(scheme, qcode);
      const systemTag = PortfolioApi.getSystemTag(scheme, effectiveQcode);

      const firstNavRecord = await prisma.master_sheet.findFirst({
        where: { qcode: effectiveQcode, system_tag: systemTag, nav: { not: null } },
        orderBy: { date: "asc" },
        select: { nav: true, date: true },
      });

      const latestNavRecord = await prisma.master_sheet.findFirst({
        where: { qcode: effectiveQcode, system_tag: systemTag, nav: { not: null } },
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
    // If not Total Portfolio, defer to single-scheme logic (and keep your earlier hardcoded path)
    if (scheme !== "Total Portfolio") {
      const HC = this.getHardcoded(qcode);
      if (HC?.[scheme]) return parseFloat(HC[scheme].data.totalProfit);
      if (scheme === "Scheme PMS QAW") {
        const pms = await this.getPMSData(qcode);
        return pms.totalProfit;
      }
      // Get effective qcode for schemes with overrides (e.g., Scheme QAW++ QUS00081 uses QAC00066)
      const effectiveQcode = PortfolioApi.getEffectiveQcode(scheme, qcode);
      const systemTag = PortfolioApi.getSystemTag(scheme, effectiveQcode);
      const profitSum = await prisma.master_sheet.aggregate({
        where: { qcode: effectiveQcode, system_tag: systemTag },
        _sum: { pnl: true },
      });
      return Number(profitSum._sum.pnl) || 0;
    }

    // --- Total Portfolio: restrict to SARLA schemes when qcode === QAC00041 ---
    let total = 0;
    if (qcode === "QAC00041") {
      // Only SARLA schemes
      const sarlaSchemes = ["Scheme B", "Scheme PMS QAW", "Scheme A", "Scheme C", "Scheme QAW"];
      for (const s of sarlaSchemes) {
        const part = await this.getSingleSchemeProfit(qcode, s);
        console.log(`[TotalProfit] ${qcode} | ${s} = ${part}`);
        total += part;
      }
      console.log(`[TotalProfit] ${qcode} | TOTAL = ${total}`);
      return total;
    }

    // For other accounts (e.g., Satidham QAC00046) keep their own set
    const satidhamSchemes = ["Scheme B", "Scheme PMS QAW", "Scheme A", "Scheme A (Old)", "Scheme QAW++ QUS00081", "Scheme QYE++"];
    for (const s of satidhamSchemes) {
      const part = await this.getSingleSchemeProfit(qcode, s);
      console.log(`[TotalProfit] ${qcode} | ${s} = ${part}`);
      total += part;
    }
    console.log(`[TotalProfit] ${qcode} | TOTAL = ${total}`);
    return total;
  }
  private static async getHistoricalData(qcode: string, scheme: string): Promise<{ date: Date; nav: number; drawdown: number; pnl: number; capitalInOut: number }[]> {
    // Check for hardcoded historical data (for inactive schemes)
    const HC = this.getHardcoded(qcode);
    if (HC?.[scheme] && HC[scheme].data.equityCurve.length > 0) {
      return HC[scheme].data.equityCurve.map(entry => {
        const drawdownEntry = HC[scheme].data.drawdownCurve.find(d => d.date === entry.date);
        return {
          date: new Date(entry.date),
          nav: entry.nav,
          drawdown: drawdownEntry?.drawdown || 0,
          pnl: 0, // PnL is handled separately via hardcoded quarterlyPnl/monthlyPnl
          capitalInOut: 0, // Cash flows are handled separately via hardcoded cashFlows
        };
      });
    }

    if (scheme === "Scheme PMS QAW") {
      const pmsData = await this.getPMSData(qcode);
      return pmsData.historicalData.map(item => ({
        date: new Date(item.date),
        nav: item.nav,
        drawdown: item.drawdown,
        pnl: item.pnl,
        capitalInOut: item.capitalInOut,
      }));
    }

    // Get effective qcode for schemes with overrides (e.g., Scheme QAW++ QUS00081 uses QAC00066)
    const effectiveQcode = PortfolioApi.getEffectiveQcode(scheme, qcode);
    const systemTag = PortfolioApi.getSystemTag(scheme, effectiveQcode);

    const data = await prisma.master_sheet.findMany({
      where: {
        qcode: effectiveQcode,
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
  private static async getCashFlows(qcode: string, scheme: string): Promise<CashFlow[]> {
    // Check for hardcoded cash flows
    const HC = this.getHardcoded(qcode);
    if (HC?.[scheme] && scheme !== "Total Portfolio") {
      return HC[scheme].data.cashFlows.map(entry => ({
        date: PortfolioApi.normalizeDate(entry.date)!,
        amount: entry.amount,
        dividend: entry.dividend || 0,
      }));
    }

    if (scheme === "Scheme PMS QAW") {
      const pmsData = await this.getPMSData(qcode);
      return pmsData.cashFlows;
    }

    if (scheme === "Total Portfolio") {
      if (qcode === "QAC00046") {
        // Satidham Total Portfolio: aggregate cash flows from Scheme A, Scheme B, Scheme A (Old), Scheme PMS QAW, Scheme QAW++ QUS00081, and Scheme QYE++
        const satidhamSchemes = ["Scheme A", "Scheme B", "Scheme A (Old)", "Scheme PMS QAW", "Scheme QAW++ QUS00081", "Scheme QYE++"];
        let cashFlows: CashFlow[] = [];

        // Use hardcoded data for Satidham schemes
        for (const s of satidhamSchemes) {
          if (HC?.[s]) {
            cashFlows = cashFlows.concat(
              HC[s].data.cashFlows.map(entry => ({
                date: PortfolioApi.normalizeDate(entry.date)!,
                amount: entry.amount,
                dividend: entry.dividend || 0,
              }))
            );
          } else if (s === "Scheme QAW++ QUS00081") {
            // Fetch from database using QAC00066
            const effectiveQcode = PortfolioApi.getEffectiveQcode(s, qcode);
            const systemTag = PortfolioApi.getSystemTag(s, effectiveQcode);
            const schemeCashFlows = await prisma.master_sheet.findMany({
              where: {
                qcode: effectiveQcode,
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

        // Ensure cash flows are sorted by date
        return cashFlows.sort((a, b) => a.date.localeCompare(b.date));
      } else {
        // Existing logic for other accounts (e.g., Sarla)
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

        const pmsData = await this.getPMSData(qcode);
        cashFlows = cashFlows.concat(pmsData.cashFlows);

        return cashFlows.sort((a, b) => a.date.localeCompare(b.date));
      }
    }

    // Get effective qcode for schemes with overrides (e.g., Scheme QAW++ QUS00081 uses QAC00066)
    const effectiveQcode = PortfolioApi.getEffectiveQcode(scheme, qcode);
    const systemTag = scheme === "Scheme B" ? "Zerodha Total Portfolio" : PortfolioApi.getSystemTag(scheme, effectiveQcode);

    const cashFlows = await prisma.master_sheet.findMany({
      where: {
        qcode: effectiveQcode,
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
      "1y": 365,
      "2y": 731,
      "sinceInception": null,
    }
  ): Promise<Record<string, number | null | string>> {

    const HC = this.getHardcoded(qcode);
    if (HC?.[scheme]) {
      return HC[scheme].data.trailingReturns;
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

      if (period === "1y") {
        const exactOneYearAgo = new Date(currentDate);
        exactOneYearAgo.setFullYear(exactOneYearAgo.getFullYear() - 1);

        // Find the closest date *before or equal* to exactOneYearAgo
        let prevCandidate = null;
        for (const dataPoint of normalizedNavData) {
          const dataTime = new Date(dataPoint.date).getTime();
          if (dataTime <= exactOneYearAgo.getTime()) {
            if (!prevCandidate || dataTime > new Date(prevCandidate.date).getTime()) {
              prevCandidate = { nav: dataPoint.nav, date: new Date(dataPoint.date) };
            }
          }
        }

        if (prevCandidate) {
          const years = 1; // exactly 1y
          returns[period] = (Math.pow(lastNav / prevCandidate.nav, 1 / years) - 1) * 100;
        } else {
          returns[period] = null;
        }

        continue; // skip rest of generic period logic
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
    // Check for hardcoded monthly PnL
    const HC = this.getHardcoded(qcode);
    if (HC?.[scheme]) {
      return HC[scheme].data.monthlyPnl || {}; // Add fallback to empty object
    }
    if (scheme === "Scheme PMS QAW") {
      const pmsData = await this.getPMSData(qcode);

      // Calculate monthly PnL from PMS historical data
      const navData = pmsData.historicalData.map(item => ({
        date: item.date,
        nav: item.nav,
        pnl: item.pnl,
        capitalInOut: item.capitalInOut,
      }));

      if (!navData || navData.length === 0) {
        return {};
      }

      const sortedNavData = navData
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

      // Calculate year totals
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
    if (scheme === "Total Portfolio") {
      // Satidham (QAC00046) includes different schemes than Sarla (QAC00041)
      const isSatidham = qcode === "QAC00046";
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
      const pmsData = await PortfolioApi.getPMSData(qcode);
      allData.push(...pmsData.historicalData.map(item => ({
        date: item.date,
        nav: item.nav,
        pnl: item.pnl,
        capitalInOut: item.capitalInOut,
      })));

      // For Satidham, also fetch Scheme A, Scheme QAW++ QUS00081, and Scheme QYE++
      if (isSatidham) {
        const schemeAData = await PortfolioApi.getHistoricalData(qcode, "Scheme A");
        allData.push(...schemeAData.map(item => ({
          date: PortfolioApi.normalizeDate(item.date)!,
          nav: item.nav,
          pnl: item.pnl,
          capitalInOut: item.capitalInOut,
        })));

        const schemeQAWPlusData = await PortfolioApi.getHistoricalData(qcode, "Scheme QAW++ QUS00081");
        allData.push(...schemeQAWPlusData.map(item => ({
          date: PortfolioApi.normalizeDate(item.date)!,
          nav: item.nav,
          pnl: item.pnl,
          capitalInOut: item.capitalInOut,
        })));

        const schemeQYEData = await PortfolioApi.getHistoricalData(qcode, "Scheme QYE++");
        allData.push(...schemeQYEData.map(item => ({
          date: PortfolioApi.normalizeDate(item.date)!,
          nav: item.nav,
          pnl: item.pnl,
          capitalInOut: item.capitalInOut,
        })));
      }

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

    return formattedMonthlyPnl || {};
  }
  private static async calculateQuarterlyPnLWithDailyPL(
    qcode: string,
    scheme: string,
    navData: { date: string; nav: number; pnl: number }[]
  ): Promise<QuarterlyPnL> {
    // If hardcoded exists for this qcode/scheme, return it directly
    const HC = this.getHardcoded(qcode);
    if (HC?.[scheme]) {
      return HC[scheme].data.quarterlyPnl;
    }

    if (scheme === "Total Portfolio") {
      // Satidham (QAC00046) includes different schemes than Sarla (QAC00041)
      const isSatidham = qcode === "QAC00046";

      // PMS (QAW) data
      const pmsData = await this.getPMSData(qcode);
      const pmsQuarterlyPnl = this.calculateQuarterlyPnLFromNavData(
        pmsData.historicalData.map(d => ({
          date: d.date,
          nav: d.nav,
          pnl: d.pnl,
        }))
      );

      // Scheme B data
      const schemeBData = await PortfolioApi.getHistoricalData(qcode, "Scheme B");
      const schemeBQuarterlyPnl = this.calculateQuarterlyPnLFromNavData(
        schemeBData.map(d => ({
          date: PortfolioApi.normalizeDate(d.date)!,
          nav: d.nav,
          pnl: d.pnl,
        }))
      );

      // For Satidham, also calculate Scheme A, Scheme QAW++ QUS00081, and Scheme QYE++
      let schemeAQuarterlyPnl: QuarterlyPnL = {};
      let schemeQAWPlusQuarterlyPnl: QuarterlyPnL = {};
      let schemeQYEQuarterlyPnl: QuarterlyPnL = {};
      if (isSatidham) {
        const schemeAData = await PortfolioApi.getHistoricalData(qcode, "Scheme A");
        schemeAQuarterlyPnl = this.calculateQuarterlyPnLFromNavData(
          schemeAData.map(d => ({
            date: PortfolioApi.normalizeDate(d.date)!,
            nav: d.nav,
            pnl: d.pnl,
          }))
        );

        const schemeQAWPlusData = await PortfolioApi.getHistoricalData(qcode, "Scheme QAW++ QUS00081");
        schemeQAWPlusQuarterlyPnl = this.calculateQuarterlyPnLFromNavData(
          schemeQAWPlusData.map(d => ({
            date: PortfolioApi.normalizeDate(d.date)!,
            nav: d.nav,
            pnl: d.pnl,
          }))
        );

        const schemeQYEData = await PortfolioApi.getHistoricalData(qcode, "Scheme QYE++");
        schemeQYEQuarterlyPnl = this.calculateQuarterlyPnLFromNavData(
          schemeQYEData.map(d => ({
            date: PortfolioApi.normalizeDate(d.date)!,
            nav: d.nav,
            pnl: d.pnl,
          }))
        );
      }

      // Combined result
      const combinedQuarterlyPnL: QuarterlyPnL = {};

      // Helper: treat anything after Q2 2025 as dynamic
      const isAfterQ2_2025 = (year: string, quarter?: string): boolean => {
        const y = parseInt(year, 10);
        if (y > 2025) return true;
        if (y === 2025 && quarter) {
          const qn = parseInt(quarter.replace("q", ""), 10);
          return qn > 2;
        }
        return false;
      };

      // 1) Seed AC5 hardcoded values up to Q2 2025
      if (qcode === "QAC00046") {
        // Seed Satidham hardcoded values up to Q3 2025
        Object.entries(AC8_QUARTERLY_PNL).forEach(([year, quarters]) => {
          combinedQuarterlyPnL[year] = {
            percent: { q1: "-", q2: "-", q3: "-", q4: "-", total: "-" },
            cash: {
              q1: quarters.Q1 != null ? quarters.Q1.toFixed(2) : "-",
              q2: quarters.Q2 != null ? quarters.Q2.toFixed(2) : "-",
              q3: quarters.Q3 != null ? quarters.Q3.toFixed(2) : "-",
              q4: quarters.Q4 != null ? quarters.Q4.toFixed(2) : "-",
              total: quarters.total != null ? quarters.total.toFixed(2) : "-",
            },
            yearCash: quarters.total != null ? quarters.total.toFixed(2) : "-",
          };
        });
      } else {
        // Existing AC5 logic for other qcodes
        Object.entries(AC5_QUARTERLY_PNL).forEach(([year, quarters]) => {
          combinedQuarterlyPnL[year] = {
            percent: { q1: "-", q2: "-", q3: "-", q4: "-", total: "-" },
            cash: {
              q1: quarters.Q1 != null ? quarters.Q1.toFixed(2) : "-",
              q2: quarters.Q2 != null ? quarters.Q2.toFixed(2) : "-",
              q3: quarters.Q3 != null ? quarters.Q3.toFixed(2) : "-",
              q4: quarters.Q4 != null ? quarters.Q4.toFixed(2) : "-",
              total: quarters.total != null ? quarters.total.toFixed(2) : "-",
            },
            yearCash: quarters.total != null ? quarters.total.toFixed(2) : "-",
          };
        });
      }

      // 2) Ensure we cover all years present in PMS/Scheme B (and Satidham schemes if applicable)
      const allYears = new Set([
        ...Object.keys(pmsQuarterlyPnl),
        ...Object.keys(schemeBQuarterlyPnl),
        ...Object.keys(combinedQuarterlyPnL),
        ...(isSatidham ? Object.keys(schemeAQuarterlyPnl) : []),
        ...(isSatidham ? Object.keys(schemeQAWPlusQuarterlyPnl) : []),
        ...(isSatidham ? Object.keys(schemeQYEQuarterlyPnl) : []),
      ]);

      const quarterKeys = ["q1", "q2", "q3", "q4"] as const;

      allYears.forEach((year) => {
        if (!combinedQuarterlyPnL[year]) {
          combinedQuarterlyPnL[year] = {
            percent: { q1: "-", q2: "-", q3: "-", q4: "-", total: "-" },
            cash: { q1: "-", q2: "-", q3: "-", q4: "-", total: "-" },
            yearCash: "-",
          };
        }

        let yearTotal = 0;

        quarterKeys.forEach((quarter) => {
          if (isAfterQ2_2025(year, quarter)) {
            // Dynamic: PMS + Scheme B (+ Scheme A + Scheme QAW++ for Satidham)
            const pmsVal = PortfolioApi.safeNum(pmsQuarterlyPnl[year]?.cash[quarter]);
            const bVal = PortfolioApi.safeNum(schemeBQuarterlyPnl[year]?.cash[quarter]);
            let sum = pmsVal + bVal;

            // For Satidham, also add Scheme A, Scheme QAW++ QUS00081, and Scheme QYE++
            if (isSatidham) {
              const aVal = PortfolioApi.safeNum(schemeAQuarterlyPnl[year]?.cash[quarter]);
              const qawPlusVal = PortfolioApi.safeNum(schemeQAWPlusQuarterlyPnl[year]?.cash[quarter]);
              const qyeVal = PortfolioApi.safeNum(schemeQYEQuarterlyPnl[year]?.cash[quarter]);
              sum += aVal + qawPlusVal + qyeVal;
            }

            combinedQuarterlyPnL[year].cash[quarter] = sum.toFixed(2);
          } else {
            // Up to Q2-2025: keep hardcoded AC5 values exactly as seeded.
            // If you ever need to add PMS on top, uncomment the + pms part:
            const existing = PortfolioApi.safeNum(combinedQuarterlyPnL[year].cash[quarter]);
            // const pmsPart = PortfolioApi.safeNum(pmsQuarterlyPnl[year]?.cash[quarter]);
            combinedQuarterlyPnL[year].cash[quarter] = (existing /* + pmsPart */).toFixed(2);
          }

          yearTotal += PortfolioApi.safeNum(combinedQuarterlyPnL[year].cash[quarter]);
        });

        combinedQuarterlyPnL[year].cash.total = yearTotal.toFixed(2);
        combinedQuarterlyPnL[year].yearCash = yearTotal.toFixed(2);
      });

      return combinedQuarterlyPnL;
    }

    // PMS-only (Scheme PMS QAW)
    // PMS-only (Scheme PMS QAW)
if (scheme === "Scheme PMS QAW") {
  const pmsQuarterlyPnl = this.calculateQuarterlyPnLFromNavData(navData);

  // Force Q2 2025 override only for Sarla (QAC00041)
  if (qcode === "QAC00041" && pmsQuarterlyPnl["2025"]) {
    pmsQuarterlyPnl["2025"].cash.q2 = PMS_QAW_Q2_2025_VALUE.toFixed(2);
  }

  // Recompute totals safely
  Object.keys(pmsQuarterlyPnl).forEach((year) => {
    let sum = 0;
    (["q1", "q2", "q3", "q4"] as const).forEach((q) => {
      sum += PortfolioApi.safeNum(pmsQuarterlyPnl[year].cash[q]);
    });
    const totalStr = sum.toFixed(2);
    pmsQuarterlyPnl[year].cash.total = totalStr;
    pmsQuarterlyPnl[year].yearCash = totalStr;
  });

  return pmsQuarterlyPnl;
}

    // Default: compute from master_sheet for the specific scheme
    // Get effective qcode for schemes with overrides (e.g., Scheme QAW++ QUS00081 uses QAC00066)
    const effectiveQcode = PortfolioApi.getEffectiveQcode(scheme, qcode);
    const systemTag = PortfolioApi.getSystemTag(scheme, effectiveQcode);
    const portfolioValues = await prisma.master_sheet.findMany({
      where: { qcode: effectiveQcode, system_tag: systemTag, portfolio_value: { not: null } },
      select: { date: true, portfolio_value: true, daily_p_l: true },
      orderBy: { date: "asc" },
    });
    if (!portfolioValues.length) return {};

    const sortedNavData = navData
      .map((entry) => ({ ...entry, date: PortfolioApi.normalizeDate(entry.date) }))
      .filter((entry) => entry.date)
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
    let accountCode: string = "AC5"; // Default value, declare outside try block

    try {
      let results: Record<string, PortfolioResponse> = {};
      const url = new URL(request.url);
      const qcode = url.searchParams.get("qcode") || "QAC00041"; // Default to QAC00041 if no qcode provided
      accountCode = qcode === "QAC00046" ? "AC8" : "AC5"; // AC8 for Satidham (QAC00046), AC5 for Sarla (QAC00041)
      const allSchemes = Object.keys(PORTFOLIO_MAPPING[accountCode]).filter(s => s !== "Scheme PMS-QAW");
      let schemes: string[] = [];

      if (accountCode === "AC8") {
        // Satidham order
        const prioritySchemes = ["Total Portfolio", "Scheme PMS QAW"];
        const remainingSchemes = allSchemes.filter(s => !prioritySchemes.includes(s));
        schemes = [...prioritySchemes, ...remainingSchemes];
      } else {
        // Sarla order
        const prioritySchemes = ["Total Portfolio", "Scheme B", "Scheme PMS QAW"];
        const remainingSchemes = allSchemes.filter(s => !prioritySchemes.includes(s));
        schemes = [...prioritySchemes, ...remainingSchemes];
      }

      // const remainingSchemes = allSchemes.filter(s => !prioritySchemes.includes(s));
      // const schemes = [...prioritySchemes, ...remainingSchemes];

      for (const scheme of schemes) {
        let cashInOutData: Array<{ date: Date; capital_in_out: Decimal | number | null }> = [];
        let masterSheetData: Array<{
          date: Date;
          nav: number | null;
          drawdown: number | null;
          portfolio_value: number | null;
          daily_p_l: number | null;
          pnl: number | null;
          capital_in_out: Decimal | number | null;
        }> = [];
        const portfolioNames = PortfolioApi.getPortfolioNames(accountCode, scheme);
        // Get effective qcode for schemes with overrides (e.g., Scheme QAW++ QUS00081 uses QAC00066)
        const effectiveQcode = PortfolioApi.getEffectiveQcode(scheme, qcode);
        const systemTag = PortfolioApi.getSystemTag(scheme, effectiveQcode);

        if (scheme === "Scheme PMS QAW") {
          cashInOutData = [];
          masterSheetData = [];
        } else {
          [cashInOutData, masterSheetData] = await Promise.all([
            prisma.master_sheet.findMany({
              where: { qcode: effectiveQcode, system_tag: systemTag, capital_in_out: { not: null } },
              select: { date: true, capital_in_out: true },
              orderBy: { date: "asc" },
            }),
            prisma.master_sheet.findMany({
              where: { qcode: effectiveQcode, system_tag: systemTag },
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
        const cashFlows = await PortfolioApi.getCashFlows(qcode, scheme);
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
          inceptionDate: historicalData.length > 0 ? PortfolioApi.normalizeDate(historicalData[0].date)! : "2022-09-14",
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
      console.error(`${accountCode === "AC8" ? "Satidham" : "Sarla"} Portfolio API Error:`, error);
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