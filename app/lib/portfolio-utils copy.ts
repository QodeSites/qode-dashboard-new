// app/lib/portfolio-utils.ts
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

// Interface for stats
interface Stats {
  amountDeposited: string;
  currentExposure: string;
  return: string;
  totalProfit: string;
  trailingReturns: {
    fiveDays: string;
    tenDays: string;
    oneMonth: string;
    threeMonths: string;
    sixMonths: string;
    oneYear: string;
    twoYears: string;
    fiveYears: string;
    sinceInception: string;
    MDD: string; // Maximum Drawdown
    currentDD: string; // Current Drawdown
  };
  drawdown: string;
  equityCurve: { date: string; value: number }[];
  drawdownCurve: { date: string; value: number }[];
  quarterlyPnl: {
    [year: string]: {
      percent: { q1: string; q2: string; q3: string; q4: string; total: string };
      cash: { q1: string; q2: string; q3: string; q4: string; total: string };
      yearCash: string;
    };
  };
  monthlyPnl: {
    [year: string]: {
      months: { [month: string]: { percent: string; cash: string; capitalInOut: string } };
      totalPercent: number;
      totalCash: number;
      totalCapitalInOut: number;
    };
  };
  cashFlows: { date: string; amount: number }[];
}

// Interface for data fetching strategy
interface DataFetchingStrategy {
  getAmountDeposited(qcode: string): Promise<number>;
  getLatestExposure(qcode: string): Promise<{ portfolioValue: number; drawdown: number; nav: number; date: Date } | null>;
  getPortfolioReturns(qcode: string): Promise<number>;
  getTotalProfit(qcode: string): Promise<number>;
  getHistoricalData(qcode: string): Promise<{ date: Date; nav: number; drawdown: number; pnl: number; capitalInOut: number }[]>;
  getFirstNav(qcode: string): Promise<{ nav: number; date: Date } | null>;
  getNavAtDate(qcode: string, targetDate: Date, direction: 'before' | 'after' | 'closest'): Promise<{ nav: number; date: Date } | null>;
  getCashFlows?(qcode: string): Promise<{ date: Date; amount: number }[]>;
}

// Strategy for Managed Accounts (Jainam)
class JainamManagedStrategy implements DataFetchingStrategy {
  async getAmountDeposited(qcode: string): Promise<number> {
    const depositRecords = await prisma.master_sheet_test.findFirst({
      where: { qcode, system_tag: "Jainam Total Portfolio Deposit" },
      orderBy: { date: "desc" },
      select: { portfolio_value: true },
    });
    return Number(depositRecords?.portfolio_value) || 0;
  }

