import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays, subWeeks, subMonths, subYears } from 'date-fns';

// Constants
const monthsFull = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// Interface for PMS data (matches pms_master_sheet columns)
interface PmsData {
  id: string;
  clientName: string;
  accountCode: string;
  qcode: string | null;
  reportDate: string;
  portfolioValue: string | null;
  cashInOut: string | null;
  nav: string | null;
  prevNav: string | null;
  pnl: string | null;
  pnlPercent: string | null;
  exposureValue: string | null;
  prevPortfolioValue: string | null;
  prevExposureValue: string | null;
  prevPnl: string | null;
  drawdownPercent: string | null;
  systemTag: string | null;
  periodReturnPercent: string | null;
  cumulativeReturnPercent: string | null;
  createdAt: string;
}

// Interface for processed PMS stats (aligned with frontend expectations)
interface PmsStats {
  totalPortfolioValue: string;
  totalPnl: string;
  maxDrawdown: string;
  cumulativeReturn: string;
  equityCurve: { date: string; value: number }[];
  drawdownCurve: { date: string; value: number }[];
  quarterlyPnl: {
    [year: string]: {
      percent: { q1: string; q2: string; q3: string; q4: string; total: string };
      cash: { q1: string; q2: string; q3: string; q4: string; total: string };
      yearCash?: string;
    };
  };
  monthlyPnl: {
    [year: string]: {
      months: { [month: string]: { percent: string; cash: string; capitalInOut?: string } };
      totalPercent: number;
      totalCash: number;
      totalCapitalInOut?: number;
    };
  };
  trailingReturns: {
    fiveDays: string;
    tenDays: string;
    fifteenDays: string;
    oneMonth: string;
    threeMonths: string;
    sixMonths: string;
    oneYear: string;
    twoYears: string;
    fiveYears: string;
    sinceInception: string;
    MDD: string; // FIXED: Changed from maxDrawdown to MDD
    currentDD: string; // FIXED: Changed from currentDrawdown to currentDD
  };
  cashInOut: { transactions: { date: string; amount: string }[]; total: number };
}

// Helper function to truncate to 2 decimal places
function truncateTo2(num: number): number {
  return Math.trunc(num * 100) / 100;
}

// Calculate date range based on period
function calculateDateRange(period: string | null): { start_date: string; end_date: string } | null {
  const now = new Date();
  let startDate, endDate;

  switch (period) {
    case 'today':
      startDate = startOfDay(now);
      endDate = endOfDay(now);
      break;
    case 'yesterday':
      const yesterday = subDays(now, 1);
      startDate = startOfDay(yesterday);
      endDate = endOfDay(yesterday);
      break;
    case 'this_week':
      startDate = startOfWeek(now, { weekStartsOn: 1 });
      endDate = endOfWeek(now, { weekStartsOn: 1 });
      break;
    case 'this_month':
      startDate = startOfMonth(now);
      endDate = endOfMonth(now);
      break;
    case 'this_year':
      startDate = startOfYear(now);
      endDate = endOfYear(now);
      break;
    case 'last_week':
      startDate = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      endDate = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      break;
    default:
      return null;
  }

  return {
    start_date: startDate.toISOString().split('T')[0],
    end_date: endDate.toISOString().split('T')[0]
  };
}

