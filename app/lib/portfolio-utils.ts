import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

// Determine which table to use based on environment
const isDevelopment = process.env.NODE_ENV === 'development';

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
  mutualFundHoldings: Holding[];
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
  getAmountDeposited(qcode: string, tag?: string): Promise<number>;
  getLatestExposure(qcode: string, tag?: string): Promise<{ portfolioValue: number; drawdown: number; nav: number; date: Date } | null>;
  getPortfolioReturns(qcode: string, strategy?: string, tag?: string): Promise<number>;
  getTotalProfit(qcode: string, strategy?: string, tag?: string): Promise<number>;
  getHistoricalData(qcode: string, strategy?: string, tag?: string): Promise<{ date: Date; nav: number; drawdown: number; pnl: number; capitalInOut: number }[]>;
  getFirstNav(qcode: string, strategy?: string, tag?: string): Promise<{ nav: number; date: Date } | null>;
  getNavAtDate(qcode: string, targetDate: Date, direction: 'before' | 'after' | 'closest', strategy?: string, tag?: string): Promise<{ nav: number; date: Date } | null>;
  getCashFlows?(qcode: string, tag?: string): Promise<{ date: Date; amount: number }[]>;
  getStrategyName(strategy?: string): string;
  getHoldings(qcode: string): Promise<Holding[]>; // Add this method
}

// Strategy for Managed Accounts (Jainam)
class JainamManagedStrategy implements DataFetchingStrategy {
  async getAmountDeposited(qcode: string, tag?: string, strategy?: string): Promise<number> {
    // For deposits, always use 'Zerodha Total Portfolio'
    const systemTag = tag || 'Zerodha Total Portfolio';
    const masterSheet = (isDevelopment ? prisma.master_sheet_test : prisma.master_sheet) as any;
    const depositRecords = await masterSheet.aggregate({
       where: { qcode, system_tag: systemTag, capital_in_out: { not: null } },
      _sum: { capital_in_out: true },
    });
    console.log('depositRecords:', depositRecords);
    return Number(depositRecords._sum?.capital_in_out) || 0;
  }

