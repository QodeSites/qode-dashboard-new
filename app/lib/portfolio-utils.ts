import { prisma } from "@/lib/prisma";
import { Stats } from "@/app/accounts/page";

// Helper function to fetch qcodes for a user
export async function getUserQcodes(icode: string): Promise<string[]> {
  try {
    const allocations = await prisma.pooled_account_allocations.findMany({
      where: {
        icode,
        accounts: {
          account_type: { not: "pms" }, // Exclude PMS accounts
        },
      },
      select: { qcode: true },
      distinct: ["qcode"],
    });

    const qcodes = allocations.map(alloc => alloc.qcode).filter((qcode): qcode is string => !!qcode);
    console.log(`getUserQcodes: icode=${icode}, result=${JSON.stringify(qcodes)}`);
    return qcodes;
  } catch (error) {
    console.error("Error fetching qcodes:", error);
    return [];
  }
}

// Helper function to get quarter from month
const getQuarter = (month: number) => {
  if (month < 3) return "q1";
  if (month < 6) return "q2";
  if (month < 9) return "q3";
  return "q4";
};

// Helper function to get month name
const getMonthName = (month: number) => {
  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  return monthNames[month];
};

// Helper function to find closest data point to a date
async function findClosestDataPoint(
  qcode: string,
  targetDate: Date,
  isJainamManaged: boolean,
  direction: 'before' | 'after' | 'closest' = 'closest'
): Promise<{ nav: number; date: Date } | null> {
  try {
    let whereClause: any = {
      qcode,
      ...(isJainamManaged ? { system_tag: "Jainam Total Portfolio Exposure" } : { system_tag: "Total Portfolio Value" }),
      nav: { not: null },
    };

    let orderBy: any = { date: "desc" };

    if (direction === 'before') {
      whereClause.date = { lte: targetDate };
      orderBy = { date: "desc" };
    } else if (direction === 'after') {
      whereClause.date = { gte: targetDate };
      orderBy = { date: "asc" };
    }

    const result = await prisma.master_sheet.findFirst({
      where: whereClause,
      orderBy,
      select: { nav: true, date: true },
    });

    if (result) {
      return {
        nav: Number(result.nav),
        date: result.date
      };
    }

    // If direction is 'closest' and we didn't find exact match, try both directions
    if (direction === 'closest') {
      const beforeResult = await findClosestDataPoint(qcode, targetDate, isJainamManaged, 'before');
      const afterResult = await findClosestDataPoint(qcode, targetDate, isJainamManaged, 'after');

      if (!beforeResult && !afterResult) return null;
      if (!beforeResult) return afterResult;
      if (!afterResult) return beforeResult;

      // Return the closer one
      const beforeDiff = Math.abs(targetDate.getTime() - beforeResult.date.getTime());
      const afterDiff = Math.abs(targetDate.getTime() - afterResult.date.getTime());

      return beforeDiff <= afterDiff ? beforeResult : afterResult;
    }

    return null;
  } catch (error) {
    console.error(`Error finding closest data point for qcode ${qcode}:`, error);
    return null;
  }
}

