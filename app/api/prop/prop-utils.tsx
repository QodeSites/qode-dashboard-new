import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

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

export interface PropStats {
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
  holdings?: HoldingsSummary;
}

export interface SystemTag {
  tag: string;
  category: 'deposit' | 'nav' | 'exposure' | 'other';
  lastUpdated: Date;
  recordCount: number;
}

// Get all prop account qcodes for a user
export async function getPropQcodes(icode: string): Promise<{ qcode: string; strategy?: string }[]> {
  try {
    const accounts = await prisma.accounts.findMany({
      where: {
        OR: [
          { pooled_account_users: { some: { icode } } },
          { pooled_account_allocations: { some: { icode } } },
        ],
        account_type: 'prop',
      },
      select: { qcode: true, strategy: true },
      distinct: ['qcode'],
    });
    
    console.log(`getPropQcodes: icode=${icode}, result=${JSON.stringify(accounts)}`);
    return accounts;
  } catch (error) {
    console.error("Error fetching prop qcodes:", error);
    return [];
  }
}

// Get unique system tags for prop accounts
export async function getUniquePropSystemTags(qcodes: string[]): Promise<SystemTag[]> {
  if (qcodes.length === 0) return [];

  try {
    // Fetch unique system tags with metadata
    const tags = await prisma.master_sheet_test.groupBy({
      by: ['system_tag'],
      where: {
        qcode: { in: qcodes },
        system_tag: { not: null },
      },
      _count: {
        system_tag: true,
      },
      _max: {
        date: true,
      },
    });

    // Categorize tags based on common naming patterns
    const categorizedTags: SystemTag[] = tags
      .filter(tag => tag.system_tag) // Filter out null tags
      .map(tag => {
        const tagName = tag.system_tag!.toLowerCase();
        let category: 'deposit' | 'nav' | 'exposure' | 'other' = 'other';

        if (tagName.includes('deposit') || tagName.includes('capital')) {
          category = 'deposit';
        } else if (tagName.includes('nav') || tagName.includes('pnl') || tagName.includes('p&l')) {
          category = 'nav';
        } else if (tagName.includes('exposure') || tagName.includes('portfolio')) {
          category = 'exposure';
        }

        return {
          tag: tag.system_tag!,
          category,
          lastUpdated: tag._max.date || new Date(),
          recordCount: tag._count.system_tag,
        };
      })
      .sort((a, b) => {
        // Sort by category first, then alphabetically
        if (a.category !== b.category) {
          const order = { deposit: 0, exposure: 1, nav: 2, other: 3 };
          return order[a.category] - order[b.category];
        }
        return a.tag.localeCompare(b.tag);
      });

    return categorizedTags;
  } catch (error) {
    console.error("Error fetching unique system tags:", error);
    return [];
  }
}

// PropAccountStrategy class
class PropAccountStrategy {
  // Parse tags from format "depositTag|navTag"
  private parseTags(tag?: string): { depositTag: string; navTag: string; cashflowTag?: string } {
    if (!tag) {
      throw new Error("Prop accounts require at least two tags in format: depositTag|navTag|cashflowTag (optional)");
    }
    
    const tags = tag.split('|');
    if (tags.length < 2) {
      throw new Error("Prop accounts require at least two tags separated by '|': depositTag|navTag|cashflowTag (optional)");
    }
    
    return {
      depositTag: tags[0].trim(),
      navTag: tags[1].trim(),
      cashflowTag: tags[2]?.trim() || undefined,
    };
  }

  async getAmountDeposited(qcode: string, tag?: string): Promise<number> {
    const { depositTag } = this.parseTags(tag);
    
    const depositRecords = await prisma.master_sheet_test.findFirst({
      where: { qcode, system_tag: depositTag },
      orderBy: { date: "desc" },
      select: { portfolio_value: true },
    });
    
    return Number(depositRecords?.portfolio_value) || 0;
  }

  async getLatestExposure(qcode: string, tag?: string): Promise<{ portfolioValue: number; drawdown: number; nav: number; date: Date } | null> {
    const { depositTag, navTag } = this.parseTags(tag);
    
    // Get portfolio value from deposit tag
    const exposureRecord = await prisma.master_sheet_test.findFirst({
      where: { qcode, system_tag: depositTag },
      orderBy: { date: "desc" },
      select: { portfolio_value: true, date: true },
    });
    
    // Get NAV and drawdown from NAV tag
    const navRecord = await prisma.master_sheet_test.findFirst({
      where: { qcode, system_tag: navTag },
      orderBy: { date: "desc" },
      select: { nav: true, drawdown: true, date: true },
    });
    
    if (!exposureRecord || !navRecord) return null;
    
    return {
      portfolioValue: Number(exposureRecord.portfolio_value) || 0,
      drawdown: Math.abs(Number(navRecord.drawdown) || 0),
      nav: Number(navRecord.nav) || 0,
      date: navRecord.date,
    };
  }