  async getLatestExposure(qcode: string, tag?: string, strategy?: string): Promise<{ portfolioValue: number; drawdown: number; nav: number; date: Date } | null> {
    // For current portfolio value, use 'Zerodha Total Portfolio'
    const systemTag = tag || 'Zerodha Total Portfolio';
    const masterSheet = (isDevelopment ? prisma.master_sheet_test : prisma.master_sheet) as any;
    const record = await masterSheet.findFirst({
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

  async getPortfolioReturns(qcode: string, strategy?: string, tag?: string): Promise<number> {
    try {
      // For returns, use 'Total Portfolio Value'
      const systemTag = tag || 'Total Portfolio Value';
      const masterSheet = (isDevelopment ? prisma.master_sheet_test : prisma.master_sheet) as any;
      const firstNavRecord = await masterSheet.findFirst({
        where: { qcode, system_tag: systemTag, nav: { not: null } },
        orderBy: { date: "asc" },
        select: { nav: true, date: true },
      });

      const latestNavRecord = await masterSheet.findFirst({
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

  async getTotalProfit(qcode: string, strategy?: string, tag?: string): Promise<number> {
    // For total profit, use 'Total Portfolio Value'
    const systemTag = tag || 'Total Portfolio Value';
    const masterSheet = (isDevelopment ? prisma.master_sheet_test : prisma.master_sheet) as any;
    const profitSum = await masterSheet.aggregate({
      where: { qcode, system_tag: systemTag },
      _sum: { pnl: true },
    });
    return Number(profitSum._sum.pnl) || 0;
  }

  async getCashFlows(qcode: string, tag?: string, strategy?: string): Promise<{ date: Date; amount: number }[]> {
    // For cash flows, use 'Total Portfolio Value'
    const systemTag = tag || 'Zerodha Total Portfolio';
    const masterSheet = (isDevelopment ? prisma.master_sheet_test : prisma.master_sheet) as any;
    const rows = await masterSheet.findMany({
      where: {
        qcode,
        system_tag: systemTag,
        capital_in_out: { not: null, not: new Decimal(0) },
      },
      select: { date: true, capital_in_out: true },
      orderBy: { date: "asc" },
    });
    return rows.map((r: any) => ({
      date: r.date,
      amount: Number(r.capital_in_out),
    }));
  }

  async getHistoricalData(qcode: string, strategy?: string, tag?: string): Promise<{ date: Date; nav: number; drawdown: number; pnl: number; capitalInOut: number }[]> {
    // For historical data, use 'Total Portfolio Value'
    const systemTag = tag || 'Total Portfolio Value';
    console.log('[JainamManagedStrategy.getHistoricalData] qcode:', qcode);
    console.log('[JainamManagedStrategy.getHistoricalData] strategy:', strategy);
    console.log('[JainamManagedStrategy.getHistoricalData] tag:', tag);
    console.log('[JainamManagedStrategy.getHistoricalData] systemTag:', systemTag);
    console.log('[JainamManagedStrategy.getHistoricalData] isDevelopment:', isDevelopment);
    console.log('[JainamManagedStrategy.getHistoricalData] Using table:', isDevelopment ? 'master_sheet_test' : 'master_sheet');
    const masterSheet = (isDevelopment ? prisma.master_sheet_test : prisma.master_sheet) as any;

    // Debug: Check what system_tags exist for this qcode
    const availableTags = await masterSheet.findMany({
      where: { qcode },
      select: { system_tag: true },
      distinct: ['system_tag'],
    });
    console.log('[JainamManagedStrategy.getHistoricalData] Available system_tags for qcode:', availableTags.map((t: any) => t.system_tag));

    const data = await masterSheet.findMany({
      where: { qcode, system_tag: systemTag, nav: { not: null }, drawdown: { not: null } },
      select: { date: true, nav: true, drawdown: true, pnl: true, capital_in_out: true },
      orderBy: { date: "asc" },
    });
    console.log('[JainamManagedStrategy.getHistoricalData] Found', data.length, 'records');
    return data.map((entry: any) => ({
      date: entry.date,
      nav: Number(entry.nav) || 0,
      drawdown: Math.abs(Number(entry.drawdown) || 0),
      pnl: Number(entry.pnl) || 0,
      capitalInOut: Number(entry.capital_in_out) || 0,
    }));
  }

  async getFirstNav(qcode: string, strategy?: string, tag?: string): Promise<{ nav: number; date: Date } | null> {
    // For first NAV, use 'Total Portfolio Value'
    const systemTag = tag || 'Total Portfolio Value';
    const masterSheet = (isDevelopment ? prisma.master_sheet_test : prisma.master_sheet) as any;
    const record = await masterSheet.findFirst({
      where: { qcode, system_tag: systemTag, nav: { not: null } },
      orderBy: { date: "asc" },
      select: { nav: true, date: true },
    });
    if (!record) return null;
    return { nav: Number(record.nav), date: record.date };
  }

  async getNavAtDate(qcode: string, targetDate: Date, direction: 'before' | 'after' | 'closest', strategy?: string, tag?: string): Promise<{ nav: number; date: Date } | null> {
    // For NAV at date, use 'Total Portfolio Value'
    const systemTag = tag || 'Total Portfolio Value';
    const masterSheet = (isDevelopment ? prisma.master_sheet_test : prisma.master_sheet) as any;
    let whereClause: any = { qcode, system_tag: systemTag, nav: { not: null } };
    let orderBy: any = { date: "desc" };

    if (direction === 'before') {
      whereClause.date = { lte: targetDate };
      orderBy = { date: "desc" };
    } else if (direction === 'after') {
      whereClause.date = { gte: targetDate };
      orderBy = { date: "asc" };
    }

    const result = await masterSheet.findFirst({ where: whereClause, orderBy, select: { nav: true, date: true } });
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
    // Using raw SQL with window function for better performance
    const holdings = await prisma.$queryRaw<any[]>`
    SELECT DISTINCT ON (symbol, exchange)
      symbol,
      exchange,
      quantity,
      avg_price,
      ltp,
      buy_value,
      value_as_of_today,
      pnl_amount,
      percent_pnl,
      broker,
      debt_equity,
      sub_category,
      date
    FROM equity_holding_test
    WHERE qcode = ${qcode}
      AND quantity > 0
    ORDER BY symbol ASC, exchange ASC, date DESC
  `;

  // Get all mutual fund holdings for this qcode
  // Since data is replaced on each upload, we don't need to filter by date
  const mutualFundHoldings = await prisma.mutual_fund_holding_sheet_test.findMany({
    where: {
      qcode,
      quantity: { gt: 0 },
      isin: { not: null, notIn: ['', ' '] }
    },
    orderBy: { symbol: 'asc' }
  });

    const isinMap = new Map<string, any>();
  mutualFundHoldings.forEach(holding => {
    const isin = holding.isin || '';
    if (!isin) return;

    if (!isinMap.has(isin)) {
      isinMap.set(isin, {
        symbol: holding.symbol,
        isin: holding.isin,
        scheme_code: holding.scheme_code,
        quantity: 0,
        buy_value: 0,
        value_as_of_today: 0,
        pnl_amount: 0,
        nav: holding.nav,
        broker: holding.broker,
        debt_equity: holding.debt_equity,
        sub_category: holding.sub_category,
        as_of_date: holding.as_of_date,
        mastersheet_tag: holding.mastersheet_tag,
      });
    }

    const existing = isinMap.get(isin);
    existing.quantity += Number(holding.quantity) || 0;
    existing.buy_value += Number(holding.buy_value) || 0;
    existing.value_as_of_today += Number(holding.value_as_of_today) || 0;
    existing.pnl_amount += Number(holding.pnl_amount) || 0;
  });

  // Convert equity holdings to standard format
  const equityHoldings: Holding[] = holdings.map(holding => ({
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

  // Convert mutual fund holdings to standard format
  const mfHoldings: Holding[] = Array.from(isinMap.values()).map(mf => ({
    symbol: mf.symbol || '',
    exchange: 'MF',
    quantity: mf.quantity,
    avgPrice: mf.quantity > 0 ? mf.buy_value / mf.quantity : 0,
    ltp: Number(mf.nav) || 0,
    buyValue: mf.buy_value,
    valueAsOfToday: mf.value_as_of_today,
    pnlAmount: mf.pnl_amount,
    percentPnl: mf.buy_value > 0 ? (mf.pnl_amount / mf.buy_value) * 100 : 0,
    broker: mf.broker || '',
    debtEquity: mf.debt_equity || '',
    subCategory: mf.sub_category || '',
    date: mf.as_of_date || new Date(),
  }));

  // Combine equity and mutual fund holdings
  return [...equityHoldings, ...mfHoldings];
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
    return strategy && strategyMap[strategy] ? strategyMap[strategy] : 'Total Portfolio Exposure';
  }

  async getAmountDeposited(qcode: string, tag?: string): Promise<number> {
    // If broker is Radiance, use 'Total Portfolio Exposure' for amount deposited
    const systemTag = tag || (this.broker.toLowerCase() === 'radiance' ? 'Total Portfolio Exposure' : 'Zerodha Total Portfolio');
    const masterSheet = (isDevelopment ? prisma.master_sheet_test : prisma.master_sheet) as any;
    console.log('[ZerodhaManagedStrategy.getAmountDeposited] isDevelopment:', isDevelopment);
    console.log('[ZerodhaManagedStrategy.getAmountDeposited] Using table:', isDevelopment ? 'master_sheet_test' : 'master_sheet');
    console.log('[ZerodhaManagedStrategy.getAmountDeposited] NODE_ENV:', process.env.NODE_ENV);
    const depositSum = await masterSheet.aggregate({
      where: { qcode, system_tag: systemTag, capital_in_out: { not: null } },
      _sum: { capital_in_out: true },
    });
    return Number(depositSum._sum.capital_in_out) || 0;
  }

  async getLatestExposure(qcode: string, tag?: string): Promise<{ portfolioValue: number; drawdown: number; nav: number; date: Date } | null> {
    // If broker is Radiance, use 'Total Portfolio Exposure' for latest exposure
    const systemTag = tag || (this.broker.toLowerCase() === 'radiance' ? 'Total Portfolio Exposure' : 'Zerodha Total Portfolio');
    const masterSheet = (isDevelopment ? prisma.master_sheet_test : prisma.master_sheet) as any;
    const record = await masterSheet.findFirst({
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

  async getPortfolioReturns(qcode: string, strategy?: string, tag?: string): Promise<number> {
    try {
      console.log('[ZerodhaManagedStrategy.getPortfolioReturns] isDevelopment:', isDevelopment);
      console.log('[ZerodhaManagedStrategy.getPortfolioReturns] Using table:', isDevelopment ? 'master_sheet_test' : 'master_sheet');
      console.log('[ZerodhaManagedStrategy.getPortfolioReturns] NODE_ENV:', process.env.NODE_ENV);
      const systemTag = this.getSystemTag(strategy);
      const masterSheet = (isDevelopment ? prisma.master_sheet_test : prisma.master_sheet) as any;
      const firstNavRecord = await masterSheet.findFirst({
        where: { qcode, system_tag: systemTag, nav: { not: null } },
        orderBy: { date: "asc" },
        select: { nav: true, date: true },
      });

      const latestNavRecord = await masterSheet.findFirst({
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


  async getTotalProfit(qcode: string, strategy?: string, tag?: string): Promise<number> {
    console.log('[ZerodhaManagedStrategy.getTotalProfit] isDevelopment:', isDevelopment);
    console.log('[ZerodhaManagedStrategy.getTotalProfit] Using table:', isDevelopment ? 'master_sheet_test' : 'master_sheet');
    console.log('[ZerodhaManagedStrategy.getTotalProfit] NODE_ENV:', process.env.NODE_ENV);
    const systemTag = tag || this.getSystemTag(strategy);
    const masterSheet = (isDevelopment ? prisma.master_sheet_test : prisma.master_sheet) as any;
    const profitSum = await masterSheet.aggregate({
      where: { qcode, system_tag: systemTag },
      _sum: { pnl: true },
    });
    return Number(profitSum._sum.pnl) || 0;
  }

  async getHistoricalData(qcode: string, strategy?: string, tag?: string): Promise<{ date: Date; nav: number; drawdown: number; pnl: number; capitalInOut: number }[]> {
    console.log('[ZerodhaManagedStrategy.getHistoricalData] isDevelopment:', isDevelopment);
    console.log('[ZerodhaManagedStrategy.getHistoricalData] Using table:', isDevelopment ? 'master_sheet_test' : 'master_sheet');
    console.log('[ZerodhaManagedStrategy.getHistoricalData] NODE_ENV:', process.env.NODE_ENV);
    const systemTag = tag || this.getSystemTag(strategy);
    const masterSheet = (isDevelopment ? prisma.master_sheet_test : prisma.master_sheet) as any;
    const data = await masterSheet.findMany({
      where: { qcode, system_tag: systemTag, nav: { not: null }, drawdown: { not: null } },
      select: { date: true, nav: true, drawdown: true, pnl: true, capital_in_out: true },
      orderBy: { date: "asc" },
    });
    return data.map((entry: any) => ({
      date: entry.date,
      nav: Number(entry.nav) || 0,
      drawdown: Math.abs(Number(entry.drawdown) || 0),
      pnl: Number(entry.pnl) || 0,
      capitalInOut: Number(entry.capital_in_out) || 0,
    }));
  }

  async getCashFlows(qcode: string, tag?: string): Promise<{ date: Date; amount: number }[]> {
    console.log('[ZerodhaManagedStrategy.getCashFlows] isDevelopment:', isDevelopment);
    console.log('[ZerodhaManagedStrategy.getCashFlows] Using table:', isDevelopment ? 'master_sheet_test' : 'master_sheet');
    console.log('[ZerodhaManagedStrategy.getCashFlows] NODE_ENV:', process.env.NODE_ENV);
    // If broker is Radiance, use 'Total Portfolio Exposure' for cash flows
    const systemTag = tag || (this.broker.toLowerCase() === 'radiance' ? 'Total Portfolio Exposure' : 'Zerodha Total Portfolio');
    const masterSheet = (isDevelopment ? prisma.master_sheet_test : prisma.master_sheet) as any;
    const cashFlows = await masterSheet.findMany({
      where: {
        qcode,
        system_tag: systemTag,
        capital_in_out: { not: null, not: new Decimal(0) },
      },
      select: { date: true, capital_in_out: true },
      orderBy: { date: "asc" },
    });

    return cashFlows.map((entry: any) => ({
      date: entry.date,
      amount: entry.capital_in_out!.toNumber(),
    }));
  }

  async getFirstNav(qcode: string, strategy?: string, tag?: string): Promise<{ nav: number; date: Date } | null> {
    const systemTag = tag || this.getSystemTag(strategy);
    const masterSheet = (isDevelopment ? prisma.master_sheet_test : prisma.master_sheet) as any;
    const record = await masterSheet.findFirst({
      where: { qcode, system_tag: systemTag, nav: { not: null } },
      orderBy: { date: "asc" },
      select: { nav: true, date: true },
    });
    if (!record) return null;
    return { nav: Number(record.nav), date: record.date };
  }

  async getNavAtDate(qcode: string, targetDate: Date, direction: 'before' | 'after' | 'closest', strategy?: string, tag?: string): Promise<{ nav: number; date: Date } | null> {
    const systemTag = tag || this.getSystemTag(strategy);
    const masterSheet = (isDevelopment ? prisma.master_sheet_test : prisma.master_sheet) as any;
    let whereClause: any = { qcode, system_tag: systemTag, nav: { not: null } };
    let orderBy: any = { date: "desc" };

    if (direction === 'before') {
      whereClause.date = { lte: targetDate };
      orderBy = { date: "desc" };
    } else if (direction === 'after') {
      whereClause.date = { gte: targetDate };
      orderBy = { date: "asc" };
    }

    const result = await masterSheet.findFirst({ where: whereClause, orderBy, select: { nav: true, date: true } });
    if (!result) {
      if (direction === 'closest') {
        const beforeResult = await this.getNavAtDate(qcode, targetDate, 'before', strategy, tag);
        const afterResult = await this.getNavAtDate(qcode, targetDate, 'after', strategy, tag);
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

 async getHoldings(qcode: string): Promise<HoldingsSummary> {
  // Get latest dates
  const latestEquityDate = await prisma.equity_holding_test.findFirst({
    where: { qcode, date: { not: null } },
    orderBy: { date: 'desc' },
    select: { date: true }
  });

  const latestMFDate = await prisma.mutual_fund_holding_sheet_test.findFirst({
    where: { qcode, as_of_date: { not: null } },
    orderBy: { as_of_date: 'desc' },
    select: { as_of_date: true }
  });

  const equityHoldingsRaw = latestEquityDate?.date
    ? await prisma.equity_holding_test.findMany({
        where: { qcode, date: latestEquityDate.date, quantity: { gt: 0 } },
      })
    : [];

  const mfHoldingsRaw = latestMFDate?.as_of_date
    ? await prisma.mutual_fund_holding_sheet_test.findMany({
        where: { qcode, as_of_date: latestMFDate.as_of_date, quantity: { gt: 0 } },
      })
    : [];

  // Process Equity (including Debt securities like Bonds, NCDs)
  const equityMap = new Map<string, any>();
  const debtMap = new Map<string, any>();

  for (const h of equityHoldingsRaw) {
    const symbol = (h.symbol || '').trim();
    if (!symbol) continue;

    const isDebt = ['Debt', 'DEBT', 'Bond', 'NCD', 'SDL'].some(term =>
      (h.debt_equity || '').toLowerCase().includes('debt') ||
      (h.sub_category || '').toLowerCase().includes('debt') ||
      symbol.toLowerCase().includes('bond') ||
      symbol.toLowerCase().includes('ncd')
    );

    const map = isDebt ? debtMap : equityMap;
    const key = symbol.toLowerCase();

    if (!map.has(key)) {
      map.set(key, {
        symbol,
        exchange: h.exchange || 'NSE',
        quantity: 0,
        buyValue: 0,
        valueAsOfToday: 0,
        pnlAmount: 0,
        ltp: Number(h.ltp) || 0,
        broker: h.broker || 'Zerodha',
        debtEquity: isDebt ? 'Debt' : 'Equity',
        subCategory: h.sub_category || '',
        date: h.date || new Date(),
      });
    }

    const entry = map.get(key);
    const qty = Number(h.quantity) || 0;
    const buyVal = Number(h.buy_value) || 0;
    const currentVal = Number(h.value_as_of_today) || 0;
    const pnl = Number(h.pnl_amount) || 0;

    entry.quantity += qty;
    entry.buyValue += buyVal;
    entry.valueAsOfToday += currentVal;
    entry.pnlAmount += pnl;
  }

  // Process Mutual Funds
  const mfMap = new Map<string, any>();

  for (const h of mfHoldingsRaw) {
    const isin = (h.isin || '').trim();
    if (!isin) continue;

    if (!mfMap.has(isin)) {
      mfMap.set(isin, {
        symbol: h.symbol || 'Unknown Fund',
        isin,
        quantity: 0,
        buyValue: 0,
        valueAsOfToday: 0,
        pnlAmount: 0,
        broker: h.broker || 'Zerodha',
        debtEquity: h.debt_equity || 'Hybrid',
        subCategory: h.sub_category || '',
        date: h.as_of_date || new Date(),
        ltp: Number(h.nav) || 0,
      });
    }

    const entry = mfMap.get(isin);
    entry.quantity += Number(h.quantity) || 0;
    entry.buyValue += Number(h.buy_value) || 0;
    entry.valueAsOfToday += Number(h.value_as_of_today) || 0;
    entry.pnlAmount += Number(h.pnl_amount) || 0;
  }

  // Convert to final Holding format
  const finalizeHolding = (item: any): Holding => ({
    symbol: item.symbol,
    exchange: item.exchange || 'N/A',
    quantity: item.quantity,
    avgPrice: item.quantity > 0 ? item.buyValue / item.quantity : 0,
    ltp: item.ltp || 0,
    buyValue: item.buyValue,
    valueAsOfToday: item.valueAsOfToday ?? (item.quantity * (item.ltp || 0)),
    pnlAmount: (item.valueAsOfToday ?? (item.quantity * (item.ltp || 0))) - item.buyValue,
    percentPnl: item.buyValue > 0 ? (((item.valueAsOfToday ?? (item.quantity * (item.ltp || 0))) - item.buyValue) / item.buyValue) * 100 : 0,
    broker: item.broker,
    debtEquity: item.debtEquity,
    subCategory: item.subCategory,
    date: item.date,
    type: item.isin ? 'mutual_fund' : 'equity',
    isin: item.isin,
  });

  const equityHoldings: Holding[] = Array.from(equityMap.values()).map(finalizeHolding);
  const debtHoldings: Holding[] = Array.from(debtMap.values()).map(finalizeHolding);
  const mutualFundHoldings: Holding[] = Array.from(mfMap.values()).map(finalizeHolding);

  const allHoldings = [...equityHoldings, ...debtHoldings, ...mutualFundHoldings];

  const totalBuyValue = allHoldings.reduce((sum, h) => sum + h.buyValue, 0);
  const totalCurrentValue = allHoldings.reduce((sum, h) => sum + h.valueAsOfToday, 0);
  const totalPnl = totalCurrentValue - totalBuyValue;
  const totalPnlPercent = totalBuyValue > 0 ? (totalPnl / totalBuyValue) * 100 : 0;

  return {
    totalBuyValue,
    totalCurrentValue,
    totalPnl,
    totalPnlPercent,
    holdingsCount: allHoldings.length,
    equityHoldings,
    debtHoldings,
    mutualFundHoldings,
    categoryBreakdown: {}, // You can populate this if needed
    brokerBreakdown: {},
  };
}

  getStrategyName(strategy?: string): string {
    return strategy && strategyNameMap[strategy] ? strategyNameMap[strategy] : "Qode Yield Enhancer+";
  }

}

class PmsStrategy implements DataFetchingStrategy {
  async getAmountDeposited(qcode: string, tag?: string): Promise<number> {
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

  async getLatestExposure(qcode: string, tag?: string): Promise<{ portfolioValue: number; drawdown: number; nav: number; date: Date } | null> {
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

  async getPortfolioReturns(qcode: string, strategy?: string, tag?: string): Promise<number> {
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

  async getTotalProfit(qcode: string, strategy?: string, tag?: string): Promise<number> {
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

  async getHistoricalData(qcode: string, strategy?: string, tag?: string): Promise<{ date: Date; nav: number; drawdown: number; pnl: number; capitalInOut: number }[]> {
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

  async getFirstNav(qcode: string, strategy?: string, tag?: string): Promise<{ nav: number; date: Date } | null> {
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

  async getNavAtDate(qcode: string, targetDate: Date, direction: 'before' | 'after' | 'closest', strategy?: string, tag?: string): Promise<{ nav: number; date: Date } | null> {
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
  // First, get the latest date for this qcode
  const latestDateRecord = await prisma.equity_holding_test.findFirst({
    where: { qcode },
    orderBy: { date: 'desc' },
    select: { date: true }
  });

  if (!latestDateRecord?.date) {
    return [];
  }

  // Fetch only holdings from the latest date
  const rawHoldings = await prisma.equity_holding_test.findMany({
    where: {
      qcode,
      date: latestDateRecord.date,
      quantity: { gt: 0 } // Only active holdings
    },
    orderBy: { symbol: 'asc' }
  });

  if (rawHoldings.length === 0) {
    return [];
  }

  // Group by symbol (case-insensitive) and compute weighted averages and totals
  const holdingsMap = new Map<string, {
    originalSymbol: string;
    totalQuantity: number;
    weightedAvgPriceSum: number;
    ltp: number;
    exchange: string;
    broker: string;
    subCategories: string[];
    debtEquities: string[];
    category?: string; // Assuming 'category' if it exists, but not in provided schema
  }>();

  for (const holding of rawHoldings) {
    const symbol = holding.symbol || '';
    const key = symbol.toLowerCase(); // Case-insensitive grouping

    if (!holdingsMap.has(key)) {
      holdingsMap.set(key, {
        originalSymbol: symbol, // Preserve original casing
        totalQuantity: 0,
        weightedAvgPriceSum: 0,
        ltp: Number(holding.ltp) || 0,
        exchange: holding.exchange || '',
        broker: holding.broker || '',
        subCategories: [],
        debtEquities: [],
      });
    }

    const group = holdingsMap.get(key)!;
    const qty = Number(holding.quantity) || 0;
    const avgPrice = Number(holding.avg_price) || 0;

    group.totalQuantity += qty;
    group.weightedAvgPriceSum += qty * avgPrice;

    // Assume LTP is the same across the group; if not, you may need to average or take max
    // For now, overwriting with the last one; adjust if LTP varies
    group.ltp = Number(holding.ltp) || 0;

    // Collect varying fields like sub_category and debt_equity
    if (holding.sub_category && !group.subCategories.includes(holding.sub_category)) {
      group.subCategories.push(holding.sub_category);
    }
    if (holding.debt_equity && !group.debtEquities.includes(holding.debt_equity)) {
      group.debtEquities.push(holding.debt_equity);
    }

    // Take first for common fields like exchange, broker
    if (!group.exchange) group.exchange = holding.exchange || '';
    if (!group.broker) group.broker = holding.broker || '';
  }

  // Build the final holdings array
  const holdings: Holding[] = [];
  for (const [key, group] of holdingsMap) {
    if (group.totalQuantity <= 0) continue;

    const weightedAvgPrice = group.weightedAvgPriceSum / group.totalQuantity;
    const buyValue = group.totalQuantity * weightedAvgPrice;
    const valueAsOfToday = group.totalQuantity * group.ltp;
    const pnlAmount = valueAsOfToday - buyValue;
    const percentPnl = buyValue > 0 ? (pnlAmount / buyValue) * 100 : 0;

    holdings.push({
      symbol: group.originalSymbol, // Use preserved original casing
      exchange: group.exchange,
      quantity: group.totalQuantity,
      avgPrice: weightedAvgPrice,
      ltp: group.ltp,
      buyValue,
      valueAsOfToday,
      pnlAmount,
      percentPnl,
      broker: group.broker,
      debtEquity: group.debtEquities.join(', ') || '', // Concatenate if multiple
      subCategory: group.subCategories.join(', ') || '', // Concatenate sub-categories
      date: latestDateRecord.date || new Date(),
    });
  }

  // Sort by symbol (using original casing)
  return holdings.sort((a, b) => a.symbol.localeCompare(b.symbol));
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
  } else if (account.account_type === 'managed_account') {
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
    return accounts.map(acc => ({
      qcode: acc.qcode,
      account_type: acc.account_type,
      broker: acc.broker,
      strategy: acc.strategy ?? undefined,
    }));
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
export async function calculatePortfolioMetrics(qcodesWithDetails: { qcode: string; account_type: string; broker: string; strategy?: string }[], tag?: string | null): Promise<Stats | null> {
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
      const accountDeposited = await dataStrategy.getAmountDeposited(qcode, tag || undefined);
      amountDeposited += accountDeposited;

      // 2. Current Exposure and Drawdown
      const latestExposure = await dataStrategy.getLatestExposure(qcode, tag || undefined);
      if (latestExposure) {
        currentExposure += latestExposure.portfolioValue;
        portfolioValues[qcode] = latestExposure.portfolioValue;
        accountCurrentDrawdowns[qcode] = latestExposure.drawdown;
      }

      // 3. Portfolio Returns
      totalReturn = await dataStrategy.getPortfolioReturns(qcode, strategy, tag || undefined);

      // 4. Total Profit
      totalProfit += await dataStrategy.getTotalProfit(qcode, strategy, tag || undefined);

      // 5. Cash Flows
      if (dataStrategy.getCashFlows) {
        const flows = await dataStrategy.getCashFlows(qcode, tag || undefined);
        flows.forEach(f =>
          allCashFlows.push({
            date: f.date.toISOString().split("T")[0],
            amount: Number(f.amount),
          })
        );
      }

      // 6. Historical Data for NAV and Drawdown Curves
      const historicalData = await dataStrategy.getHistoricalData(qcode, strategy, tag || undefined);
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
        let holdingsResponse;
try {
  holdingsResponse = await dataStrategy.getHoldings(qcode);
} catch (error) {
  console.error(`Error fetching holdings for qcode ${qcode}:`, error);
  continue; // skip this account
}

// Handle both old (Holding[]) and new (HoldingsSummary) return types
let accountHoldings: Holding[] = [];

if (Array.isArray(holdingsResponse)) {
  // Old behavior: direct array
  accountHoldings = holdingsResponse;
} else if (holdingsResponse && typeof holdingsResponse === 'object') {
  // New behavior: HoldingsSummary object
  accountHoldings = [
    ...(holdingsResponse.equityHoldings || []),
    ...(holdingsResponse.debtHoldings || []),
    ...(holdingsResponse.mutualFundHoldings || [])
  ];
} else {
  console.warn(`Unexpected holdings format for qcode ${qcode}`, holdingsResponse);
  accountHoldings = [];
}

allHoldings.push(...accountHoldings);
        console.log(`Fetched ${accountHoldings.length} holdings for qcode ${qcode}`);
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