  async getLatestExposure(qcode: string): Promise<{ portfolioValue: number; drawdown: number; nav: number; date: Date } | null> {
    const record = await prisma.master_sheet_test.findFirst({
      where: { qcode, system_tag: "Jainam Total Portfolio Exposure" },
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

  async getTotalProfit(qcode: string): Promise<number> {
    const profitSum = await prisma.master_sheet_test.aggregate({
      where: { qcode, system_tag: "Jainam Total Portfolio Exposure" },
      _sum: { pnl: true },
    });
    return Number(profitSum._sum.pnl) || 0;
  }

  async getHistoricalData(qcode: string): Promise<{ date: Date; nav: number; drawdown: number; pnl: number; capitalInOut: number }[]> {
    const data = await prisma.master_sheet_test.findMany({
      where: { qcode, system_tag: "Jainam Total Portfolio Exposure", nav: { not: null }, drawdown: { not: null } },
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

  async getFirstNav(qcode: string): Promise<{ nav: number; date: Date } | null> {
    const record = await prisma.master_sheet_test.findFirst({
      where: { qcode, system_tag: "Jainam Total Portfolio Exposure", nav: { not: null } },
      orderBy: { date: "asc" },
      select: { nav: true, date: true },
    });
    if (!record) return null;
    return { nav: Number(record.nav), date: record.date };
  }

  async getNavAtDate(qcode: string, targetDate: Date, direction: 'before' | 'after' | 'closest'): Promise<{ nav: number; date: Date } | null> {
    let whereClause: any = { qcode, system_tag: "Jainam Total Portfolio Exposure", nav: { not: null } };
    let orderBy: any = { date: "desc" };

    if (direction === 'before') {
      whereClause.date = { lte: targetDate };
      orderBy = { date: "desc" };
    } else if (direction === 'after') {
      whereClause.date = { gte: targetDate };
      orderBy = { date: "asc" };
    }

    const result = await prisma.master_sheet_test.findFirst({ where: whereClause, orderBy, select: { nav: true, date: true } });
    if (!result) {
      if (direction === 'closest') {
        const beforeResult = await this.getNavAtDate(qcode, targetDate, 'before');
        const afterResult = await this.getNavAtDate(qcode, targetDate, 'after');
        if (!beforeResult && !afterResult) return null;
        if (!beforeResult) return afterResult;
        if (!afterResult) return beforeResult;
        const beforeDiff = Math.abs(targetDate.getTime() - beforeResult.date.getTime());
        const afterDiff = Math.abs(targetDate.getTime() - afterResult.date.getTime());
        return beforeDiff <= afterDiff ? beforeResult : afterResult;
      }
      return null;
    }
    return { nav: Number(result.nav), date: result.date };
  }
}

// Strategy for Managed Accounts (Zerodha)
class ZerodhaManagedStrategy implements DataFetchingStrategy {
  async getAmountDeposited(qcode: string): Promise<number> {
    const depositSum = await prisma.master_sheet_test.aggregate({
      where: { qcode, system_tag: "Zerodha Total Portfolio", capital_in_out: { not: null } },
      _sum: { capital_in_out: true },
    });
    return Number(depositSum._sum.capital_in_out) || 0;
  }

  async getLatestExposure(qcode: string): Promise<{ portfolioValue: number; drawdown: number; nav: number; date: Date } | null> {
    const record = await prisma.master_sheet_test.findFirst({
      where: { qcode, system_tag: "Zerodha Total Portfolio" },
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

  async getPortfolioReturns(qcode: string): Promise<number> {
    try {
      const portfolioReturn = await prisma.master_sheet_test.aggregate({
        where: { qcode, system_tag: "Total Portfolio Value", daily_p_l: { not: null } },
        _sum: { daily_p_l: true },
      });
      return Number(portfolioReturn._sum.daily_p_l) || 0;
    } catch (error) {
      console.error(`Error calculating portfolio returns for qcode ${qcode}:`, error);
      return 0;
    }
  }

  async getTotalProfit(qcode: string): Promise<number> {
    const profitSum = await prisma.master_sheet_test.aggregate({
      where: { qcode, system_tag: "Total Portfolio Value" },
      _sum: { pnl: true },
    });
    return Number(profitSum._sum.pnl) || 0;
  }

  async getHistoricalData(qcode: string): Promise<{ date: Date; nav: number; drawdown: number; pnl: number; capitalInOut: number }[]> {
    const data = await prisma.master_sheet_test.findMany({
      where: { qcode, system_tag: "Total Portfolio Value", nav: { not: null }, drawdown: { not: null } },
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

  async getCashFlows(qcode: string): Promise<{ date: Date; amount: number }[]> {
    const cashFlows = await prisma.master_sheet_test.findMany({
      where: {
        qcode,
        system_tag: "Zerodha Total Portfolio",
        capital_in_out: {
          not: null,
          not: new Decimal(0),
        },
      },
      select: { date: true, capital_in_out: true },
      orderBy: { date: "asc" },
    });

    return cashFlows.map(entry => ({
      date: entry.date,
      amount: entry.capital_in_out!.toNumber(),
    }));
  }

  async getFirstNav(qcode: string): Promise<{ nav: number; date: Date } | null> {
    const record = await prisma.master_sheet_test.findFirst({
      where: { qcode, system_tag: "Total Portfolio Value", nav: { not: null } },
      orderBy: { date: "asc" },
      select: { nav: true, date: true },
    });
    if (!record) return null;
    return { nav: Number(record.nav), date: record.date };
  }
  
  async getNavAtDate(qcode: string, targetDate: Date, direction: 'before' | 'after' | 'closest'): Promise<{ nav: number; date: Date } | null> {
    let whereClause: any = { qcode, system_tag: "Total Portfolio Value", nav: { not: null } };
    let orderBy: any = { date: "desc" };

    if (direction === 'before') {
      whereClause.date = { lte: targetDate };
      orderBy = { date: "desc" };
    } else if (direction === 'after') {
      whereClause.date = { gte: targetDate };
      orderBy = { date: "asc" };
    }

    const result = await prisma.master_sheet_test.findFirst({ where: whereClause, orderBy, select: { nav: true, date: true } });
    if (!result) {
      if (direction === 'closest') {
        const beforeResult = await this.getNavAtDate(qcode, targetDate, 'before');
        const afterResult = await this.getNavAtDate(qcode, targetDate, 'after');
        if (!beforeResult && !afterResult) return null;
        if (!beforeResult) return afterResult;
        if (!afterResult) return beforeResult;
        const beforeDiff = Math.abs(targetDate.getTime() - beforeResult.date.getTime());
        const afterDiff = Math.abs(targetDate.getTime() - afterResult.date.getTime());
        return beforeDiff <= afterDiff ? beforeResult : afterResult;
      }
      return null;
    }
    return { nav: Number(result.nav), date: result.date };
  }
}

// Strategy for PMS Accounts (Nuvama/Orbis)
class PmsStrategy implements DataFetchingStrategy {
  async getAmountDeposited(qcode: string): Promise<number> {
    const custodianCodes = await prisma.account_custodian_codes.findMany({
      where: { qcode },
      select: { custodian_code: true },
    });
    const codes = custodianCodes.map(c => c.custodian_code);
    const depositSum = await prisma.pms_master_sheet.aggregate({
      where: { account_code: { in: codes }, cash_in_out: { not: null } },
      _sum: { cash_in_out: true },
    });
    return Number(depositSum._sum.cash_in_out) || 0;
  }

  async getLatestExposure(qcode: string): Promise<{ portfolioValue: number; drawdown: number; nav: number; date: Date } | null> {
    const custodianCodes = await prisma.account_custodian_codes.findMany({
      where: { qcode },
      select: { custodian_code: true },
    });
    const codes = custodianCodes.map(c => c.custodian_code);
    const record = await prisma.pms_master_sheet.findFirst({
      where: { account_code: { in: codes } },
      orderBy: { report_date: "desc" },
      select: { portfolio_value: true, drawdown_percent: true, nav: true, report_date: true },
    });
    if (!record) return null;
    return {
      portfolioValue: Number(record.portfolio_value) || 0,
      drawdown: Math.abs(Number(record.drawdown_percent) || 0),
      nav: Number(record.nav) || 0,
      date: record.report_date,
    };
  }

  async getTotalProfit(qcode: string): Promise<number> {
    const custodianCodes = await prisma.account_custodian_codes.findMany({
      where: { qcode },
      select: { custodian_code: true },
    });
    const codes = custodianCodes.map(c => c.custodian_code);
    const profitSum = await prisma.pms_master_sheet.aggregate({
      where: { account_code: { in: codes } },
      _sum: { pnl: true },
    });
    return Number(profitSum._sum.pnl) || 0;
  }

  async getHistoricalData(qcode: string): Promise<{ date: Date; nav: number; drawdown: number; pnl: number; capitalInOut: number }[]> {
    const custodianCodes = await prisma.account_custodian_codes.findMany({
      where: { qcode },
      select: { custodian_code: true },
    });
    const codes = custodianCodes.map(c => c.custodian_code);
    const data = await prisma.pms_master_sheet.findMany({
      where: { account_code: { in: codes }, nav: { not: null }, drawdown_percent: { not: null } },
      select: { report_date: true, nav: true, drawdown_percent: true, pnl: true, cash_in_out: true },
      orderBy: { report_date: "asc" },
    });
    return data.map(entry => ({
      date: entry.report_date,
      nav: Number(entry.nav) || 0,
      drawdown: Math.abs(Number(entry.drawdown_percent) || 0),
      pnl: Number(entry.pnl) || 0,
      capitalInOut: Number(entry.cash_in_out) || 0,
    }));
  }

  async getFirstNav(qcode: string): Promise<{ nav: number; date: Date } | null> {
    const custodianCodes = await prisma.account_custodian_codes.findMany({
      where: { qcode },
      select: { custodian_code: true },
    });
    const codes = custodianCodes.map(c => c.custodian_code);
    const record = await prisma.pms_master_sheet.findFirst({
      where: { account_code: { in: codes }, nav: { not: null } },
      orderBy: { report_date: "asc" },
      select: { nav: true, report_date: true },
    });
    if (!record) return null;
    return { nav: Number(record.nav), date: record.report_date };
  }

  async getNavAtDate(qcode: string, targetDate: Date, direction: 'before' | 'after' | 'closest'): Promise<{ nav: number; date: Date } | null> {
    const custodianCodes = await prisma.account_custodian_codes.findMany({
      where: { qcode },
      select: { custodian_code: true },
    });
    const codes = custodianCodes.map(c => c.custodian_code);
    let whereClause: any = { account_code: { in: codes }, nav: { not: null } };
    let orderBy: any = { report_date: "desc" };

    if (direction === 'before') {
      whereClause.report_date = { lte: targetDate };
      orderBy = { report_date: "desc" };
    } else if (direction === 'after') {
      whereClause.report_date = { gte: targetDate };
      orderBy = { report_date: "asc" };
    }

    const result = await prisma.pms_master_sheet.findFirst({ where: whereClause, orderBy, select: { nav: true, report_date: true } });
    if (!result) {
      if (direction === 'closest') {
        const beforeResult = await this.getNavAtDate(qcode, targetDate, 'before');
        const afterResult = await this.getNavAtDate(qcode, targetDate, 'after');
        if (!beforeResult && !afterResult) return null;
        if (!beforeResult) return afterResult;
        if (!afterResult) return beforeResult;
        const beforeDiff = Math.abs(targetDate.getTime() - beforeResult.date.getTime());
        const afterDiff = Math.abs(targetDate.getTime() - afterResult.date.getTime());
        return beforeDiff <= afterDiff ? beforeResult : afterResult;
      }
      return null;
    }
    return { nav: Number(result.nav), date: result.report_date };
  }
}

// Strategy factory to select the appropriate strategy
function getDataFetchingStrategy(account: { account_type: string; broker: string }): DataFetchingStrategy {
  if (account.account_type === 'pms') {
    return new PmsStrategy();
  } else if (account.account_type === 'managed_account' && account.broker === 'jainam') {
    return new JainamManagedStrategy();
  } else if (account.account_type === 'managed_account' && account.broker === 'zerodha') {
    return new ZerodhaManagedStrategy();
  }
  throw new Error(`Unsupported account type: ${account.account_type} or broker: ${account.broker}`);
}

// Helper function to fetch qcodes for a user
export async function getUserQcodes(icode: string): Promise<{ qcode: string; account_type: string; broker: string }[]> {
  try {
    const accounts = await prisma.accounts.findMany({
      where: {
        OR: [
          { pooled_account_users: { some: { icode } } },
          { pooled_account_allocations: { some: { icode } } },
        ],
        account_type: { not: undefined },
        broker: { not: undefined },
      },
      select: { qcode: true, account_type: true, broker: true },
      distinct: ['qcode'],
    });
    console.log(`getUserQcodes: icode=${icode}, result=${JSON.stringify(accounts)}`);
    return accounts;
  } catch (error) {
    console.error("Error fetching qcodes:", error);
    return [];
  }
}

// Helper function to get quarter from month
const getQuarter = (month: number): string => {
  if (month < 3) return "q1";
  if (month < 6) return "q2";
  if (month < 9) return "q3";
  return "q4";
};

// Helper function to get month name
const getMonthName = (month: number): string => {
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return monthNames[month];
};

// Calculate portfolio metrics
export async function calculatePortfolioMetrics(qcodesWithDetails: { qcode: string; account_type: string; broker: string }[]): Promise<any> {
  try {
    if (!qcodesWithDetails.length) {
      console.log("No qcodes provided for portfolio metrics calculation");
      return null;
    }

    // Initialize metrics
    let amountDeposited = 0;
    let currentExposure = 0;
    let totalReturn = 0;
    let totalProfit = 0;
    let maxDrawdown = 0;
    let allCashFlows: { date: string; amount: number }[] = [];
    let accountMaxDrawdowns: { [qcode: string]: number } = {};
    let accountCurrentDrawdowns: { [qcode: string]: number } = {};

    // For weighted returns calculation
    const portfolioValues: { [qcode: string]: number } = {};
    const accountReturns: { [period: string]: { [qcode: string]: number } } = {};
    const navCurveMap = new Map<string, { totalNav: number; count: number }>();
    const drawdownCurveMap = new Map<string, { total: number; count: number }>();

    // FIXED: Better structure for quarterly/monthly PnL tracking
    const quarterlyPnl: {
      [year: string]: {
        [quarter: string]: {
          startNav: number;
          endNav: number;
          capitalInOut: number;
          cashPnL: number;
          accountCount: number;
        };
      };
    } = {};

    const monthlyPnl: {
      [yearMonth: string]: {
        startNav: number;
        endNav: number;
        capitalInOut: number;
        cashPnL: number;
        accountCount: number;
      };
    } = {};

    const cashInOut: {
      transactions: { date: string; amount: number }[];
      total: number;
    } = { transactions: [], total: 0 };

    // Initialize account returns structure
    const periodLabels = ["fiveDays", "tenDays", "oneMonth", "threeMonths", "sixMonths", "oneYear", "twoYears", "fiveYears", "sinceInception", "MDD", "currentDD"];
    periodLabels.forEach(label => {
      accountReturns[label] = {};
    });

    // Process each qcode
    for (const { qcode, account_type, broker } of qcodesWithDetails) {
      console.log(`Processing qcode: ${qcode}, type: ${account_type}, broker: ${broker}`);
      const strategy = getDataFetchingStrategy({ account_type, broker });

      // 1. Amount Deposited
      const accountDeposited = await strategy.getAmountDeposited(qcode);
      amountDeposited += accountDeposited;

      // 2. Current Exposure and Drawdown
      const latestExposure = await strategy.getLatestExposure(qcode);
      if (latestExposure) {
        currentExposure += latestExposure.portfolioValue;
        portfolioValues[qcode] = latestExposure.portfolioValue;
        accountCurrentDrawdowns[qcode] = latestExposure.drawdown;
      }

      // 3. Portfolio Returns
      totalReturn = await strategy.getPortfolioReturns(qcode);

      // 4. Total Profit
      totalProfit += await strategy.getTotalProfit(qcode);

      // 5. Cash Flows
      if (strategy.getCashFlows) {
        const flows = await strategy.getCashFlows(qcode);
        flows.forEach(f =>
          allCashFlows.push({
            date: f.date.toISOString().split("T")[0],
            amount: Number(f.amount),
          })
        );
      }

      // 6. Get latest NAV for calculations
      if (!latestExposure?.nav) continue;
      const latestNavData = { nav: latestExposure.nav, date: latestExposure.date };
      const asOfDate = latestNavData.date;

      const MS_PER_DAY = 24 * 60 * 60 * 1000;
      const periods = [
        { date: new Date(asOfDate.getTime() - 5 * MS_PER_DAY), label: "fiveDays" },
        { date: new Date(asOfDate.getTime() - 10 * MS_PER_DAY), label: "tenDays" },
        { date: new Date(asOfDate.getTime() - 30 * MS_PER_DAY), label: "oneMonth" },
        { date: new Date(asOfDate.getTime() - 90 * MS_PER_DAY), label: "threeMonths" },
        { date: new Date(asOfDate.getTime() - 180 * MS_PER_DAY), label: "sixMonths" },
        { date: new Date(asOfDate.getTime() - 365 * MS_PER_DAY), label: "oneYear" },
        { date: new Date(asOfDate.getTime() - 2 * 365 * MS_PER_DAY), label: "twoYears" },
        { date: new Date(asOfDate.getTime() - 5 * 365 * MS_PER_DAY), label: "fiveYears" },
      ];

      // Since inception calculation
      const firstNav = await strategy.getFirstNav(qcode);
      if (firstNav) {
        const startNav = firstNav.nav;
        const endNav = latestNavData.nav;
        const sinceInceptionReturn = startNav > 0 ? ((endNav - startNav) / startNav) * 100 : 0;
        accountReturns.sinceInception[qcode] = sinceInceptionReturn;
        console.log(`Qcode ${qcode} - Since Inception: ${startNav} -> ${endNav} = ${sinceInceptionReturn.toFixed(2)}%`);
      }

      // Calculate returns for each period
      for (const period of periods) {
        const periodStartData = await strategy.getNavAtDate(qcode, period.date, 'before');
        if (periodStartData) {
          const startNav = periodStartData.nav;
          const endNav = latestNavData.nav;
          const periodReturn = startNav > 0 ? ((endNav - startNav) / startNav) * 100 : 0;
          accountReturns[period.label][qcode] = periodReturn;
          console.log(`DEBUG: Qcode ${qcode} - ${period.label}: startNav=${startNav.toFixed(4)}, endNav=${endNav.toFixed(4)}, return=${periodReturn.toFixed(2)}%, startDate=${periodStartData.date.toISOString().split("T")[0]}, endDate=${latestNavData.date.toISOString().split("T")[0]}`);
        } else {
          console.log(`DEBUG: Qcode ${qcode} - ${period.label}: No start data found for date ${period.date.toISOString().split("T")[0]}`);
        }
      }

      // Calculate MDD for the account
      // Calculate returns for each period - UPDATED LOGIC
      const historicalData = await strategy.getHistoricalData(qcode);
      historicalData.sort((a, b) => a.date.getTime() - b.date.getTime());
      
      if (historicalData.length === 0) continue;
      
      // Get the latest data point from historical data
      const latestHistoricalData = historicalData[historicalData.length - 1];
      const currentNav = latestHistoricalData.nav;
      const currentDate = latestHistoricalData.date;
      
      // Define periods in days
      const periodDays = {
        fiveDays: 5,
        tenDays: 10,
        oneMonth: 30,
        threeMonths: 90,
        sixMonths: 180,
        oneYear: 365,
        twoYears: 730,
        fiveYears: 1825
      };

      for (const period of periods) {
        const periodLabel = period.label;
        const days = periodDays[periodLabel];
        
        if (days) {
          const targetDate = new Date(currentDate.getTime() - days * 24 * 60 * 60 * 1000);
          
          // Find the closest data point to the target date (at or before)
          let startData = null;
          let minDiff = Infinity;
          
          for (const dataPoint of historicalData) {
            const dateDiff = targetDate.getTime() - dataPoint.date.getTime();
            
            // We want data at or before the target date
            if (dateDiff >= 0 && dateDiff < minDiff) {
              minDiff = dateDiff;
              startData = dataPoint;
            }
          }
          
          if (startData) {
            const startNav = startData.nav;
            const periodReturn = startNav > 0 ? ((currentNav - startNav) / startNav) * 100 : 0;
            accountReturns[periodLabel][qcode] = periodReturn;
            console.log(`DEBUG: Qcode ${qcode} - ${periodLabel}: startNav=${startNav.toFixed(4)} (${startData.date.toISOString().split("T")[0]}), endNav=${currentNav.toFixed(4)} (${currentDate.toISOString().split("T")[0]}), return=${periodReturn.toFixed(4)}%`);
          } else {
            console.log(`DEBUG: Qcode ${qcode} - ${periodLabel}: No data found for period (need data from ${targetDate.toISOString().split("T")[0]} or earlier)`);
          }
        }
      }

      // Since inception calculation - UPDATED LOGIC
      if (historicalData.length > 0) {
        const firstData = historicalData[0];
        const startNav = firstData.nav;
        const endNav = currentNav;
        const sinceInceptionReturn = startNav > 0 ? ((endNav - startNav) / startNav) * 100 : 0;
        accountReturns.sinceInception[qcode] = sinceInceptionReturn;
        console.log(`Qcode ${qcode} - Since Inception: ${startNav.toFixed(4)} (${firstData.date.toISOString().split("T")[0]}) -> ${endNav.toFixed(4)} (${currentDate.toISOString().split("T")[0]}) = ${sinceInceptionReturn.toFixed(4)}%`);
      }

      // Calculate MDD for the account - UPDATED LOGIC
      let maxDrawdownForAccount = 0;
      let peakNav = 0;
      
      for (const entry of historicalData) {
        peakNav = Math.max(peakNav, entry.nav);
        const drawdown = peakNav > 0 ? ((peakNav - entry.nav) / peakNav) * 100 : 0;
        maxDrawdownForAccount = Math.max(maxDrawdownForAccount, drawdown);
      }
      
      // Current drawdown calculation - NEW
      const currentDrawdown = peakNav > 0 ? ((peakNav - currentNav) / peakNav) * 100 : 0;
      accountCurrentDrawdowns[qcode] = currentDrawdown;
      
      accountMaxDrawdowns[qcode] = maxDrawdownForAccount;
      maxDrawdown = Math.max(maxDrawdown, maxDrawdownForAccount);

      // 7. Monthly and Quarterly PnL calculation - UPDATED LOGIC
      const monthlyData: { [yearMonth: string]: { entries: any[], startNav?: number, endNav?: number } } = {};

      // Group historical data by month
      for (const entry of historicalData) {
        const dateKey = entry.date.toISOString().split("T")[0];
        const year = entry.date.getUTCFullYear();
        const month = entry.date.getUTCMonth();
        const yearMonth = `${year}-${String(month + 1).padStart(2, '0')}`;

        // NAV and Drawdown Curves
        navCurveMap.set(dateKey, {
          totalNav: (navCurveMap.get(dateKey)?.totalNav || 0) + entry.nav,
          count: (navCurveMap.get(dateKey)?.count || 0) + 1,
        });
        
        // Calculate drawdown for this entry
        const entryDrawdown = peakNav > 0 ? ((peakNav - entry.nav) / peakNav) * 100 : 0;
        drawdownCurveMap.set(dateKey, {
          total: (drawdownCurveMap.get(dateKey)?.total || 0) + entryDrawdown,
          count: (drawdownCurveMap.get(dateKey)?.count || 0) + 1,
        });

        // Group by month for proper start/end calculation
        if (!monthlyData[yearMonth]) {
          monthlyData[yearMonth] = { entries: [] };
        }
        monthlyData[yearMonth].entries.push(entry);

        // Cash In/Out
        if (entry.capitalInOut !== 0) {
          cashInOut.transactions.push({ date: dateKey, amount: entry.capitalInOut });
          cashInOut.total += entry.capitalInOut;
        }
      }

      // Calculate monthly PnL properly - UPDATED LOGIC
      Object.keys(monthlyData).forEach(yearMonth => {
        const entries = monthlyData[yearMonth].entries.sort((a, b) => a.date.getTime() - b.date.getTime());
        if (entries.length === 0) return;

        // Use first and last entries for the month
        const firstEntry = entries[0];
        const lastEntry = entries[entries.length - 1];
        const totalCapitalInOut = entries.reduce((sum, entry) => sum + entry.capitalInOut, 0);
        const totalCashPnL = entries.reduce((sum, entry) => sum + entry.pnl, 0);

        if (!monthlyPnl[yearMonth]) {
          monthlyPnl[yearMonth] = {
            startNav: 0,
            endNav: 0,
            capitalInOut: 0,
            cashPnL: 0,
            accountCount: 0
          };
        }

        // Accumulate properly across accounts
        monthlyPnl[yearMonth].startNav += firstEntry.nav;
        monthlyPnl[yearMonth].endNav += lastEntry.nav;
        monthlyPnl[yearMonth].capitalInOut += totalCapitalInOut;
        monthlyPnl[yearMonth].cashPnL += totalCashPnL;
        monthlyPnl[yearMonth].accountCount += 1;
      });

      // Calculate quarterly data from monthly data - UPDATED LOGIC
      Object.keys(monthlyData).forEach(yearMonth => {
        const [year, month] = yearMonth.split('-');
        const monthNum = parseInt(month);
        const quarter = `q${Math.ceil(monthNum / 3)}`;

        if (!quarterlyPnl[year]) {
          quarterlyPnl[year] = {};
        }
        if (!quarterlyPnl[year][quarter]) {
          quarterlyPnl[year][quarter] = {
            startNav: 0,
            endNav: 0,
            capitalInOut: 0,
            cashPnL: 0,
            accountCount: 0
          };
        }

        const entries = monthlyData[yearMonth].entries.sort((a, b) => a.date.getTime() - b.date.getTime());
        if (entries.length > 0) {
          const firstEntry = entries[0];
          const lastEntry = entries[entries.length - 1];
          const totalCapitalInOut = entries.reduce((sum, entry) => sum + entry.capitalInOut, 0);
          const totalCashPnL = entries.reduce((sum, entry) => sum + entry.pnl, 0);

          quarterlyPnl[year][quarter].startNav += firstEntry.nav;
          quarterlyPnl[year][quarter].endNav += lastEntry.nav;
          quarterlyPnl[year][quarter].capitalInOut += totalCapitalInOut;
          quarterlyPnl[year][quarter].cashPnL += totalCashPnL;
          quarterlyPnl[year][quarter].accountCount += 1;
        }
      });
    }

    // Calculate weighted trailing returns, including MDD and currentDD
    // Calculate weighted trailing returns, including MDD and currentDD
const totalPortfolioValue = Object.values(portfolioValues).reduce((sum, value) => sum + value, 0);
console.log('=== RAW TRAILING‐RETURNS INPUT DATA ===');

const finalTrailingReturns: { [key: string]: number } = {};
periodLabels.forEach(period => {
  let weightedReturn = 0;
  let totalWeight = 0;
  if (period === "MDD") {
    console.log(`DEBUG: Calculating weighted MDD`);
    Object.keys(accountMaxDrawdowns).forEach(qcode => {
      const weight = portfolioValues[qcode] || 0;
      const drawdownValue = accountMaxDrawdowns[qcode] || 0;
      weightedReturn += drawdownValue * weight;
      totalWeight += weight;
      console.log(`DEBUG: Qcode ${qcode} - MDD: drawdown=${drawdownValue.toFixed(2)}%, weight=${weight.toFixed(2)}, contribution=${(drawdownValue * weight).toFixed(2)}`);
    });
  } else if (period === "currentDD") {
    console.log(`DEBUG: Calculating weighted currentDD`);
    Object.keys(accountCurrentDrawdowns).forEach(qcode => {
      const weight = portfolioValues[qcode] || 0;
      const drawdownValue = accountCurrentDrawdowns[qcode] || 0;
      weightedReturn += drawdownValue * weight;
      totalWeight += weight;
      console.log(`DEBUG: Qcode ${qcode} - currentDD: drawdown=${drawdownValue.toFixed(2)}%, weight=${weight.toFixed(2)}, contribution=${(drawdownValue * weight).toFixed(2)}`);
    });
  } else {
    console.log(`DEBUG: Calculating weighted ${period}`);
    Object.keys(accountReturns[period]).forEach(qcode => {
      const weight = portfolioValues[qcode] || 0;
      const returnValue = accountReturns[period][qcode] || 0;
      weightedReturn += returnValue * weight;
      totalWeight += weight;
      console.log(`DEBUG: Qcode ${qcode} - ${period}: return=${returnValue.toFixed(2)}%, weight=${weight.toFixed(2)}, contribution=${(returnValue * weight).toFixed(2)}`);
    });
  }
  finalTrailingReturns[period] = totalWeight > 0 ? weightedReturn / totalWeight : 0;
  console.log(`DEBUG: Final weighted ${period}: ${finalTrailingReturns[period].toFixed(2)}%, totalWeight=${totalWeight.toFixed(2)}`);
});   

    // Convert NAV and drawdown curves to sorted arrays
    const equityCurve = Array.from(navCurveMap.entries())
      .map(([date, { totalNav, count }]) => ({
        date,
        value: count > 0 ? totalNav / count : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
      console.log('equity curve', equityCurve)
    const drawdownCurve = Array.from(drawdownCurveMap.entries())
      .map(([date, { total, count }]) => ({
        date,
        value: count > 0 ? total / count : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // FIXED: Format quarterly PnL with proper percentage calculation
    const formattedQuarterlyPnl = Object.keys(quarterlyPnl).reduce((acc, year) => {
      acc[year] = {
        percent: { q1: "0.00", q2: "0.00", q3: "0.00", q4: "0.00", total: "0.00" },
        cash: { q1: "0.00", q2: "0.00", q3: "0.00", q4: "0.00", total: "0.00" },
        yearCash: "0.00",
      };

      let yearTotalPercent = 0;
      let yearTotalCash = 0;
      let yearTotalCapitalInOut = 0;

      ["q1", "q2", "q3", "q4"].forEach(quarter => {
        if (quarterlyPnl[year][quarter]) {
          const data = quarterlyPnl[year][quarter];
          const avgStartNav = data.accountCount > 0 ? data.startNav / data.accountCount : 0;
          const avgEndNav = data.accountCount > 0 ? data.endNav / data.accountCount : 0;
          const avgCapitalInOut = data.accountCount > 0 ? data.capitalInOut / data.accountCount : 0;

          console.log(avgStartNav)
          console.log(avgEndNav)


          // FIXED: Calculate percentage return properly
          const percentReturn = avgStartNav > 0 ?
            ((avgEndNav - avgStartNav) / avgStartNav) * 100 : 0;


          acc[year].percent[quarter as keyof typeof acc[string]['percent']] = percentReturn.toFixed(2);
          acc[year].cash[quarter as keyof typeof acc[string]['cash']] = data.cashPnL.toFixed(2);

          yearTotalPercent += percentReturn;
          yearTotalCash += data.cashPnL;
          yearTotalCapitalInOut += data.capitalInOut;
        }
      });

      acc[year].percent.total = yearTotalPercent.toFixed(2);
      acc[year].cash.total = yearTotalCash.toFixed(2);
      acc[year].yearCash = yearTotalCapitalInOut.toFixed(2);

      return acc;
    }, {} as { [year: string]: { percent: { q1: string; q2: string; q3: string; q4: string; total: string }; cash: { q1: string; q2: string; q3: string; q4: string; total: string }; yearCash: string } });

    // FIXED: Format monthly PnL with proper percentage calculation
    const formattedMonthlyPnl = Object.keys(monthlyPnl)
      .sort()
      .reduce((acc, yearMonth) => {
        const [year, month] = yearMonth.split('-');
        const monthIndex = parseInt(month) - 1;
        const monthName = getMonthName(monthIndex);

        if (!acc[year]) {
          acc[year] = { months: {}, totalPercent: 0, totalCash: 0, totalCapitalInOut: 0 };
        }

        const data = monthlyPnl[yearMonth];
        const avgStartNav = data.accountCount > 0 ? data.startNav / data.accountCount : 0;
        const avgEndNav = data.accountCount > 0 ? data.endNav / data.accountCount : 0;
        const avgCapitalInOut = data.accountCount > 0 ? data.capitalInOut / data.accountCount : 0;

        // FIXED: Calculate percentage return properly
        const percentReturn = avgStartNav > 0 ?
          ((avgEndNav - avgStartNav) / avgStartNav) * 100 : 0;

        acc[year].months[monthName] = {
          percent: percentReturn.toFixed(2),
          cash: data.cashPnL.toFixed(2),
          capitalInOut: data.capitalInOut.toFixed(2),
        };

        acc[year].totalPercent += percentReturn;
        acc[year].totalCash += data.cashPnL;
        acc[year].totalCapitalInOut += data.capitalInOut;

        return acc;
      }, {} as { [year: string]: { months: { [month: string]: { percent: string; cash: string; capitalInOut: string } }; totalPercent: number; totalCash: number; totalCapitalInOut: number } });

    // Format cash in/out
    const formattedCashInOut = {
      transactions: cashInOut.transactions.map(tx => ({
        date: tx.date,
        amount: tx.amount.toFixed(2),
      })),
      total: cashInOut.total.toFixed(2),
    };

    // Add totals to monthly PnL
    Object.keys(formattedMonthlyPnl).forEach(year => {
      formattedMonthlyPnl[year].totalPercent = parseFloat(formattedMonthlyPnl[year].totalPercent.toFixed(2));
      formattedMonthlyPnl[year].totalCash = parseFloat(formattedMonthlyPnl[year].totalCash.toFixed(2));
      formattedMonthlyPnl[year].totalCapitalInOut = parseFloat(formattedMonthlyPnl[year].totalCapitalInOut.toFixed(2));
    });

    // Prepare final metrics
    const result = {
      amountDeposited: amountDeposited.toFixed(2),
      currentExposure: currentExposure.toFixed(2),
      return: finalTrailingReturns.sinceInception.toFixed(2),
      totalReturn: totalReturn.toFixed(2),
      totalProfit: totalProfit.toFixed(2),
      trailingReturns: {
        fiveDays: finalTrailingReturns.fiveDays.toFixed(2),
        tenDays: finalTrailingReturns.tenDays.toFixed(2),
        oneMonth: finalTrailingReturns.oneMonth.toFixed(2),
        threeMonths: finalTrailingReturns.threeMonths.toFixed(2),
        sixMonths: finalTrailingReturns.sixMonths.toFixed(2),
        oneYear: finalTrailingReturns.oneYear.toFixed(2),
        twoYears: finalTrailingReturns.twoYears.toFixed(2),
        fiveYears: finalTrailingReturns.fiveYears.toFixed(2),
        sinceInception: finalTrailingReturns.sinceInception.toFixed(2),
        MDD: finalTrailingReturns.MDD.toFixed(2),
        currentDD: finalTrailingReturns.currentDD.toFixed(2),
      },
      drawdown: maxDrawdown.toFixed(2),
      drawdownCurve,
      equityCurve,
      quarterlyPnl: formattedQuarterlyPnl,
      monthlyPnl: formattedMonthlyPnl,
      cashInOut: formattedCashInOut,
      cashFlows: allCashFlows,
    };

    console.log("Final trailing returns:", result.trailingReturns);
    return result;
  } catch (error) {
    console.error("Error calculating portfolio metrics:", error);
    return null;
  }
}

// Format portfolio stats to match Stats interface
export function formatPortfolioStats(metrics: any): Stats {
  return {
    amountDeposited: metrics?.amountDeposited || "0.00",
    currentExposure: metrics?.currentExposure || "0.00",
    return: metrics?.totalReturn || "0.00",
    totalProfit: metrics?.totalProfit || "0.00",
    trailingReturns: metrics?.trailingReturns || {
      fiveDays: "0.00",
      tenDays: "0.00",
      oneMonth: "0.00",
      threeMonths: "0.00",
      sixMonths: "0.00",
      oneYear: "0.00",
      twoYears: "0.00",
      fiveYears: "0.00",
      sinceInception: "0.00",
      MDD: "0.00",
      currentDD: "0.00",
    },
    drawdown: metrics?.drawdown || "0.00",
    equityCurve: metrics?.equityCurve || [],
    drawdownCurve: metrics?.drawdownCurve || [],
    quarterlyPnl: metrics?.quarterlyPnl || {},
    monthlyPnl: metrics?.monthlyPnl || {},
    cashInOut: metrics?.cashInOut || { transactions: [], total: "0.00" },
    cashFlows: metrics?.cashFlows || [],
  };
}