// Calculate monthly PNL based on both NAV and actual PnL data
function calculateMonthlyPnL(dailyData: PmsData[]): { 
  year: number; 
  month: string; 
  pnlPercent: number; 
  pnlCash: number;
  capitalInOut: number;
}[] {
  if (!dailyData || !Array.isArray(dailyData) || dailyData.length === 0) {
    return [];
  }

  // Sort data by date
  const sortedData = [...dailyData].sort((a, b) => new Date(a.reportDate).getTime() - new Date(b.reportDate).getTime());
  
  const dataByMonth = sortedData.reduce((acc, data) => {
    const date = new Date(data.reportDate);
    const month = date.getMonth();
    const year = date.getFullYear();
    const key = `${year}-${month}`;

    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(data);
    return acc;
  }, {} as { [key: string]: PmsData[] });

  const monthlyPnL = Object.keys(dataByMonth).map(key => {
    const [year, monthIndex] = key.split("-").map(Number);
    const records = dataByMonth[key].sort((a, b) => new Date(a.reportDate).getTime() - new Date(b.reportDate).getTime());
    
    // Calculate monthly PnL percentage using NAV
    const firstRecord = records[0];
    const lastRecord = records[records.length - 1];
    const firstNAV = parseFloat(firstRecord.nav || "0") || 0;
    const lastNAV = parseFloat(lastRecord.nav || "0") || 0;
    const pnlPercent = firstNAV !== 0 ? ((lastNAV - firstNAV) / firstNAV) * 100 : 0;
    
    // Calculate monthly PnL in cash terms (sum of daily PnL)
    const pnlCash = records.reduce((sum, record) => {
      return sum + (parseFloat(record.pnl || "0") || 0);
    }, 0);
    
    // Calculate capital in/out for the month
    const capitalInOut = records.reduce((sum, record) => {
      return sum + (parseFloat(record.cashInOut || "0") || 0);
    }, 0);

    return {
      year,
      month: monthsFull[monthIndex],
      pnlPercent: truncateTo2(pnlPercent),
      pnlCash: truncateTo2(pnlCash),
      capitalInOut: truncateTo2(capitalInOut),
    };
  });

  monthlyPnL.sort((a, b) => {
    if (a.year !== b.year) {
      return a.year - b.year;
    }
    return monthsFull.indexOf(a.month) - monthsFull.indexOf(b.month);
  });

  return monthlyPnL;
}