// Calculate portfolio metrics
export async function calculatePortfolioMetrics(qcodes: string[]): Promise<any> {
  try {
    if (!qcodes.length) {
      console.log("No qcodes provided for portfolio metrics calculation");
      return null;
    }

    // Initialize metrics
    let amountDeposited = 0;
    let currentExposure = 0;
    let totalProfit = 0;
    let maxDrawdown = 0;

    // For weighted returns calculation
    const portfolioValues: { [qcode: string]: number } = {};
    const accountReturns: { [period: string]: { [qcode: string]: number } } = {};

    const navCurveMap = new Map<string, { totalNav: number; count: number }>();
    const drawdownCurveMap = new Map<string, { total: number; count: number }>();
    const quarterlyPnl: {
      [year: string]: {
        percent: { q1: number; q2: number; q3: number; q4: number; total: number };
        cash: { q1: number; q2: number; q3: number; q4: number; total: number };
        yearCash: number;
      };
    } = {};
    const monthlyPnl: {
      [yearMonth: string]: {
        percent: number;
        cash: number;
        capitalInOut: number;
      };
    } = {};
    const cashInOut: {
      transactions: { date: string; amount: number }[];
      total: number;
    } = { transactions: [], total: 0 };

    // Initialize account returns structure
    const periodLabels = ["tenDays", "oneMonth", "threeMonths", "sixMonths", "oneYear", "twoYears", "fiveYears", "sinceInception"];
    periodLabels.forEach(label => {
      accountReturns[label] = {};
    });

    // Calculate metrics for each qcode
    for (const qcode of qcodes) {
      console.log(`Processing qcode: ${qcode}`);

      // Check if account is managed account with Jainam broker
      const account = await prisma.accounts.findFirst({
        where: { qcode },
        select: { account_type: true, broker: true },
      });

      const isJainamManaged = account?.account_type === 'managed_account' && account?.broker === 'jainam';
      console.log(`Qcode ${qcode} - isJainamManaged: ${isJainamManaged}`);

      // Get data range for debugging
      const dataRange = await prisma.master_sheet.aggregate({
        where: {
          qcode,
          ...(isJainamManaged ? { system_tag: "Jainam Total Portfolio Exposure" } : { system_tag: "Total Portfolio Value" }),
          nav: { not: null },
        },
        _min: { date: true },
        _max: { date: true },
        _count: { date: true },
      });

      console.log(`Qcode ${qcode} data range:`, {
        minDate: dataRange._min.date,
        maxDate: dataRange._max.date,
        recordCount: dataRange._count.date
      });

      // 1. Amount Deposited
      const depositRecords = await prisma.master_sheet.findFirst({
        where: {
          qcode,
          ...(isJainamManaged ? { system_tag: "Jainam Total Portfolio Deposit" } : {}),
        },
        orderBy: { date: "desc" },
        select: { portfolio_value: true },
      });
      const accountDeposited = Number(depositRecords?.portfolio_value) || 0;
      amountDeposited += accountDeposited;

      // 2. Current Exposure and Drawdown
      const latestExposureRecord = await prisma.master_sheet.findFirst({
        where: {
          qcode,
          ...(isJainamManaged ? { system_tag: "Jainam Total Portfolio Exposure" } : { system_tag: "Total Portfolio Value" }),
        },
        orderBy: { date: "desc" },
        select: {
          date: true,
          portfolio_value: true,
          drawdown: true,
          nav: true,
        },
      });

      if (latestExposureRecord) {
        const accountExposure = Number(latestExposureRecord.portfolio_value) || 0;
        currentExposure += accountExposure;
        portfolioValues[qcode] = accountExposure; // Store for weighted returns

        const accountDrawdown = Math.abs(Number(latestExposureRecord.drawdown) || 0);
        maxDrawdown = Math.max(maxDrawdown, accountDrawdown);
      }

      // 3. Total Profit
      const profitSum = await prisma.master_sheet.aggregate({
        where: {
          qcode,
          ...(isJainamManaged ? { system_tag: "Jainam Total Portfolio Exposure" } : { system_tag: "Total Portfolio Value" }),
        },
        _sum: { pnl: true },
      });
      totalProfit += Number(profitSum._sum.pnl) || 0;

      // 4. Get latest NAV for calculations
      // right after you’ve done:
      const latestNavData = latestExposureRecord?.nav
        ? { nav: Number(latestExposureRecord.nav), date: latestExposureRecord.date }
        : null;
      if (!latestNavData) continue;

      // use the last data-point date as your “now”
      const asOfDate = latestNavData.date;

      // then define your look-back periods relative to that
      const MS_PER_DAY = 24 * 60 * 60 * 1000;
      const periods = [
        { date: new Date(asOfDate.getTime() - 10 * MS_PER_DAY), label: "tenDays" },
        { date: new Date(asOfDate.getTime() - 30 * MS_PER_DAY), label: "oneMonth" },
        { date: new Date(asOfDate.getTime() - 90 * MS_PER_DAY), label: "threeMonths" },
        { date: new Date(asOfDate.getTime() - 180 * MS_PER_DAY), label: "sixMonths" },
        { date: new Date(asOfDate.getTime() - 365 * MS_PER_DAY), label: "oneYear" },
        { date: new Date(asOfDate.getTime() - 2 * 365 * MS_PER_DAY), label: "twoYears" },
        { date: new Date(asOfDate.getTime() - 5 * 365 * MS_PER_DAY), label: "fiveYears" },
      ];

      // Since inception calculation
      const firstExposureRecord = await prisma.master_sheet.findFirst({
        where: {
          qcode,
          ...(isJainamManaged ? { system_tag: "Jainam Total Portfolio Exposure" } : { system_tag: "Total Portfolio Value" }),
          nav: { not: null },
        },
        orderBy: { date: "asc" },
        select: { nav: true, date: true },
      });

      if (firstExposureRecord?.nav) {
        const startNav = Number(firstExposureRecord.nav);
        const endNav = latestNavData.nav;
        const sinceInceptionReturn = startNav > 0 ? ((endNav - startNav) / startNav) * 100 : 0;
        accountReturns.sinceInception[qcode] = sinceInceptionReturn;

        console.log(`Qcode ${qcode} - Since Inception: ${startNav} -> ${endNav} = ${sinceInceptionReturn.toFixed(2)}% (start: ${firstExposureRecord.date.toISOString().split('T')[0]}, end: ${latestNavData.date.toISOString().split('T')[0]})`);
      }

      // Calculate returns for each period
      for (const period of periods) {
        const periodStartData = await findClosestDataPoint(
          qcode,
          period.date,
          isJainamManaged,
          'before'
        );
        if (periodStartData) {
          const startNav = periodStartData.nav;
          const endNav = latestNavData.nav;
          accountReturns[period.label][qcode] =
            startNav > 0 ? ((endNav - startNav) / startNav) * 100 : 0;

          console.log(
            `Qcode ${qcode} - ${period.label}: ` +
            `${startNav.toFixed(4)} -> ${endNav.toFixed(4)} = ` +
            `${accountReturns[period.label][qcode].toFixed(2)}% ` +
            `(start: ${periodStartData.date.toISOString().split('T')[0]}, ` +
            `end: ${asOfDate.toISOString().split('T')[0]})`
          );
        }
      }
      // 6. Maximum Drawdown
      const historicalDrawdowns = await prisma.master_sheet.findMany({
        where: {
          qcode,
          ...(isJainamManaged ? { system_tag: "Jainam Total Portfolio Exposure" } : { system_tag: "Total Portfolio Value" }),
          drawdown: { not: null },
        },
        select: { drawdown: true },
      });

      const accountMaxDrawdown = Math.max(
        ...historicalDrawdowns.map((record) => Math.abs(Number(record.drawdown) || 0)),
        0
      );
      maxDrawdown = Math.max(maxDrawdown, accountMaxDrawdown);

      // 7. NAV and Drawdown Curves
      const historicalData = await prisma.master_sheet.findMany({
        where: {
          qcode,
          ...(isJainamManaged ? { system_tag: "Jainam Total Portfolio Exposure" } : { system_tag: "Total Portfolio Value" }),
          nav: { not: null },
          drawdown: { not: null },
        },
        select: {
          date: true,
          nav: true,
          drawdown: true,
        },
        orderBy: { date: "asc" },
      });

      for (const entry of historicalData) {
        const dateKey = entry.date.toISOString().split("T")[0];
        const navValue = Number(entry.nav) || 0;
        const ddValue = Math.abs(Number(entry.drawdown) || 0);

        if (!navCurveMap.has(dateKey)) {
          navCurveMap.set(dateKey, { totalNav: 0, count: 0 });
        }
        const existing = navCurveMap.get(dateKey)!;
        existing.totalNav += navValue;
        existing.count += 1;

        if (!drawdownCurveMap.has(dateKey)) {
          drawdownCurveMap.set(dateKey, { total: 0, count: 0 });
        }
        const ddBucket = drawdownCurveMap.get(dateKey)!;
        ddBucket.total += ddValue;
        ddBucket.count += 1;
      }

      // 8. Monthly, Quarterly PnL, and Cash In/Out
      const monthlyQuarterlyData = await prisma.master_sheet.findMany({
        where: {
          qcode,
          ...(isJainamManaged ? { system_tag: "Jainam Total Portfolio Exposure" } : { system_tag: "Total Portfolio Value" }),
          nav: { not: null },
        },
        select: {
          date: true,
          nav: true,
          prev_nav: true,
          pnl: true,
          capital_in_out: true,
        },
        orderBy: { date: "asc" },
      });

      const cashInOutData = await prisma.master_sheet.findMany({
        where: {
          qcode,
          ...(isJainamManaged ? { system_tag: "Jainam Total Portfolio Deposit" } : { system_tag: "Total Portfolio Value" }),
          capital_in_out: { not: null, not: 0 },
        },
        select: {
          date: true,
          capital_in_out: true,
        },
        orderBy: { date: "asc" },
      });

      // Process cash in/out
      for (const entry of cashInOutData) {
        const date = entry.date.toISOString().split("T")[0];
        const capitalInOut = Number(entry.capital_in_out) || 0;
        cashInOut.transactions.push({ date, amount: capitalInOut });
        cashInOut.total += capitalInOut;
      }

      // Process monthly and quarterly data
      const dataByMonth: {
        [yearMonth: string]: {
          points: { date: Date; nav: number; pnl: number; capitalInOut: number }[];
          firstDate: Date;
          lastDate: Date;
          firstNav: number;
          lastNav: number;
          totalPnL: number;
          totalCapitalInOut: number;
        };
      } = {};

      const dataByQuarter: {
        [yearQuarter: string]: {
          points: { date: Date; nav: number; pnl: number }[];
          firstDate: Date;
          lastDate: Date;
          firstNav: number;
          lastNav: number;
          totalPnL: number;
          yearCash: number;
        };
      } = {};

      for (const entry of monthlyQuarterlyData) {
        const date = new Date(entry.date);
        const year = date.getUTCFullYear();
        const month = date.getUTCMonth();
        const quarter = getQuarter(month);
        const yearMonth = `${year}-${String(month + 1).padStart(2, '0')}`;
        const yearQuarter = `${year}-${quarter}`;

        // Monthly data
        if (!dataByMonth[yearMonth]) {
          dataByMonth[yearMonth] = {
            points: [],
            firstDate: date,
            lastDate: date,
            firstNav: Number(entry.nav) || 0,
            lastNav: Number(entry.nav) || 0,
            totalPnL: 0,
            totalCapitalInOut: 0,
          };
        }

        dataByMonth[yearMonth].points.push({
          date,
          nav: Number(entry.nav) || 0,
          pnl: Number(entry.pnl) || 0,
          capitalInOut: Number(entry.capital_in_out) || 0,
        });

        dataByMonth[yearMonth].totalPnL += Number(entry.pnl) || 0;
        dataByMonth[yearMonth].totalCapitalInOut += Number(entry.capital_in_out) || 0;

        if (date < dataByMonth[yearMonth].firstDate) {
          dataByMonth[yearMonth].firstDate = date;
          dataByMonth[yearMonth].firstNav = Number(entry.nav) || 0;
        }
        if (date > dataByMonth[yearMonth].lastDate) {
          dataByMonth[yearMonth].lastDate = date;
          dataByMonth[yearMonth].lastNav = Number(entry.nav) || 0;
        }

        // Quarterly data
        if (!dataByQuarter[yearQuarter]) {
          dataByQuarter[yearQuarter] = {
            points: [],
            firstDate: date,
            lastDate: date,
            firstNav: Number(entry.nav) || 0,
            lastNav: Number(entry.nav) || 0,
            totalPnL: 0,
            yearCash: 0,
          };
        }

        dataByQuarter[yearQuarter].points.push({
          date,
          nav: Number(entry.nav) || 0,
          pnl: Number(entry.pnl) || 0,
        });

        dataByQuarter[yearQuarter].totalPnL += Number(entry.pnl) || 0;
        dataByQuarter[yearQuarter].yearCash += Number(entry.capital_in_out) || 0;

        if (date < dataByQuarter[yearQuarter].firstDate) {
          dataByQuarter[yearQuarter].firstDate = date;
          dataByQuarter[yearQuarter].firstNav = Number(entry.nav) || 0;
        }
        if (date > dataByQuarter[yearQuarter].lastDate) {
          dataByQuarter[yearQuarter].lastDate = date;
          dataByQuarter[yearQuarter].lastNav = Number(entry.nav) || 0;
        }
      }

      // Process monthly PnL
      const sortedMonths = Object.keys(dataByMonth).sort();
      sortedMonths.forEach((yearMonth, index) => {
        const currentData = dataByMonth[yearMonth];

        let startNav;
        if (index === 0) {
          startNav = currentData.points[0]?.nav || currentData.firstNav;
        } else {
          const prevMonth = sortedMonths[index - 1];
          startNav = dataByMonth[prevMonth].lastNav;
        }

        const endNav = currentData.lastNav;
        const navPnLPercent = startNav > 0 ? ((endNav - startNav) / startNav) * 100 : 0;
        const cashPnL = currentData.totalPnL;
        const capitalInOut = currentData.totalCapitalInOut;

        if (!monthlyPnl[yearMonth]) {
          monthlyPnl[yearMonth] = {
            percent: 0,
            cash: 0,
            capitalInOut: 0,
          };
        }

        monthlyPnl[yearMonth].percent += navPnLPercent;
        monthlyPnl[yearMonth].cash += cashPnL;
        monthlyPnl[yearMonth].capitalInOut += capitalInOut;
      });

      // Process quarterly PnL
      const sortedQuarters = Object.keys(dataByQuarter).sort((a, b) => {
        const [aYear, aQuarter] = a.split('-');
        const [bYear, bQuarter] = b.split('-');
        const quarterOrder = { 'q1': 1, 'q2': 2, 'q3': 3, 'q4': 4 };
        const aDate = parseInt(aYear) * 10 + quarterOrder[aQuarter as keyof typeof quarterOrder];
        const bDate = parseInt(bYear) * 10 + quarterOrder[bQuarter as keyof typeof quarterOrder];
        return aDate - bDate;
      });

      sortedQuarters.forEach((yearQuarter, index) => {
        const [year, quarter] = yearQuarter.split('-');
        const currentData = dataByQuarter[yearQuarter];

        let startNav;
        if (index === 0) {
          startNav = currentData.points[0]?.nav || currentData.firstNav;
        } else {
          const prevQuarter = sortedQuarters[index - 1];
          startNav = dataByQuarter[prevQuarter].lastNav;
        }

        const endNav = currentData.lastNav;
        const navPnLPercent = startNav > 0 ? ((endNav - startNav) / startNav) * 100 : 0;
        const cashPnL = currentData.totalPnL;

        if (!quarterlyPnl[year]) {
          quarterlyPnl[year] = {
            percent: { q1: 0, q2: 0, q3: 0, q4: 0, total: 0 },
            cash: { q1: 0, q2: 0, q3: 0, q4: 0, total: 0 },
            yearCash: 0,
          };
        }

        quarterlyPnl[year].percent[quarter as keyof typeof quarterlyPnl[string]['percent']] += navPnLPercent;
        quarterlyPnl[year].cash[quarter as keyof typeof quarterlyPnl[string]['cash']] += cashPnL;
        quarterlyPnl[year].percent.total += navPnLPercent;
        quarterlyPnl[year].cash.total += cashPnL;
        quarterlyPnl[year].yearCash += currentData.yearCash;
      });
    }

    // Calculate weighted trailing returns
    const totalPortfolioValue = Object.values(portfolioValues).reduce((sum, value) => sum + value, 0);
    const finalTrailingReturns: { [key: string]: number } = {};

    periodLabels.forEach(period => {
      let weightedReturn = 0;
      let totalWeight = 0;

      Object.keys(accountReturns[period]).forEach(qcode => {
        const weight = portfolioValues[qcode] || 0;
        const returnValue = accountReturns[period][qcode] || 0;

        weightedReturn += (returnValue * weight);
        totalWeight += weight;
      });

      finalTrailingReturns[period] = totalWeight > 0 ? weightedReturn / totalWeight : 0;
      console.log(`${period} weighted return: ${finalTrailingReturns[period].toFixed(2)}% (total weight: ${totalWeight})`);
    });

    // Convert NAV and drawdown curves to sorted arrays
    const equityCurve = Array.from(navCurveMap.entries())
      .map(([date, { totalNav, count }]) => ({
        date,
        value: count > 0 ? totalNav / count : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const drawdownCurve = Array.from(drawdownCurveMap.entries())
      .map(([date, { total, count }]) => ({
        date,
        value: count > 0 ? total / count : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Format quarterly PnL
    const formattedQuarterlyPnl = Object.keys(quarterlyPnl).reduce((acc, year) => {
      acc[year] = {
        percent: {
          q1: qcodes.length > 0 ? (quarterlyPnl[year].percent.q1 / qcodes.length).toFixed(2) : "0.00",
          q2: qcodes.length > 0 ? (quarterlyPnl[year].percent.q2 / qcodes.length).toFixed(2) : "0.00",
          q3: qcodes.length > 0 ? (quarterlyPnl[year].percent.q3 / qcodes.length).toFixed(2) : "0.00",
          q4: qcodes.length > 0 ? (quarterlyPnl[year].percent.q4 / qcodes.length).toFixed(2) : "0.00",
          total: qcodes.length > 0 ? (quarterlyPnl[year].percent.total / qcodes.length).toFixed(2) : "0.00",
        },
        cash: {
          q1: quarterlyPnl[year].cash.q1.toFixed(2),
          q2: quarterlyPnl[year].cash.q2.toFixed(2),
          q3: quarterlyPnl[year].cash.q3.toFixed(2),
          q4: quarterlyPnl[year].cash.q4.toFixed(2),
          total: quarterlyPnl[year].cash.total.toFixed(2),
        },
        yearCash: quarterlyPnl[year].yearCash.toFixed(2),
      };
      return acc;
    }, {} as { [year: string]: { percent: { q1: string; q2: string; q3: string; q4: string; total: string }; cash: { q1: string; q2: string; q3: string; q4: string; total: string }; yearCash: string } });

    // Format monthly PnL
    const formattedMonthlyPnl = Object.keys(monthlyPnl)
  .sort()
  .reduce((acc, yearMonth) => {
    const [year, month] = yearMonth.split('-');
    const monthIndex = parseInt(month) - 1;
    const monthName = getMonthName(monthIndex);

    if (!acc[year]) {
      acc[year] = {
        months: {},
        totalPercent: 0,
        totalCash: 0,
        totalCapitalInOut: 0,
      };
    }

    const weightedPercent = qcodes.reduce((sum, qcode) => {
      const weight = portfolioValues[qcode] || 0;
      const returnValue = monthlyPnl[yearMonth].percent || 0;
      return sum + (returnValue * weight);
    }, 0) / totalPortfolioValue;

    const totalCash = monthlyPnl[yearMonth].cash;
    const totalCapitalInOut = monthlyPnl[yearMonth].capitalInOut;

    acc[year].months[monthName] = {
      percent: weightedPercent.toFixed(2),
      cash: totalCash.toFixed(2),
      capitalInOut: totalCapitalInOut.toFixed(2),
    };

    acc[year].totalPercent += weightedPercent;
    acc[year].totalCash += totalCash;
    acc[year].totalCapitalInOut += totalCapitalInOut;

    return acc;
  }, {} as {
    [year: string]: {
      months: { [month: string]: { percent: string; cash: string; capitalInOut: string } };
      totalPercent: number;
      totalCash: number;
      totalCapitalInOut: number;
    }
  });

    // Format cash in/out
    const formattedCashInOut = {
      transactions: cashInOut.transactions.map((tx) => ({
        date: tx.date,
        amount: tx.amount.toFixed(2),
      })),
      total: cashInOut.total,
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
      totalProfit: totalProfit.toFixed(2),
      trailingReturns: {
        tenDays: finalTrailingReturns.tenDays.toFixed(2),
        oneMonth: finalTrailingReturns.oneMonth.toFixed(2),
        threeMonths: finalTrailingReturns.threeMonths.toFixed(2),
        sixMonths: finalTrailingReturns.sixMonths.toFixed(2),
        oneYear: finalTrailingReturns.oneYear.toFixed(2),
        twoYears: finalTrailingReturns.twoYears.toFixed(2),
        fiveYears: finalTrailingReturns.fiveYears.toFixed(2),
        sinceInception: finalTrailingReturns.sinceInception.toFixed(2),
      },
      drawdown: maxDrawdown.toFixed(2),
      drawdownCurve,
      equityCurve,
      quarterlyPnl: formattedQuarterlyPnl,
      monthlyPnl: formattedMonthlyPnl,
      cashInOut: formattedCashInOut,
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
    return: metrics?.return || "0.00",
    totalProfit: metrics?.totalProfit || "0.00",
    trailingReturns: metrics?.trailingReturns || {
      tenDays: "0.00",
      oneMonth: "0.00",
      threeMonths: "0.00",
      sixMonths: "0.00",
      oneYear: "0.00",
      twoYears: "0.00",
      fiveYears: "0.00",
      sinceInception: "0.00",
    },
    drawdown: metrics?.drawdown || "0.00",
    equityCurve: metrics?.equityCurve || [],
    drawdownCurve: metrics?.drawdownCurve || [],
    quarterlyPnl: metrics?.quarterlyPnl || {},
    monthlyPnl: metrics?.monthlyPnl || {},
    cashInOut: metrics?.cashInOut || { transactions: [], total: 0 },
  };
}