  async getPortfolioReturns(qcode: string, strategy?: string, tag?: string): Promise<number> {
    try {
      const { navTag } = this.parseTags(tag);
      
      const firstNavRecord = await prisma.master_sheet_test.findFirst({
        where: { qcode, system_tag: navTag, nav: { not: null } },
        orderBy: { date: "asc" },
        select: { nav: true, date: true },
      });

      const latestNavRecord = await prisma.master_sheet_test.findFirst({
        where: { qcode, system_tag: navTag, nav: { not: null } },
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
        console.log(`Prop Return (ABS): final=${finalNav}, initial=${initialNav}, days=${days}, return=${portfolioReturn}`);
      } else {
        portfolioReturn = (Math.pow(finalNav / initialNav, 365 / days) - 1) * 100;
        console.log(`Prop Return (CAGR): final=${finalNav}, initial=${initialNav}, days=${days}, return=${portfolioReturn}`);
      }

      return portfolioReturn;
    } catch (error) {
      console.error(`Error calculating portfolio returns for qcode ${qcode}:`, error);
      return 0;
    }
  }

  async getTotalProfit(qcode: string, strategy?: string, tag?: string): Promise<number> {
    const { navTag } = this.parseTags(tag);
    
    const profitSum = await prisma.master_sheet_test.aggregate({
      where: { qcode, system_tag: navTag },
      _sum: { pnl: true },
    });
    
    return Number(profitSum._sum.pnl) || 0;
  }

  async getHistoricalData(qcode: string, strategy?: string, tag?: string): Promise<{ date: Date; nav: number; drawdown: number; pnl: number; capitalInOut: number }[]> {
    const { navTag } = this.parseTags(tag);
    
    const data = await prisma.master_sheet_test.findMany({
      where: { qcode, system_tag: navTag, nav: { not: null }, drawdown: { not: null } },
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

  async getCashFlows(qcode: string, tag?: string): Promise<{ date: Date; amount: number }[]> {
    const { depositTag, cashflowTag } = this.parseTags(tag);
    
    // Use cashflow tag if provided, otherwise fall back to deposit tag
    const tagToUse = cashflowTag || depositTag;
    
    const rows = await prisma.master_sheet.findMany({
      where: {
        qcode,
        system_tag: tagToUse,
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


  async getFirstNav(qcode: string, strategy?: string, tag?: string): Promise<{ nav: number; date: Date } | null> {
    const { navTag } = this.parseTags(tag);
    
    const record = await prisma.master_sheet_test.findFirst({
      where: { qcode, system_tag: navTag, nav: { not: null } },
      orderBy: { date: "asc" },
      select: { nav: true, date: true },
    });
    
    if (!record) return null;
    return { nav: Number(record.nav), date: record.date };
  }

  async getNavAtDate(qcode: string, targetDate: Date, direction: 'before' | 'after' | 'closest', strategy?: string, tag?: string): Promise<{ nav: number; date: Date } | null> {
    const { navTag } = this.parseTags(tag);
    
    let whereClause: any = { qcode, system_tag: navTag, nav: { not: null } };
    let orderBy: any = { date: "desc" };

    if (direction === 'before') {
      whereClause.date = { lte: targetDate };
      orderBy = { date: "desc" };
    } else if (direction === 'after') {
      whereClause.date = { gte: targetDate };
      orderBy = { date: "asc" };
    }

    const result = await prisma.master_sheet_test.findFirst({ 
      where: whereClause, 
      orderBy, 
      select: { nav: true, date: true } 
    });
    
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

  async getHoldings(qcode: string): Promise<Holding[]> {
    // Get latest date for equity holdings
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

    if (!latestEquityDate?.date) {
      return [];
    }

    // Fetch equity holdings using raw SQL for better performance
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
        AND date = ${latestEquityDate.date}
        AND quantity > 0
      ORDER BY symbol ASC, exchange ASC, date DESC
    `;

    // Fetch mutual fund holdings if available
    const mutualFundHoldings = latestMFDate?.as_of_date
      ? await prisma.mutual_fund_holding_sheet_test.findMany({
          where: {
            qcode,
            as_of_date: latestMFDate.as_of_date,
            quantity: { gt: 0 },
            isin: { not: null, notIn: ['', ' '] }
          },
          orderBy: { symbol: 'asc' }
        })
      : [];

    // Aggregate mutual funds by ISIN
    const isinMap = new Map<string, any>();
    mutualFundHoldings.forEach(holding => {
      const isin = holding.isin || '';
      if (!isin) return;

      if (!isinMap.has(isin)) {
        isinMap.set(isin, {
          symbol: holding.symbol,
          isin: holding.isin,
          quantity: 0,
          buy_value: 0,
          value_as_of_today: 0,
          pnl_amount: 0,
          nav: holding.nav,
          broker: holding.broker,
          debt_equity: holding.debt_equity,
          sub_category: holding.sub_category,
          as_of_date: holding.as_of_date,
        });
      }

      const existing = isinMap.get(isin);
      existing.quantity += Number(holding.quantity) || 0;
      existing.buy_value += Number(holding.buy_value) || 0;
      existing.value_as_of_today += Number(holding.value_as_of_today) || 0;
      existing.pnl_amount += Number(holding.pnl_amount) || 0;
    });

    // Convert equity holdings to Holding format
    const equityHoldingsList = holdings.map(holding => ({
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

    // Convert mutual fund holdings to Holding format
    const mfHoldingsList = Array.from(isinMap.values()).map(mf => ({
      symbol: mf.symbol || '',
      exchange: 'MUTUAL_FUND',
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

    return [...equityHoldingsList, ...mfHoldingsList];
  }

  getStrategyName(strategy?: string): string {
    return strategy || "Prop Account Strategy";
  }
}

// Helper functions similar to portfolio-utils
function getMonthName(month: number): string {
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return monthNames[month];
}

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

  const candidates = sorted.filter(e => e.date.getTime() <= target.getTime());
  if (candidates.length === 0) {
    return null;
  }

  const pick = candidates[candidates.length - 1];
  return { date: pick.date.toISOString().slice(0, 10), value: pick.value };
}

function calculateHoldingsSummary(holdings: Holding[]): HoldingsSummary {
  const equityHoldings = holdings.filter(h => h.debtEquity.toLowerCase() === 'equity');
  const debtHoldings = holdings.filter(h => h.debtEquity.toLowerCase() === 'debt');
  const mutualFundHoldings = holdings.filter(h => h.exchange === 'MUTUAL_FUND');

  const totalBuyValue = holdings.reduce((sum, h) => sum + h.buyValue, 0);
  const totalCurrentValue = holdings.reduce((sum, h) => sum + h.valueAsOfToday, 0);
  const totalPnl = holdings.reduce((sum, h) => sum + h.pnlAmount, 0);
  const totalPnlPercent = totalBuyValue > 0 ? (totalPnl / totalBuyValue) * 100 : 0;

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
    mutualFundHoldings,
    categoryBreakdown,
    brokerBreakdown
  };
}

// Main calculation function for prop accounts
export async function calculatePropPortfolioMetrics(
  qcodes: { qcode: string; strategy?: string }[], 
  tags: string
): Promise<PropStats | null> {
  try {
    if (!qcodes.length) {
      console.log("No qcodes provided for prop portfolio metrics calculation");
      return null;
    }

    const strategy = new PropAccountStrategy();
    
    let amountDeposited = 0;
    let currentExposure = 0;
    let totalReturn = 0;
    let totalProfit = 0;
    let maxDrawdown = 0;
    let allCashFlows: { date: string; amount: number }[] = [];

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

    const strategyNames: string[] = [];

    for (const { qcode, strategy: strategyName } of qcodes) {
      console.log(`Processing prop qcode: ${qcode}, strategy: ${strategyName || 'none'}`);

      if (!strategyNames.includes(strategyName || "Prop Account Strategy")) {
        strategyNames.push(strategyName || "Prop Account Strategy");
      }

      // 1. Amount Deposited
      const accountDeposited = await strategy.getAmountDeposited(qcode, tags);
      amountDeposited += accountDeposited;

      // 2. Current Exposure and Drawdown
      const latestExposure = await strategy.getLatestExposure(qcode, tags);
      if (latestExposure) {
        currentExposure += latestExposure.portfolioValue;
      }

      // 3. Portfolio Returns
      totalReturn = await strategy.getPortfolioReturns(qcode, strategyName, tags);

      // 4. Total Profit
      totalProfit += await strategy.getTotalProfit(qcode, strategyName, tags);

      // 5. Cash Flows
      const flows = await strategy.getCashFlows(qcode, tags);
      flows.forEach(f =>
        allCashFlows.push({
          date: f.date.toISOString().split("T")[0],
          amount: Number(f.amount),
        })
      );

      // 6. Historical Data for NAV and Drawdown Curves
      const historicalData = await strategy.getHistoricalData(qcode, strategyName, tags);
      historicalData.sort((a, b) => a.date.getTime() - b.date.getTime());

      if (historicalData.length === 0) {
        console.log(`No historical data for qcode ${qcode}, skipping`);
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
      maxDrawdown = Math.max(maxDrawdown, maxDrawdownForAccount);

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
      });
    }

    let equityCurve = Array.from(navCurveMap.entries())
      .map(([date, { totalNav, count }]) => ({
        date,
        value: count > 0 ? totalNav / count : totalNav,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (equityCurve.length > 0 && equityCurve[0].value !== 100) {
      const firstDate = new Date(equityCurve[0].date);
      const prevDate = new Date(firstDate);
      prevDate.setUTCDate(firstDate.getUTCDate() - 1);
      const prevDateStr = prevDate.toISOString().split("T")[0];
      equityCurve.unshift({ date: prevDateStr, value: 100 });
    }

    const drawdownCurve = Array.from(drawdownCurveMap.entries())
      .map(([date, { total, count }]) => ({
        date,
        value: count > 0 ? (total / count) : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Calculate monthly PnL
    const initialAnchorNav = equityCurve.length ? equityCurve[0].value : 0;
    const initialAnchorYM = equityCurve.length ? equityCurve[0].date.slice(0, 7) : "";

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

      monthlyPnl[yearMonth].startNav = startEntry ? startEntry.value : 0;
      monthlyPnl[yearMonth].endNav = endEntry ? endEntry.value : 0;
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
      }, {} as PropStats["monthlyPnl"]);

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
    });

    const formattedQuarterlyPnl = Object.keys(formattedMonthlyPnl).reduce((acc, year) => {
      acc[year] = {
        percent: { q1: "-", q2: "-", q3: "-", q4: "-", total: "-" },
        cash: { q1: "0.00", q2: "0.00", q3: "0.00", q4: "0.00", total: "0.00" },
        yearCash: "0.00",
      };

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
    }, {} as PropStats["quarterlyPnl"]);

    // Calculate trailing returns
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

    const periodLabels = ["fiveDays", "tenDays", "fifteenDays", "oneMonth", "threeMonths", "sixMonths", "oneYear", "twoYears", "fiveYears", "sinceInception", "MDD", "currentDD"];

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

        if (period === "sinceInception") {
          const firstNavEntry = equityCurve[0];
          if (firstNavEntry) {
            endNav = firstNavEntry.value;
            endDate = new Date(firstNavEntry.date);
          }
        } else {
          const days = periodDays[period];
          const targetEntry = getNavEntriesAgo(equityCurve, days);
          if (targetEntry) {
            endNav = targetEntry.value;
            endDate = new Date(targetEntry.date);
          }
        }

        if (endNav > 0 && endDate) {
          const days = (startDate.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24);

          let periodReturn: number;
          if (period === "sinceInception" && days > 365) {
            periodReturn = (Math.pow(startNav / endNav, 365 / days) - 1) * 100;
          } else {
            periodReturn = ((startNav / endNav) - 1) * 100;
          }

          finalTrailingReturns[period] = periodReturn;
        } else {
          finalTrailingReturns[period] = null;
        }
      }
    });

    // Fetch holdings
    let allHoldings: Holding[] = [];
    for (const { qcode } of qcodes) {
      try {
        const holdings = await strategy.getHoldings(qcode);
        allHoldings.push(...holdings);
      } catch (error) {
        console.error(`Error fetching holdings for qcode ${qcode}:`, error);
      }
    }

    const holdingsSummary = calculateHoldingsSummary(allHoldings);

    const formatTrailingReturn = (value: number | null): string => {
      if (value === null || value === undefined) {
        return "-";
      }
      return value.toFixed(2);
    };

    const finalStrategyName = strategyNames.length === 1 
      ? strategyNames[0] 
      : strategyNames.length > 1 
        ? strategyNames.join(" + ") 
        : "Prop Account Strategy";

    const stats: PropStats = {
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
    console.error("Error calculating prop portfolio metrics:", error);
    return null;
  }
}