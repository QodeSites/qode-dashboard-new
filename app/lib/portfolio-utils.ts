import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
const strategyNameMap: { [key: string]: string } = {
  'QAW+': 'Qode All Weather+',
  'QAW++': 'Qode All Weather++',
  'QTF+': 'Qode Tactical Fund+',
  'QTF++': 'Qode Tactical Fund++',
  'QYE+': 'Qode Yield Enhancer+',
  'QYE++': 'Qode Yield Enhancer++',
};
interface Holding {
  symbol: string;
  exchange: string;
  quantity: number;
  avgPrice: number;
  ltp: number;
  buyValue: number;
  valueAsOfToday: number;
  pnlAmount: number;
  percentPnl: number;
  broker: string;
  debtEquity: string;
  subCategory: string;
  date: Date;
}

// Interface for holdings summary
interface HoldingsSummary {
  totalBuyValue: number;
  totalCurrentValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  holdingsCount: number;
  equityHoldings: Holding[];
  debtHoldings: Holding[];
  categoryBreakdown: {
    [category: string]: {
      buyValue: number;
      currentValue: number;
      pnl: number;
      count: number;
    };
  };
  brokerBreakdown: {
    [broker: string]: {
      buyValue: number;
      currentValue: number;
      pnl: number;
      count: number;
    };
  };
}

// Add holdings to your main Stats interface
interface Stats {
  amountDeposited: string;
  currentExposure: string;
  return: string;
  totalProfit: string;
  trailingReturns: {
    fiveDays: string;
    fifteenDays: string;
    tenDays: string;
    oneMonth: string;
    threeMonths: string;
    sixMonths: string;
    oneYear: string;
    twoYears: string;
    fiveYears: string;
    sinceInception: string;
    MDD: string;
    currentDD: string;
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
  strategyName: string;
  holdings?: HoldingsSummary; // Add holdings data
}

// Interface for data fetching strategy
interface DataFetchingStrategy {
  getAmountDeposited(qcode: string): Promise<number>;
  getLatestExposure(qcode: string): Promise<{ portfolioValue: number; drawdown: number; nav: number; date: Date } | null>;
  getPortfolioReturns(qcode: string, strategy?: string): Promise<number>;
  getTotalProfit(qcode: string, strategy?: string): Promise<number>;
  getHistoricalData(qcode: string, strategy?: string): Promise<{ date: Date; nav: number; drawdown: number; pnl: number; capitalInOut: number }[]>;
  getFirstNav(qcode: string, strategy?: string): Promise<{ nav: number; date: Date } | null>;
  getNavAtDate(qcode: string, targetDate: Date, direction: 'before' | 'after' | 'closest', strategy?: string): Promise<{ nav: number; date: Date } | null>;
  getCashFlows?(qcode: string): Promise<{ date: Date; amount: number }[]>;
  getStrategyName(strategy?: string): string;
  getHoldings(qcode: string): Promise<Holding[]>; // Add this method
}

// Strategy for Managed Accounts (Jainam)
class JainamManagedStrategy implements DataFetchingStrategy {
  async getAmountDeposited(qcode: string): Promise<number> {
    const depositRecords = await prisma.master_sheet.findFirst({
      where: { qcode, system_tag: "Jainam Total Portfolio Deposit" },
      orderBy: { date: "desc" },
      select: { portfolio_value: true },
    });
    return Number(depositRecords?.portfolio_value) || 0;
  }