// Calculate trailing returns and drawdowns based on NAV
function calculateTrailingReturns(dailyData: PmsData[]): { [key: string]: string } {
  if (!dailyData || !Array.isArray(dailyData) || dailyData.length === 0) {
    return {
      fiveDays: "-",
      tenDays: "-",
      fifteenDays: "-",
      oneMonth: "-",
      threeMonths: "-",
      sixMonths: "-",
      oneYear: "-",
      twoYears: "-",
      fiveYears: "-",
      sinceInception: "-",
      MDD: "-", // FIXED: Changed from maxDrawdown to MDD
      currentDD: "-" // FIXED: Changed from currentDrawdown to currentDD
    };
  }

  // Sort data by date
  const sortedData = [...dailyData].sort((a, b) => new Date(a.reportDate).getTime() - new Date(b.reportDate).getTime());

  const currentRecord = sortedData[sortedData.length - 1];
  const currentDate = new Date(currentRecord.reportDate);
  const currentNAV = parseFloat(currentRecord.nav || "0") || 0;

  if (currentNAV <= 0) {
    console.warn("Invalid current NAV:", currentNAV);
    return {
      fiveDays: "-",
      tenDays: "-",
      fifteenDays: "-",
      oneMonth: "-",
      threeMonths: "-",
      sixMonths: "-",
      oneYear: "-",
      twoYears: "-",
      fiveYears: "-",
      sinceInception: "-",
      MDD: "-", // FIXED: Changed from maxDrawdown to MDD
      currentDD: "-" // FIXED: Changed from currentDrawdown to currentDD
    };
  }

  const periods = [
    { key: "fiveDays", days: 5 },
    { key: "tenDays", days: 10 },
    { key: "fifteenDays", days: 15 },
    { key: "oneMonth", days: 30 },
    { key: "threeMonths", days: 90 },
    { key: "sixMonths", days: 180 },
    { key: "oneYear", days: 365 },
    { key: "twoYears", days: 730 },
    { key: "fiveYears", days: 1825 }
  ];

  const results: { [key: string]: string } = {};

  // Calculate trailing returns for each period
  periods.forEach(({ key, days }) => {
    const targetDate = new Date(currentDate);
    targetDate.setDate(targetDate.getDate() - days);

    const baseRecord = findNAVRecordOnOrBefore(sortedData, targetDate);
    const baseNAV = baseRecord ? parseFloat(baseRecord.nav || "0") || 0 : null;

    if (baseNAV && baseNAV > 0 && baseNAV !== currentNAV) {
      const trailingReturn = ((currentNAV - baseNAV) / baseNAV) * 100;
      if (Math.abs(trailingReturn) > 10000) {
        console.warn(`Unrealistic return calculated for ${key}:`, {
          period: key, currentNAV, baseNAV, trailingReturn,
          baseDate: baseRecord ? baseRecord.reportDate : 'N/A',
          currentDate: currentRecord.reportDate
        });
        results[key] = "-";
      } else {
        results[key] = truncateTo2(trailingReturn).toFixed(2);
      }
    } else {
      results[key] = "-";
    }
  });

  // Calculate since inception return
  const firstValidRecord = sortedData.find(record => {
    const nav = parseFloat(record.nav || "0") || 0;
    return nav > 0;
  });
  
  if (firstValidRecord && firstValidRecord !== currentRecord) {
    const firstNAV = parseFloat(firstValidRecord.nav || "0") || 0;
    if (firstNAV > 0) {
      const sinceInceptionReturn = ((currentNAV - firstNAV) / firstNAV) * 100;
      results["sinceInception"] = truncateTo2(sinceInceptionReturn).toFixed(2);
    } else {
      results["sinceInception"] = "-";
    }
  } else {
    results["sinceInception"] = "-";
  }

  // Calculate Maximum Drawdown (MDD)
  let peak = -Infinity;
  let maxDrawdown = 0;

  sortedData.forEach(record => {
    const nav = parseFloat(record.nav || "0") || 0;
    if (nav > 0) {
      if (nav > peak) {
        peak = nav;
      }
      const drawdown = (nav - peak) / peak;
      if (drawdown < maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
  });

  // FIXED: Use negative value for drawdown display
  results.MDD = truncateTo2(-Math.abs(maxDrawdown * 100)).toFixed(2);

  // Calculate current drawdown
  const validNAVs = sortedData
    .map(record => parseFloat(record.nav || "0") || 0)
    .filter(nav => nav > 0);

  if (validNAVs.length > 0) {
    const historicalPeak = Math.max(...validNAVs);
    const currentDrawdown = (currentNAV - historicalPeak) / historicalPeak;
    // FIXED: Use negative value for drawdown display
    results["currentDD"] = truncateTo2(-Math.abs(currentDrawdown * 100)).toFixed(2);
  } else {
    results["currentDD"] = "0.00";
  }

  return results;
}

// Find NAV record on or before a date
function findNAVRecordOnOrBefore(dailyData: PmsData[], targetDate: Date): PmsData | null {
  const sortedData = [...dailyData].sort((a, b) => new Date(b.reportDate).getTime() - new Date(a.reportDate).getTime());

  for (let record of sortedData) {
    const recordDate = new Date(record.reportDate);
    const nav = parseFloat(record.nav || "0") || 0;
    if (recordDate <= targetDate && nav > 0) {
      return record;
    }
  }

  return null;
}

// Format daily data
function formatDailyData(record: any): PmsData {
  return {
    id: record.id || "",
    clientName: record.client_name || "",
    accountCode: record.account_code || "",
    qcode: record.qcode || null,
    reportDate: record.report_date ? new Date(record.report_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    portfolioValue: parseFloat(record.portfolio_value)?.toFixed(2) || null,
    cashInOut: parseFloat(record.cash_in_out)?.toFixed(2) || null,
    nav: parseFloat(record.nav)?.toFixed(4) || null,
    prevNav: parseFloat(record.prev_nav)?.toFixed(4) || null,
    pnl: parseFloat(record.pnl)?.toFixed(2) || null,
    pnlPercent: parseFloat(record.pnl_percent)?.toFixed(2) || null,
    exposureValue: parseFloat(record.exposure_value)?.toFixed(2) || null,
    prevPortfolioValue: parseFloat(record.prev_portfolio_value)?.toFixed(2) || null,
    prevExposureValue: parseFloat(record.prev_exposure_value)?.toFixed(2) || null,
    prevPnl: parseFloat(record.prev_pnl)?.toFixed(2) || null,
    drawdownPercent: parseFloat(record.drawdown_percent)?.toFixed(2) || null,
    systemTag: record.system_tag || null,
    periodReturnPercent: parseFloat(record.period_return_percent)?.toFixed(4) || null,
    cumulativeReturnPercent: parseFloat(record.cumulative_return_percent)?.toFixed(4) || null,
    createdAt: record.created_at ? new Date(record.created_at).toISOString() : new Date().toISOString()
  };
}

// Fetch custodian codes for a user
async function fetchCustodianCodes(icode: string, qcode?: string): Promise<string[]> {
  try {
    const accounts = await prisma.accounts.findMany({
      where: {
        ...(qcode && { qcode }),
        account_type: "pms",
        OR: [
          { pooled_account_users: { some: { icode } } },
          { pooled_account_allocations: { some: { icode } } },
        ],
      },
      include: {
        account_custodian_codes: {
          select: {
            custodian_code: true,
          },
        },
      },
    });

    const custodianCodes = [
      ...new Set(
        accounts.flatMap(acc => acc.account_custodian_codes.map(cc => cc.custodian_code))
      ),
    ].filter((code): code is string => !!code);

    console.log(`fetchCustodianCodes: icode=${icode}, qcode=${qcode || 'none'}, result=${JSON.stringify(custodianCodes)}`);

    return custodianCodes;
  } catch (error) {
    console.error("Error fetching custodian codes:", error);
    return [];
  }
}

// Main function to fetch and process PMS data
export async function getPmsData(
  icode: string,
  qcode?: string,
  viewType: string = "individual",
  period?: string | null,
  dataAsOf?: string | null,
  startDate?: string | null,
  endDate?: string | null
): Promise<PmsStats> {
  try {
    // Fetch custodian codes
    const custodianCodes = await fetchCustodianCodes(icode, qcode);
    if (!custodianCodes.length) {
      console.log(`No custodian codes found for icode=${icode}, qcode=${qcode || 'none'}`);
      return {
        totalPortfolioValue: "0.00",
        totalPnl: "0.00",
        maxDrawdown: "0.00",
        cumulativeReturn: "0.00",
        equityCurve: [],
        drawdownCurve: [],
        quarterlyPnl: {},
        monthlyPnl: {},
        trailingReturns: {
          fiveDays: "-",
          tenDays: "-",
          fifteenDays: "-",
          oneMonth: "-",
          threeMonths: "-",
          sixMonths: "-",
          oneYear: "-",
          twoYears: "-",
          fiveYears: "-",
          sinceInception: "-",
          MDD: "-", // FIXED: Changed from maxDrawdown to MDD
          currentDD: "-" // FIXED: Changed from currentDrawdown to currentDD
        },
        cashInOut: { transactions: [], total: 0 }
      };
    }

    // Apply date range filtering
    let dateFilter = {};
    if (period) {
      const dateRange = calculateDateRange(period);
      if (dateRange) {
        dateFilter = {
          report_date: {
            gte: new Date(dateRange.start_date),
            lte: new Date(dateRange.end_date)
          }
        };
      }
    } else if (dataAsOf) {
      dateFilter = { report_date: { lte: new Date(dataAsOf) } };
    } else if (startDate && endDate) {
      dateFilter = {
        report_date: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      };
    }

    console.log(`getPmsData: dateFilter=${JSON.stringify(dateFilter)}`);

    // Fetch PMS data
    const allDailyData = await prisma.pms_master_sheet.findMany({
      where: {
        account_code: { in: custodianCodes },
        ...dateFilter
      },
      orderBy: { report_date: "asc" },
    });

    console.log(`Fetched PMS data for custodian_codes: ${JSON.stringify(custodianCodes)}, Count: ${allDailyData.length}`);

    // Format data
    const formattedData = allDailyData.map(formatDailyData);

    if (formattedData.length === 0) {
      console.log(`No PMS data after formatting for icode=${icode}, qcode=${qcode || 'none'}`);
      return {
        totalPortfolioValue: "0.00",
        totalPnl: "0.00",
        maxDrawdown: "0.00",
        cumulativeReturn: "0.00",
        equityCurve: [],
        drawdownCurve: [],
        quarterlyPnl: {},
        monthlyPnl: {},
        // FIXED: Return proper structure that matches the interface
        trailingReturns: {
          fiveDays: "-",
          tenDays: "-",
          fifteenDays: "-",
          oneMonth: "-",
          threeMonths: "-",
          sixMonths: "-",
          oneYear: "-",
          twoYears: "-",
          fiveYears: "-",
          sinceInception: "-",
          MDD: "-", // FIXED: Changed from maxDrawdown to MDD
          currentDD: "-" // FIXED: Changed from currentDrawdown to currentDD
        },
        cashInOut: { transactions: [], total: 0 }
      };
    }

    // Process data
    const latestRecord = formattedData[formattedData.length - 1];
    const totalPortfolioValue = parseFloat(latestRecord.portfolioValue || "0") || 0;
    const totalPnl = parseFloat(latestRecord.pnl || "0") || 0;
    const cumulativeReturn = parseFloat(latestRecord.cumulativeReturnPercent || "0") || 0;

    // Process cash_in_out
    const cashInOut = {
      transactions: formattedData
        .filter(record => record.cashInOut !== null && parseFloat(record.cashInOut) !== 0)
        .map(record => ({
          date: record.reportDate,
          amount: record.cashInOut!
        })),
      total: formattedData.reduce((sum, record) => sum + (parseFloat(record.cashInOut || "0") || 0), 0)
    };

    // Group data by date for equity and drawdown curves
    const dataByDate = formattedData.reduce((acc, record) => {
      const dateStr = record.reportDate;
      if (!acc[dateStr]) {
        acc[dateStr] = { records: [], totalPortfolioValue: 0, totalNav: 0, totalDrawdown: 0, count: 0 };
      }
      acc[dateStr].records.push(record);
      acc[dateStr].totalPortfolioValue += parseFloat(record.portfolioValue || "0") || 0;
      acc[dateStr].totalNav += parseFloat(record.nav || "0") || 0;
      acc[dateStr].totalDrawdown += parseFloat(record.drawdownPercent || "0") || 0;
      acc[dateStr].count += 1;
      return acc;
    }, {} as { [key: string]: { records: PmsData[]; totalPortfolioValue: number; totalNav: number; totalDrawdown: number; count: number } });

    // Calculate equity and drawdown curves
    const baseNAV = parseFloat(formattedData[0]?.nav || "100") || 100;
    const equityCurve: { date: string; value: number }[] = [];
    const drawdownCurve: { date: string; value: number }[] = [];

    const sortedDates = Object.keys(dataByDate).sort();
    sortedDates.forEach(dateStr => {
      const { totalNav, totalDrawdown, count } = dataByDate[dateStr];
      const avgNav = count > 0 ? totalNav / count : 0;
      const avgDrawdown = count > 0 ? totalDrawdown / count : 0;
      const equityValue = baseNAV !== 0 ? (avgNav / baseNAV) * 100 : 100;
      equityCurve.push({ date: dateStr, value: truncateTo2(equityValue) });
      drawdownCurve.push({ date: dateStr, value: truncateTo2(avgDrawdown) });
    });

    // Calculate monthly and quarterly PNL with proper cash and percentage calculations
    const monthlyPnLData = calculateMonthlyPnL(formattedData);
    const monthlyPnl: PmsStats["monthlyPnl"] = {};
    
    // FIXED: Only initialize years that have data
    const yearsWithData = new Set(monthlyPnLData.map(d => d.year));
    yearsWithData.forEach(year => {
      monthlyPnl[year] = { 
        months: {}, 
        totalPercent: 0, 
        totalCash: 0, 
        totalCapitalInOut: 0 
      };
      
      // Initialize all months with "-" for missing data
      monthsFull.forEach(month => {
        monthlyPnl[year].months[month] = {
          percent: "-",
          cash: "-", // FIXED: Changed from "0.00" to "-"
          capitalInOut: "-" // FIXED: Changed from "0.00" to "-"
        };
      });
    });

    // Populate actual data
    monthlyPnLData.forEach(({ year, month, pnlPercent, pnlCash, capitalInOut }) => {
      monthlyPnl[year].months[month] = {
        percent: pnlPercent !== 0 ? pnlPercent.toFixed(2) : "-",
        cash: pnlCash !== 0 ? pnlCash.toFixed(2) : "-", // FIXED: Return "-" for zero values
        capitalInOut: capitalInOut !== 0 ? capitalInOut.toFixed(2) : "-" // FIXED: Return "-" for zero values
      };
      monthlyPnl[year].totalPercent += pnlPercent || 0;
      monthlyPnl[year].totalCash += pnlCash || 0;
      monthlyPnl[year].totalCapitalInOut += capitalInOut || 0;
    });

    // Calculate quarterly PNL
    const quarterlyPnl: PmsStats["quarterlyPnl"] = {};
    
    // FIXED: Initialize quarterly structure for years with data
    yearsWithData.forEach(year => {
      quarterlyPnl[year] = {
        percent: { q1: "-", q2: "-", q3: "-", q4: "-", total: "0.00" },
        cash: { q1: "-", q2: "-", q3: "-", q4: "-", total: "0.00" }, // FIXED: Initialize with "-"
        yearCash: "0.00"
      };
    });

    // FIXED: Track quarters that have data
    const quartersWithData: { [year: string]: { [quarter: string]: boolean } } = {};
    
    monthlyPnLData.forEach(({ year, month, pnlPercent, pnlCash }) => {
      const monthIndex = monthsFull.indexOf(month);
      const quarter = monthIndex < 3 ? "q1" : monthIndex < 6 ? "q2" : monthIndex < 9 ? "q3" : "q4";
      
      if (!quartersWithData[year]) {
        quartersWithData[year] = { q1: false, q2: false, q3: false, q4: false };
      }
      quartersWithData[year][quarter] = true;
      
      const currentQuarterPercent = quarterlyPnl[year].percent[quarter];
      const currentQuarterCash = quarterlyPnl[year].cash[quarter] === "-" ? 0 : parseFloat(quarterlyPnl[year].cash[quarter]);
      
      // Update quarter percentage (compound if multiple months)
      if (currentQuarterPercent === "-") {
        quarterlyPnl[year].percent[quarter] = pnlPercent !== 0 ? pnlPercent.toFixed(2) : "-";
      } else {
        const prevPercent = parseFloat(currentQuarterPercent);
        // Compound the returns: (1 + r1) * (1 + r2) - 1
        const compoundedReturn = ((1 + prevPercent/100) * (1 + pnlPercent/100) - 1) * 100;
        quarterlyPnl[year].percent[quarter] = compoundedReturn.toFixed(2);
      }
      
      // Update quarter cash
      const newQuarterCash = currentQuarterCash + pnlCash;
      quarterlyPnl[year].cash[quarter] = newQuarterCash !== 0 ? newQuarterCash.toFixed(2) : "-"; // FIXED: Return "-" for zero
      
      // Update totals
      const currentTotal = parseFloat(quarterlyPnl[year].percent.total);
      quarterlyPnl[year].percent.total = (currentTotal + pnlPercent).toFixed(2);
      
      const currentTotalCash = parseFloat(quarterlyPnl[year].cash.total);
      const newTotalCash = currentTotalCash + pnlCash;
      quarterlyPnl[year].cash.total = newTotalCash.toFixed(2);
      quarterlyPnl[year].yearCash = quarterlyPnl[year].cash.total;
    });

    // Calculate trailing returns
    const trailingReturns = calculateTrailingReturns(formattedData);

    return {
      totalPortfolioValue: totalPortfolioValue.toFixed(2),
      totalPnl: totalPnl.toFixed(2),
      maxDrawdown: trailingReturns.MDD, // FIXED: Use MDD instead of maxDrawdown
      cumulativeReturn: cumulativeReturn.toFixed(2),
      equityCurve,
      drawdownCurve,
      quarterlyPnl,
      monthlyPnl,
      trailingReturns,
      cashInOut
    };
  } catch (error) {
    console.error("Error fetching PMS data:", error);
    throw error;
  }
}