  async getLatestExposure(qcode: string): Promise<{ portfolioValue: number; drawdown: number; nav: number; date: Date } | null> {
    const record = await prisma.master_sheet.findFirst({
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

  async getPortfolioReturns(qcode: string): Promise<number> {
    try {
      const firstNavRecord = await prisma.master_sheet.findFirst({
        where: { qcode, system_tag: "Jainam Total Portfolio Exposure", nav: { not: null } },
        orderBy: { date: "asc" },
        select: { nav: true, date: true },
      });

      const latestNavRecord = await prisma.master_sheet.findFirst({
        where: { qcode, system_tag: "Jainam Total Portfolio Exposure", nav: { not: null } },
        orderBy: { date: "desc" },
        select: { nav: true, date: true },
      });

      if (!firstNavRecord || !latestNavRecord) {
        return 0;
      }

      const initialNav = Number(firstNavRecord.nav);
      const finalNav = Number(latestNavRecord.nav);

      if (initialNav <= 0 || finalNav <= 0) return 0;

      const days = (latestNavRecord.date.getTime() - firstNavRecord.date.getTime()) / (1000 * 60 * 60 * 24);

      let portfolioReturn = 0;

      if (days < 365) {
        portfolioReturn = ((finalNav / initialNav) - 1) * 100;
        console.log(`Jainam Return (ABS): final=${finalNav}, initial=${initialNav}, days=${days}, return=${portfolioReturn}`);
      } else {
        portfolioReturn = (Math.pow(finalNav / initialNav, 365 / days) - 1) * 100;
        console.log(`Jainam Return (CAGR): final=${finalNav}, initial=${initialNav}, days=${days}, return=${portfolioReturn}`);
      }

      return portfolioReturn;
    } catch (error) {
      console.error(`Error calculating portfolio returns for qcode ${qcode}:`, error);
      return 0;
    }
  }

  async getTotalProfit(qcode: string): Promise<number> {
    const profitSum = await prisma.master_sheet.aggregate({
      where: { qcode, system_tag: "Jainam Total Portfolio Exposure" },
      _sum: { pnl: true },
    });
    return Number(profitSum._sum.pnl) || 0;
  }

  async getCashFlows(qcode: string): Promise<{ date: Date; amount: number }[]> {
    const rows = await prisma.master_sheet.findMany({
      where: {
        qcode,
        system_tag: "Jainam Total Portfolio Deposit",
        capital_in_out: { not: null, not: new Decimal(0) },
      },
      select: { date: true, capital_in_out: true },
      orderBy: { date: "asc" },
    });
    return rows.map(r => ({
      date: r.date,
      amount: Number(r.capital_in_out),
    }));
  }

  async getHistoricalData(qcode: string): Promise<{ date: Date; nav: number; drawdown: number; pnl: number; capitalInOut: number }[]> {
    const data = await prisma.master_sheet.findMany({
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
    const record = await prisma.master_sheet.findFirst({
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

    const result = await prisma.master_sheet.findFirst({ where: whereClause, orderBy, select: { nav: true, date: true } });
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

  getStrategyName(strategy?: string): string {
    // Return the dynamic strategy name from database, or default fallback
    return strategy || "Qode Yield Enhancer (Jainam)";
  }


  async getHoldings(qcode: string): Promise<Holding[]> {
    const holdings = await prisma.equity_holding.findMany({
      where: {
        qcode,
        // Get the latest holdings for each symbol
      },
      orderBy: [
        { symbol: 'asc' },
        { date: 'desc' }
      ],
    });

    // Group by symbol and take the latest entry for each
    const latestHoldings = new Map<string, any>();
    holdings.forEach(holding => {
      const key = `${holding.symbol}-${holding.exchange}`;
      if (!latestHoldings.has(key) ||
        (holding.date && latestHoldings.get(key).date && holding.date > latestHoldings.get(key).date)) {
        latestHoldings.set(key, holding);
      }
    });

    return Array.from(latestHoldings.values())
      .filter(h => h.quantity && h.quantity > 0) // Only active holdings
      .map(holding => ({
        symbol: holding.symbol || '',
        exchange: holding.exchange || '',
        quantity: Number(holding.quantity) || 0,
        avgPrice: Number(holding.avg_price) || 0,
        ltp: Number(holding.ltp) || 0,
        buyValue: Number(holding.buy_value) || 0,
        valueAsOfToday: Number(holding.value_as_of_today) || 0,
        pnlAmount: Number(holding.pnl_amount) || 0,
        percentPnl: Number(holding.percent_pnl) || 0,
        broker: holding.broker || '',
        debtEquity: holding.debt_equity || '',
        subCategory: holding.sub_category || '',
        date: holding.date || new Date(),
      }));
  }
}

// Strategy for Managed Accounts (Zerodha)
class ZerodhaManagedStrategy implements DataFetchingStrategy {
  private broker: string;

  constructor(broker: string) {
    this.broker = broker;
  }

  // Map strategy to system_tag for Returns and NAV
  private getSystemTag(strategy?: string): string {
    // If broker is Radiance, always use 'Total Portfolio Exposure'
    if (this.broker.toLowerCase() === 'radiance') {
      return 'Total Portfolio Exposure';
    }
    const strategyMap: { [key: string]: string } = {
      'QAW+': 'Zerodha Total Portfolio',
      'QAW++': 'Zerodha Total Portfolio',
      'QTF+': 'Zerodha Total Portfolio',
      'QTF++': 'Zerodha Total Portfolio',
      'QYE+': 'Total Portfolio Value',
      'QYE++': 'Total Portfolio Value',
    };
    return strategy && strategyMap[strategy] ? strategyMap[strategy] : 'Zerodha Total Portfolio';
  }

  async getAmountDeposited(qcode: string): Promise<number> {
    const systemTag = this.broker.toLowerCase() === 'radiance' ? 'Total Portfolio Exposure' : 'Zerodha Total Portfolio';
    const depositSum = await prisma.master_sheet.aggregate({
      where: { qcode, system_tag: systemTag, capital_in_out: { not: null } },
      _sum: { capital_in_out: true },
    });
    return Number(depositSum._sum.capital_in_out) || 0;
  }

  async getLatestExposure(qcode: string): Promise<{ portfolioValue: number; drawdown: number; nav: number; date: Date } | null> {
    const systemTag = this.broker.toLowerCase() === 'radiance' ? 'Total Portfolio Exposure' : 'Zerodha Total Portfolio';
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

  async getPortfolioReturns(qcode: string, strategy?: string): Promise<number> {
  try {
    const systemTag = this.getSystemTag(strategy);
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

    const originalInitialNav = Number(firstNavRecord.nav) || 0;
    const finalNav = Number(latestNavRecord.nav) || 0;
    const initialNav = originalInitialNav !== 100 ? 100 : originalInitialNav;

    const days = (latestNavRecord.date.getTime() - firstNavRecord.date.getTime()) / (1000 * 60 * 60 * 24);

    let portfolioReturn = 0;

    if (days < 365) {
      portfolioReturn = ((finalNav / initialNav) - 1) * 100;
      console.log(`Zerodha Return (ABS): final=${finalNav}, initial=${initialNav}, days=${days}, return=${portfolioReturn}`);
    } else {
      portfolioReturn = (Math.pow(finalNav / initialNav, 365 / days) - 1) * 100;
      console.log(`Zerodha Return (CAGR): final=${finalNav}, initial=${initialNav}, days=${days}, return=${portfolioReturn}`);
    }

    return portfolioReturn;
  } catch (error) {
    console.error(`Error calculating portfolio returns for qcode ${qcode}, strategy ${strategy}:`, error);
    return 0;
  }
}


  async getTotalProfit(qcode: string, strategy?: string): Promise<number> {
    const systemTag = this.getSystemTag(strategy);
    const profitSum = await prisma.master_sheet.aggregate({
      where: { qcode, system_tag: systemTag },
      _sum: { pnl: true },
    });
    return Number(profitSum._sum.pnl) || 0;
  }

  async getHistoricalData(qcode: string, strategy?: string): Promise<{ date: Date; nav: number; drawdown: number; pnl: number; capitalInOut: number }[]> {
    const systemTag = this.getSystemTag(strategy);
    const data = await prisma.master_sheet.findMany({
      where: { qcode, system_tag: systemTag, nav: { not: null }, drawdown: { not: null } },
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
    const systemTag = this.broker.toLowerCase() === 'radiance' ? 'Total Portfolio Exposure' : 'Zerodha Total Portfolio';
    const cashFlows = await prisma.master_sheet.findMany({
      where: {
        qcode,
        system_tag: systemTag,
        capital_in_out: { not: new Decimal(0) },
      },
      select: { date: true, capital_in_out: true },
      orderBy: { date: "asc" },
    });

    return cashFlows.map(entry => ({
      date: entry.date,
      amount: entry.capital_in_out!.toNumber(),
    }));
  }

  async getFirstNav(qcode: string, strategy?: string): Promise<{ nav: number; date: Date } | null> {
    const systemTag = this.getSystemTag(strategy);
    const record = await prisma.master_sheet.findFirst({
      where: { qcode, system_tag: systemTag, nav: { not: null } },
      orderBy: { date: "asc" },
      select: { nav: true, date: true },
    });
    if (!record) return null;
    return { nav: Number(record.nav), date: record.date };
  }

  async getNavAtDate(qcode: string, targetDate: Date, direction: 'before' | 'after' | 'closest', strategy?: string): Promise<{ nav: number; date: Date } | null> {
    const systemTag = this.getSystemTag(strategy);
    let whereClause: any = { qcode, system_tag: systemTag, nav: { not: null } };
    let orderBy: any = { date: "desc" };

    if (direction === 'before') {
      whereClause.date = { lte: targetDate };
      orderBy = { date: "desc" };
    } else if (direction === 'after') {
      whereClause.date = { gte: targetDate };
      orderBy = { date: "asc" };
    }

    const result = await prisma.master_sheet.findFirst({ where: whereClause, orderBy, select: { nav: true, date: true } });
    if (!result) {
      if (direction === 'closest') {
        const beforeResult = await this.getNavAtDate(qcode, targetDate, 'before', strategy);
        const afterResult = await this.getNavAtDate(qcode, targetDate, 'after', strategy);
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

  async getHoldings(qcode: string): Promise<Holding[]> {
    const holdings = await prisma.equity_holding.findMany({
      where: {
        qcode,
      },
      orderBy: [
        { symbol: 'asc' },
        { date: 'desc' }
      ],
    });

    // Group by symbol and take the latest entry for each
    const latestHoldings = new Map<string, any>();
    holdings.forEach(holding => {
      const key = `${holding.symbol}-${holding.exchange}`;
      if (!latestHoldings.has(key) ||
        (holding.date && latestHoldings.get(key).date && holding.date > latestHoldings.get(key).date)) {
        latestHoldings.set(key, holding);
      }
    });

    return Array.from(latestHoldings.values())
      .filter(h => h.quantity && h.quantity > 0) // Only active holdings
      .map(holding => ({
        symbol: holding.symbol || '',
        exchange: holding.exchange || '',
        quantity: Number(holding.quantity) || 0,
        avgPrice: Number(holding.avg_price) || 0,
        ltp: Number(holding.ltp) || 0,
        buyValue: Number(holding.buy_value) || 0,
        valueAsOfToday: Number(holding.value_as_of_today) || 0,
        pnlAmount: Number(holding.pnl_amount) || 0,
        percentPnl: Number(holding.percent_pnl) || 0,
        broker: holding.broker || '',
        debtEquity: holding.debt_equity || '',
        subCategory: holding.sub_category || '',
        date: holding.date || new Date(),
      }));
  }

  getStrategyName(strategy?: string): string {
    return strategy && strategyNameMap[strategy] ? strategyNameMap[strategy] : "Qode Yield Enhancer+";
  }

}

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

  async getPortfolioReturns(qcode: string): Promise<number> {
  try {
    const custodianCodes = await prisma.account_custodian_codes.findMany({
      where: { qcode },
      select: { custodian_code: true },
    });
    const codes = custodianCodes.map(c => c.custodian_code);

    const firstNavRecord = await prisma.pms_master_sheet.findFirst({
      where: { account_code: { in: codes }, nav: { not: null } },
      orderBy: { report_date: "asc" },
      select: { nav: true, report_date: true },
    });

    const latestNavRecord = await prisma.pms_master_sheet.findFirst({
      where: { account_code: { in: codes }, nav: { not: null } },
      orderBy: { report_date: "desc" },
      select: { nav: true, report_date: true },
    });

    if (!firstNavRecord || !latestNavRecord) {
      return 0;
    }

    const initialNav = Number(firstNavRecord.nav) || 0;
    const finalNav = Number(latestNavRecord.nav) || 0;

    if (initialNav <= 0 || finalNav <= 0) return 0;

    const days = (latestNavRecord.report_date.getTime() - firstNavRecord.report_date.getTime()) / (1000 * 60 * 60 * 24);

    let portfolioReturn = 0;

    if (days < 365) {
      portfolioReturn = ((finalNav / initialNav) - 1) * 100;
      console.log(`PMS Return (ABS): final=${finalNav}, initial=${initialNav}, days=${days}, return=${portfolioReturn}`);
    } else {
      portfolioReturn = (Math.pow(finalNav / initialNav, 365 / days) - 1) * 100;
      console.log(`PMS Return (CAGR): final=${finalNav}, initial=${initialNav}, days=${days}, return=${portfolioReturn}`);
    }

    return portfolioReturn;
  } catch (error) {
    console.error(`Error calculating portfolio returns for qcode ${qcode}:`, error);
    return 0;
  }
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

  async getHoldings(qcode: string): Promise<Holding[]> {
    // For PMS, you might need to get custodian codes first
    const custodianCodes = await prisma.account_custodian_codes.findMany({
      where: { qcode },
      select: { custodian_code: true },
    });
    const codes = custodianCodes.map(c => c.custodian_code);

    const holdings = await prisma.equity_holding.findMany({
      where: {
        qcode: { in: codes }, // or however you map PMS holdings
      },
      orderBy: [
        { symbol: 'asc' },
        { date: 'desc' }
      ],
    });

    // Group by symbol and take the latest entry for each
    const latestHoldings = new Map<string, any>();
    holdings.forEach(holding => {
      const key = `${holding.symbol}-${holding.exchange}`;
      if (!latestHoldings.has(key) ||
        (holding.date && latestHoldings.get(key).date && holding.date > latestHoldings.get(key).date)) {
        latestHoldings.set(key, holding);
      }
    });

    return Array.from(latestHoldings.values())
      .filter(h => h.quantity && h.quantity > 0) // Only active holdings
      .map(holding => ({
        symbol: holding.symbol || '',
        exchange: holding.exchange || '',
        quantity: Number(holding.quantity) || 0,
        avgPrice: Number(holding.avg_price) || 0,
        ltp: Number(holding.ltp) || 0,
        buyValue: Number(holding.buy_value) || 0,
        valueAsOfToday: Number(holding.value_as_of_today) || 0,
        pnlAmount: Number(holding.pnl_amount) || 0,
        percentPnl: Number(holding.percent_pnl) || 0,
        broker: holding.broker || '',
        debtEquity: holding.debt_equity || '',
        subCategory: holding.sub_category || '',
        date: holding.date || new Date(),
      }));
  }

  getStrategyName(strategy?: string): string {
    // Return the dynamic strategy name from database, or default fallback
    return strategy || "PMS Strategy";
  }
}


// Helper function to calculate holdings summary
function calculateHoldingsSummary(holdings: Holding[]): HoldingsSummary {
  const equityHoldings = holdings.filter(h => h.debtEquity.toLowerCase() === 'equity');
  const debtHoldings = holdings.filter(h => h.debtEquity.toLowerCase() === 'debt');

  const totalBuyValue = holdings.reduce((sum, h) => sum + h.buyValue, 0);
  const totalCurrentValue = holdings.reduce((sum, h) => sum + h.valueAsOfToday, 0);
  const totalPnl = holdings.reduce((sum, h) => sum + h.pnlAmount, 0);
  const totalPnlPercent = totalBuyValue > 0 ? (totalPnl / totalBuyValue) * 100 : 0;

  // Category breakdown
  const categoryBreakdown: { [category: string]: any } = {};
  holdings.forEach(holding => {
    const category = holding.subCategory || 'Others';
    if (!categoryBreakdown[category]) {
      categoryBreakdown[category] = {
        buyValue: 0,
        currentValue: 0,
        pnl: 0,
        count: 0
      };
    }
    categoryBreakdown[category].buyValue += holding.buyValue;
    categoryBreakdown[category].currentValue += holding.valueAsOfToday;
    categoryBreakdown[category].pnl += holding.pnlAmount;
    categoryBreakdown[category].count += 1;
  });

  // Broker breakdown
  const brokerBreakdown: { [broker: string]: any } = {};
  holdings.forEach(holding => {
    const broker = holding.broker || 'Unknown';
    if (!brokerBreakdown[broker]) {
      brokerBreakdown[broker] = {
        buyValue: 0,
        currentValue: 0,
        pnl: 0,
        count: 0
      };
    }
    brokerBreakdown[broker].buyValue += holding.buyValue;
    brokerBreakdown[broker].currentValue += holding.valueAsOfToday;
    brokerBreakdown[broker].pnl += holding.pnlAmount;
    brokerBreakdown[broker].count += 1;
  });

  return {
    totalBuyValue,
    totalCurrentValue,
    totalPnl,
    totalPnlPercent,
    holdingsCount: holdings.length,
    equityHoldings,
    debtHoldings,
    categoryBreakdown,
    brokerBreakdown
  };
}



function getDataFetchingStrategy(account: { account_type: string; broker: string; strategy?: string }): DataFetchingStrategy {
  if (account.account_type === 'pms') {
    return new PmsStrategy();
  } else if (account.account_type === 'managed_account' && account.broker === 'jainam') {
    return new JainamManagedStrategy();
  } else if (account.account_type === 'managed_account' && (account.broker === 'zerodha' || account.broker === 'radiance')) {
    return new ZerodhaManagedStrategy(account.broker);
  }
  throw new Error(`Unsupported account type: ${account.account_type} or broker: ${account.broker}`);
}

export async function getUserQcodes(icode: string): Promise<{ qcode: string; account_type: string; broker: string; strategy?: string }[]> {
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
      select: { qcode: true, account_type: true, broker: true, strategy: true },
      distinct: ['qcode'],
    });
    console.log(`getUserQcodes: icode=${icode}, result=${JSON.stringify(accounts)}`);
    return accounts;
  } catch (error) {
    console.error("Error fetching qcodes:", error);
    return [];
  }
}

// Helper function to get month name
const getMonthName = (month: number): string => {
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return monthNames[month];
};

function getNavEntriesAgo(
  equityCurve: { date: string; value: number }[],
  daysBack: number
): { date: string; value: number } | null {
  if (equityCurve.length === 0) return null;

  const sorted = equityCurve
    .map(e => ({ date: new Date(e.date), value: e.value }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const latest = sorted[sorted.length - 1].date;
  const target = new Date(latest);
  target.setDate(target.getDate() - daysBack);

  console.log(`DEBUG: target calendar date = ${target.toISOString().slice(0, 10)}`);

  const candidates = sorted.filter(e => e.date.getTime() <= target.getTime());
  if (candidates.length === 0) {
    console.log(`DEBUG: no data on or before ${target.toISOString().slice(0, 10)}`);
    return null;
  }

  const pick = candidates[candidates.length - 1];
  console.log(
    `DEBUG: picked ${pick.value.toFixed(4)} on ${pick.date.toISOString().slice(0, 10)}`
  );

  return { date: pick.date.toISOString().slice(0, 10), value: pick.value };
}
// Calculate portfolio metrics
export async function calculatePortfolioMetrics(qcodesWithDetails: { qcode: string; account_type: string; broker: string; strategy?: string }[]): Promise<Stats | null> {
  try {
    if (!qcodesWithDetails.length) {
      console.log("No qcodes provided for portfolio metrics calculation");
      return null;
    }

    let amountDeposited = 0;
    let currentExposure = 0;
    let totalReturn = 0;
    let totalProfit = 0;
    let maxDrawdown = 0;
    let allCashFlows: { date: string; amount: number }[] = [];
    let accountMaxDrawdowns: { [qcode: string]: number } = {};
    let accountCurrentDrawdowns: { [qcode: string]: number } = {};

    const portfolioValues: { [qcode: string]: number } = {};
    const navCurveMap = new Map<string, { totalNav: number; count: number }>();
    const drawdownCurveMap = new Map<string, { total: number; count: number }>();

    const monthlyPnl: {
      [yearMonth: string]: {
        startNav: number;
        endNav: number;
        capitalInOut: number;
        cashPnL: number;
      };
    } = {};

    const cashInOut: {
      transactions: { date: string; amount: number }[];
      total: number;
    } = { transactions: [], total: 0 };

    const periodLabels = ["fiveDays", "tenDays", "fifteenDays", "oneMonth", "threeMonths", "sixMonths", "oneYear", "twoYears", "fiveYears", "sinceInception", "MDD", "currentDD"];

    // Collect all unique strategy names to determine the final strategy name
    const strategyNames: string[] = [];

    for (const { qcode, account_type, broker, strategy } of qcodesWithDetails) {
      console.log(`Processing qcode: ${qcode}, type: ${account_type}, broker: ${broker}, strategy: ${strategy || 'none'}`);
      const dataStrategy = getDataFetchingStrategy({ account_type, broker, strategy });

      // Collect strategy names for final determination
      const strategyName = dataStrategy.getStrategyName(strategy);
      if (!strategyNames.includes(strategyName)) {
        strategyNames.push(strategyName);
      }

      // 1. Amount Deposited
      const accountDeposited = await dataStrategy.getAmountDeposited(qcode);
      amountDeposited += accountDeposited;

      // 2. Current Exposure and Drawdown
      const latestExposure = await dataStrategy.getLatestExposure(qcode);
      if (latestExposure) {
        currentExposure += latestExposure.portfolioValue;
        portfolioValues[qcode] = latestExposure.portfolioValue;
        accountCurrentDrawdowns[qcode] = latestExposure.drawdown;
      }

      // 3. Portfolio Returns
      totalReturn = await dataStrategy.getPortfolioReturns(qcode, strategy);

      // 4. Total Profit
      totalProfit += await dataStrategy.getTotalProfit(qcode, strategy);

      // 5. Cash Flows
      if (dataStrategy.getCashFlows) {
        const flows = await dataStrategy.getCashFlows(qcode);
        flows.forEach(f =>
          allCashFlows.push({
            date: f.date.toISOString().split("T")[0],
            amount: Number(f.amount),
          })
        );
      }

      // 6. Historical Data for NAV and Drawdown Curves
      const historicalData = await dataStrategy.getHistoricalData(qcode, strategy);
      historicalData.sort((a, b) => a.date.getTime() - b.date.getTime());

      if (historicalData.length === 0) {
        console.log(`DEBUG: No historical data for qcode ${qcode}, skipping`);
        continue;
      }

      // Prepend NAV of 100 if the first NAV is not 100
      if (historicalData[0].nav !== 100) {
        const firstDate = new Date(historicalData[0].date);
        const prevDate = new Date(firstDate);
        prevDate.setUTCDate(firstDate.getUTCDate() - 1);
        historicalData.unshift({
          date: prevDate,
          nav: 100,
          drawdown: 0,
          pnl: 0,
          capitalInOut: 0,
        });
      }

      let maxDrawdownForAccount = 0;
      let peakNav = 0;
      for (const entry of historicalData) {
        peakNav = Math.max(peakNav, entry.nav);
        const drawdown = peakNav > 0 ? ((peakNav - entry.nav) / peakNav) * 100 : 0;
        maxDrawdownForAccount = Math.max(maxDrawdownForAccount, drawdown);
      }
      accountMaxDrawdowns[qcode] = maxDrawdownForAccount;
      maxDrawdown = Math.max(maxDrawdown, maxDrawdownForAccount);

      const latestHistoricalData = historicalData[historicalData.length - 1];
      const currentNav = latestHistoricalData.nav;
      const currentDrawdown = peakNav > 0 ? ((peakNav - currentNav) / peakNav) * 100 : 0;
      accountCurrentDrawdowns[qcode] = currentDrawdown;

      for (const entry of historicalData) {
        const dateKey = entry.date.toISOString().split("T")[0];
        navCurveMap.set(dateKey, {
          totalNav: (navCurveMap.get(dateKey)?.totalNav || 0) + entry.nav,
          count: (navCurveMap.get(dateKey)?.count || 0) + 1,
        });

        const entryDrawdown = entry.drawdown;
        drawdownCurveMap.set(dateKey, {
          total: (drawdownCurveMap.get(dateKey)?.total || 0) + entryDrawdown,
          count: (drawdownCurveMap.get(dateKey)?.count || 0) + 1,
        });

        if (entry.capitalInOut !== 0) {
          cashInOut.transactions.push({ date: dateKey, amount: entry.capitalInOut });
          cashInOut.total += entry.capitalInOut;
        }
      }

      const monthlyData: { [yearMonth: string]: { entries: any[] } } = {};
      for (const entry of historicalData) {
        const year = entry.date.getUTCFullYear();
        const month = entry.date.getUTCMonth();
        const yearMonth = `${year}-${String(month + 1).padStart(2, '0')}`;
        if (!monthlyData[yearMonth]) {
          monthlyData[yearMonth] = { entries: [] };
        }
        monthlyData[yearMonth].entries.push(entry);
      }

      Object.keys(monthlyData).forEach(yearMonth => {
        const entries = monthlyData[yearMonth].entries.sort((a, b) => a.date.getTime() - b.date.getTime());
        if (entries.length === 0) return;

        const totalCapitalInOut = entries.reduce((sum, entry) => sum + entry.capitalInOut, 0);
        const totalCashPnL = entries.reduce((sum, entry) => sum + entry.pnl, 0);

        if (!monthlyPnl[yearMonth]) {
          monthlyPnl[yearMonth] = {
            startNav: 0,
            endNav: 0,
            capitalInOut: 0,
            cashPnL: 0,
          };
        }

        const startEntry = entries[0];
        const endEntry = entries[entries.length - 1];
        monthlyPnl[yearMonth].startNav = startEntry.nav;
        monthlyPnl[yearMonth].endNav = endEntry.nav;
        monthlyPnl[yearMonth].capitalInOut += totalCapitalInOut;
        monthlyPnl[yearMonth].cashPnL += totalCashPnL;

        console.log(
          `DEBUG Monthly PnL ${yearMonth}: ` +
          `startDate=${startEntry.date.toISOString().split('T')[0]}, startNav=${startEntry.nav.toFixed(4)}; ` +
          `endDate=${endEntry.date.toISOString().split('T')[0]}, endNav=${endEntry.nav.toFixed(4)}`
        );
        console.log(
          `DEBUG Monthly PnL - ${yearMonth}: startNav=${monthlyPnl[yearMonth].startNav}, ` +
          `endNav=${monthlyPnl[yearMonth].endNav}, capitalInOut=${monthlyPnl[yearMonth].capitalInOut}, ` +
          `cashPnL=${monthlyPnl[yearMonth].cashPnL}`
        );
      });
    }

    let equityCurve = Array.from(navCurveMap.entries())
      .map(([date, { totalNav, count }]) => ({
        date,
        value: count > 0 ? totalNav / count : totalNav,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Ensure equity curve starts with NAV of 100 if the first NAV is not 100
    if (equityCurve.length > 0 && equityCurve[0].value !== 100) {
      const firstDate = new Date(equityCurve[0].date);
      const prevDate = new Date(firstDate);
      prevDate.setUTCDate(firstDate.getUTCDate() - 1);
      const prevDateStr = prevDate.toISOString().split("T")[0];
      equityCurve.unshift({ date: prevDateStr, value: 100 });
    }

    const initialAnchorNav = equityCurve.length ? equityCurve[0].value : 0;
    const initialAnchorYM = equityCurve.length ? equityCurve[0].date.slice(0, 7) : "";

    const initialAnchorDate = equityCurve.length ? new Date(equityCurve[0].date) : null;
    const initialAnchorQtr = initialAnchorDate
      ? `q${Math.ceil((initialAnchorDate.getUTCMonth() + 1) / 3)}`
      : "";

    const drawdownCurve = Array.from(drawdownCurveMap.entries())
      .map(([date, { total, count }]) => ({
        date,
        value: count > 0 ? (total / count) : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    Object.keys(monthlyPnl).forEach(yearMonth => {
      const [year, month] = yearMonth.split('-');
      const monthNum = parseInt(month) - 1;
      const startDate = new Date(Date.UTC(parseInt(year), monthNum, 1));
      const endDate = new Date(Date.UTC(parseInt(year), monthNum + 1, 0));
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      const sortedEquityCurve = equityCurve.sort((a, b) => a.date.localeCompare(b.date));

      let startEntry = null;
      for (let i = 0; i < sortedEquityCurve.length; i++) {
        if (sortedEquityCurve[i].date >= startDateStr) {
          startEntry = sortedEquityCurve[i];
          break;
        }
      }
      if (!startEntry) {
        startEntry = sortedEquityCurve[0];
      }

      let endEntry = null;
      for (let i = 0; i < sortedEquityCurve.length; i++) {
        if (sortedEquityCurve[i].date <= endDateStr) {
          endEntry = sortedEquityCurve[i];
        } else {
          break;
        }
      }
      if (!endEntry) {
        endEntry = sortedEquityCurve[sortedEquityCurve.length - 1];
      }

      console.log(
        `DEBUG Monthly PnL ${yearMonth}: ` +
        `startDate=${startEntry.date}, startNav=${startEntry.value.toFixed(4)}; ` +
        `endDate=${endEntry.date}, endNav=${endEntry.value.toFixed(4)}`
      );

      monthlyPnl[yearMonth].startNav = startEntry ? startEntry.value : 0;
      monthlyPnl[yearMonth].endNav = endEntry ? endEntry.value : 0;

      console.log(
        `DEBUG Monthly PnL - ${yearMonth}: startNav=${monthlyPnl[yearMonth].startNav}, ` +
        `endNav=${monthlyPnl[yearMonth].endNav}, capitalInOut=${monthlyPnl[yearMonth].capitalInOut}, ` +
        `cashPnL=${monthlyPnl[yearMonth].cashPnL}`
      );
    });

    const formatPnLReturn = (startNav: number, endNav: number): string => {
      if (!startNav || !endNav || startNav <= 0) {
        return "-";
      }
      const returnValue = ((endNav - startNav) / startNav) * 100;
      return returnValue.toFixed(2);
    };

    const formattedMonthlyPnl = Object.keys(monthlyPnl)
      .sort((a, b) => a.localeCompare(b))
      .reduce((acc, yearMonth, index, yearMonths) => {
        const [year, month] = yearMonth.split('-');
        const monthNum = parseInt(month) - 1;
        const monthName = getMonthName(monthNum);

        if (!acc[year]) {
          acc[year] = {
            months: {},
            totalPercent: 0,
            totalCash: 0,
            totalCapitalInOut: 0,
          };
        }

        const data = monthlyPnl[yearMonth];
        let totalStartNav = data.startNav;
        const totalEndNav = data.endNav;
        const totalCapitalInOut = data.capitalInOut;
        const monthCash = data.cashPnL;

        if (yearMonth === initialAnchorYM) {
          totalStartNav = initialAnchorNav;
        } else if (index > 0) {
          const prevYearMonth = yearMonths[index - 1];
          totalStartNav = monthlyPnl[prevYearMonth].endNav;
        }

        acc[year].months[monthName] = {
          percent: formatPnLReturn(totalStartNav, totalEndNav),
          cash: monthCash.toFixed(2),
          capitalInOut: totalCapitalInOut.toFixed(2),
        };

        acc[year].totalCash += monthCash;
        acc[year].totalCapitalInOut += totalCapitalInOut;

        return acc;
      }, {} as Stats["monthlyPnl"]);

    Object.keys(formattedMonthlyPnl).forEach(year => {
      const monthNames = Object.keys(formattedMonthlyPnl[year].months);
      const monthOrder = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
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
        const yearReturn = ((compoundedReturn - 1) * 100).toFixed(2);
        formattedMonthlyPnl[year].totalPercent = Number(yearReturn);
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

    const formattedQuarterlyPnl = Object.keys(formattedMonthlyPnl).reduce((acc, year) => {
      acc[year] = {
        percent: { q1: "-", q2: "-", q3: "-", q4: "-", total: "-" },
        cash: { q1: "0.00", q2: "0.00", q3: "0.00", q4: "0.00", total: "0.00" },
        yearCash: "0.00",
      };

      const monthOrder = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
      const months = Object.keys(formattedMonthlyPnl[year].months);

      const quarters = {
        q1: ['January', 'February', 'March'],
        q2: ['April', 'May', 'June'],
        q3: ['July', 'August', 'September'],
        q4: ['October', 'November', 'December'],
      };

      let yearTotalCash = 0;
      let yearCompoundedReturn = 1;
      let hasValidYearData = false;

      Object.keys(quarters).forEach(quarter => {
        let quarterCompoundedReturn = 1;
        let quarterCash = 0;
        let quarterCapitalInOut = 0;
        let hasValidQuarterData = false;

        const quarterMonths = quarters[quarter].filter(month => months.includes(month));
        if (quarterMonths.length > 0) {
          quarterMonths.forEach(month => {
            const monthPercentStr = formattedMonthlyPnl[year].months[month].percent;
            if (monthPercentStr !== "-") {
              const monthReturn = Number(monthPercentStr) / 100;
              quarterCompoundedReturn *= (1 + monthReturn);
              hasValidQuarterData = true;
            }
            quarterCash += Number(formattedMonthlyPnl[year].months[month].cash);
            quarterCapitalInOut += Number(formattedMonthlyPnl[year].months[month].capitalInOut);
          });
        }

        if (hasValidQuarterData) {
          if (quarterCompoundedReturn !== 1) {
            const quarterReturn = ((quarterCompoundedReturn - 1) * 100).toFixed(2);
            acc[year].percent[quarter] = quarterReturn;
            yearCompoundedReturn *= quarterCompoundedReturn;
            hasValidYearData = true;
          } else {
            acc[year].percent[quarter] = "0.00";
          }
        } else {
          acc[year].percent[quarter] = "-";
        }

        acc[year].cash[quarter] = quarterCash.toFixed(2);
        yearTotalCash += quarterCash;
      });

      if (hasValidYearData && yearCompoundedReturn !== 1) {
        acc[year].percent.total = ((yearCompoundedReturn - 1) * 100).toFixed(2);
      } else if (hasValidYearData && yearCompoundedReturn === 1) {
        acc[year].percent.total = "0.00";
      } else {
        acc[year].percent.total = "-";
      }

      acc[year].cash.total = yearTotalCash.toFixed(2);
      acc[year].yearCash = yearTotalCash.toFixed(2);

      return acc;
    }, {} as Stats["quarterlyPnl"]);

    const finalTrailingReturns: { [key: string]: number | null } = {};
    const periodDays = {
      fiveDays: 5,
      tenDays: 10,
      fifteenDays: 15,
      oneMonth: 30,
      threeMonths: 90,
      sixMonths: 180,
      oneYear: 365,
      twoYears: 730,
      fiveYears: 1825,
      sinceInception: Infinity,
    };

    periodLabels.forEach(period => {
  if (period === "MDD" || period === "currentDD") {
    if (equityCurve.length === 0) {
      finalTrailingReturns[period] = null;
    } else {
      let peakNav = 0;
      let maxDrawdown = 0;
      for (const entry of equityCurve) {
        peakNav = Math.max(peakNav, entry.value);
        const drawdown = peakNav > 0 ? ((peakNav - entry.value) / peakNav) * 100 : 0;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
      }
      if (period === "MDD") {
        finalTrailingReturns[period] = maxDrawdown;
      } else if (period === "currentDD") {
        const latestNav = equityCurve[equityCurve.length - 1].value;
        finalTrailingReturns[period] = peakNav > 0 ? ((peakNav - latestNav) / peakNav) * 100 : 0;
      }
    }
  } else {
    const latestNavEntry = equityCurve[equityCurve.length - 1];
    if (!latestNavEntry) {
      finalTrailingReturns[period] = null;
      return;
    }

    const startNav = latestNavEntry.value;
    const startDate = new Date(latestNavEntry.date);

    let endNav = 0;
    let endDate: Date | null = null;

    console.log(`\nDEBUG TRAILING: period=${period}`);
    console.log(`  → using latest NAV: ${startNav.toFixed(4)} on ${startDate}`);

    if (period === "sinceInception") {
      const firstNavEntry = equityCurve[0];
      if (firstNavEntry) {
        endNav = firstNavEntry.value;
        endDate = new Date(firstNavEntry.date);
        console.log(`  → sinceInception picks first NAV: ${endNav.toFixed(4)} on ${endDate}`);
      }
    } else {
      const days = periodDays[period];
      const targetEntry = getNavEntriesAgo(equityCurve, days);
      if (targetEntry) {
        endNav = targetEntry.value;
        endDate = new Date(targetEntry.date);
        console.log(`  → ${days} days ago NAV: ${endNav.toFixed(4)} on ${endDate}`);
      }
    }

    if (endNav > 0 && endDate) {
      let periodReturn: number;

      // Calculate days between start and end
      const days = (startDate.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24);

      if (period === "sinceInception" && days > 365) {
        // Use CAGR formula for sinceInception when period > 1 year
        periodReturn = (Math.pow(startNav / endNav, 365 / days) - 1) * 100;
        console.log(
          `  → computed CAGR: (Math.pow(${startNav.toFixed(4)} / ` +
          `${endNav.toFixed(4)}, 365 / ${days.toFixed(2)}) - 1) × 100 = ${periodReturn.toFixed(2)}%`
        );
      } else {
        // Use simple return formula
        periodReturn = ((startNav / endNav) - 1) * 100;
        console.log(
          `  → computed return: ((${startNav.toFixed(4)} / ` +
          `${endNav.toFixed(4)}) - 1) × 100 = ${periodReturn.toFixed(2)}%`
        );
      }

      finalTrailingReturns[period] = periodReturn;
    } else {
      console.log(`  → no data available for ${period}`);
      finalTrailingReturns[period] = null;
    }
  }
});

    // Determine the final strategy name
    let finalStrategyName: string;
    if (strategyNames.length === 1) {
      finalStrategyName = strategyNames[0];
    } else if (strategyNames.length > 1) {
      finalStrategyName = strategyNames.join(" + ");
    } else {
      finalStrategyName = "Portfolio Strategy";
    }

    const formatTrailingReturn = (value: number | null): string => {
      if (value === null || value === undefined) {
        return "-";
      }
      return value.toFixed(2);
    };

    let allHoldings: Holding[] = [];

    for (const { qcode, account_type, broker, strategy } of qcodesWithDetails) {
      const dataStrategy = getDataFetchingStrategy({ account_type, broker, strategy });

      try {
        const holdings = await dataStrategy.getHoldings(qcode);
        allHoldings.push(...holdings);
        console.log(`Fetched ${holdings.length} holdings for qcode ${qcode}`);
      } catch (error) {
        console.error(`Error fetching holdings for qcode ${qcode}:`, error);
      }
    }

    // Calculate holdings summary
    const holdingsSummary = calculateHoldingsSummary(allHoldings);

    const stats: Stats = {
      amountDeposited: amountDeposited.toFixed(2),
      currentExposure: currentExposure.toFixed(2),
      return: totalReturn.toFixed(2),
      totalProfit: totalProfit.toFixed(2),
      trailingReturns: {
        fiveDays: formatTrailingReturn(finalTrailingReturns.fiveDays),
        fifteenDays: formatTrailingReturn(finalTrailingReturns.fifteenDays),
        tenDays: formatTrailingReturn(finalTrailingReturns.tenDays),
        oneMonth: formatTrailingReturn(finalTrailingReturns.oneMonth),
        threeMonths: formatTrailingReturn(finalTrailingReturns.threeMonths),
        sixMonths: formatTrailingReturn(finalTrailingReturns.sixMonths),
        oneYear: formatTrailingReturn(finalTrailingReturns.oneYear),
        twoYears: formatTrailingReturn(finalTrailingReturns.twoYears),
        fiveYears: formatTrailingReturn(finalTrailingReturns.fiveYears),
        sinceInception: formatTrailingReturn(finalTrailingReturns.sinceInception),
        MDD: formatTrailingReturn(finalTrailingReturns.MDD),
        currentDD: formatTrailingReturn(finalTrailingReturns.currentDD),
      },
      drawdown: maxDrawdown.toFixed(2),
      equityCurve,
      drawdownCurve,
      quarterlyPnl: formattedQuarterlyPnl,
      strategyName: finalStrategyName,
      monthlyPnl: formattedMonthlyPnl,
      cashFlows: allCashFlows.sort((a, b) => a.date.localeCompare(b.date)),
      holdings: holdingsSummary
    };

    return stats;
  } catch (error) {
    console.error("Error calculating portfolio metrics:", error);
    return null;
  }
}

export function formatPortfolioStats(metrics: any): Stats {
  return {
    amountDeposited: metrics?.amountDeposited || "0.00",
    currentExposure: metrics?.currentExposure || "0.00",
    return: metrics?.return || "0.00",
    totalProfit: metrics?.totalProfit || "0.00",
    trailingReturns: metrics?.trailingReturns || {
      fiveDays: "0.00",
      tenDays: "0.00",
      fifteenDays: "0.00",
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
    cashFlows: metrics?.cashFlows || (metrics?.cashInOut?.transactions || []),
    strategyName: metrics?.strategyName || "Unknown Strategy",
    holdings: metrics?.holdings || {
      totalBuyValue: 0,
      totalCurrentValue: 0,
      totalPnl: 0,
      totalPnlPercent: 0,
      holdingsCount: 0,
      equityHoldings: [],
      debtHoldings: [],
      categoryBreakdown: {},
      brokerBreakdown: {}
    },
  };
}