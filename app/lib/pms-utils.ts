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
  qcode: string | null; // May not be present in pms_master_sheet
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

// Calculate monthly PNL based on NAV
function calculateMonthlyPnL(dailyData: PmsData[]): { year: number; month: string; firstNAV: number; lastNAV: number; pnl: number }[] {
  if (!dailyData || !Array.isArray(dailyData) || dailyData.length === 0) {
    return [];
  }

  const dataByMonth = dailyData.reduce((acc, data) => {
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
    const firstRecord = records[0];
    const lastRecord = records[records.length - 1];
    const firstNAV = parseFloat(firstRecord.nav || "0") || 0;
    const lastNAV = parseFloat(lastRecord.nav || "0") || 0;
    const pnl = firstNAV !== 0 ? ((lastNAV - firstNAV) / firstNAV) * 100 : 0;

    return {
      year,
      month: monthsFull[monthIndex],
      firstNAV,
      lastNAV,
      pnl: truncateTo2(pnl),
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
function calculateTrailingReturns(dailyData: PmsData[]): { [key: string]: number | null } {
  if (!dailyData || !Array.isArray(dailyData) || dailyData.length === 0) {
    return {
      "10D": null,
      "1M": null,
      "3M": null,
      "6M": null,
      "1Y": null,
      "2Y": null,
      "5Y": null,
      "Since Inception": null,
      "MDD": null,
      "currentDD": null
    };
  }

  dailyData.sort((a, b) => new Date(a.reportDate).getTime() - new Date(b.reportDate).getTime());

  const currentRecord = dailyData[dailyData.length - 1];
  const currentDate = new Date(currentRecord.reportDate);
  const currentNAV = parseFloat(currentRecord.nav || "0") || 0;

  if (currentNAV <= 0) {
    console.warn("Invalid current NAV:", currentNAV);
    return {
      "10D": null,
      "1M": null,
      "3M": null,
      "6M": null,
      "1Y": null,
      "2Y": null,
      "5Y": null,
      "Since Inception": null,
      "MDD": null,
      "currentDD": null
    };
  }

  const periods = ["10D", "1M", "3M", "6M", "1Y", "2Y", "5Y", "Since Inception"];
  const results: { [key: string]: number | null } = {};

  periods.forEach(period => {
    let baseNAV = null;
    let baseRecord = null;

    if (period === "Since Inception") {
      baseRecord = dailyData.find(record => {
        const nav = parseFloat(record.nav || "0") || 0;
        return nav > 0 && nav !== currentNAV;
      });
      baseNAV = baseRecord ? parseFloat(baseRecord.nav || "0") || 0 : null;
    } else {
      const days = periodToDays(period);
      const targetDate = new Date(currentDate);
      targetDate.setDate(targetDate.getDate() - days);

      baseRecord = findNAVRecordOnOrBefore(dailyData, targetDate);
      baseNAV = baseRecord ? parseFloat(baseRecord.nav || "0") || 0 : null;
    }

    if (baseNAV && baseNAV > 0 && baseNAV !== currentNAV) {
      const trailingReturn = ((currentNAV - baseNAV) / baseNAV) * 100;
      if (Math.abs(trailingReturn) > 10000) {
        console.warn(`Unrealistic return calculated for ${period}:`, {
          period, currentNAV, baseNAV, trailingReturn,
          baseDate: baseRecord ? baseRecord.reportDate : 'N/A',
          currentDate: currentRecord.reportDate
        });
        results[period] = null;
      } else {
        results[period] = truncateTo2(trailingReturn);
      }
    } else {
      results[period] = null;
    }
  });

  let peak = -Infinity;
  let maxDrawdown = 0;

  dailyData.forEach(record => {
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

  results.MDD = truncateTo2(maxDrawdown * 100);

  const validNAVs = dailyData
    .map(record => parseFloat(record.nav || "0") || 0)
    .filter(nav => nav > 0);

  if (validNAVs.length > 0) {
    const historicalPeak = Math.max(...validNAVs);
    const currentDrawdown = (currentNAV - historicalPeak) / historicalPeak;
    results["currentDD"] = truncateTo2(currentDrawdown * 100);
  } else {
    results["currentDD"] = 0;
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

// Convert period to days
function periodToDays(periodStr: string): number {
  const match = periodStr.match(/^(\d+)([DMY])$/);
  if (!match) {
    console.warn("Invalid period format:", periodStr);
    return 0;
  }

  const num = parseInt(match[1], 10);
  const unit = match[2];

  if (isNaN(num) || num <= 0) {
    console.warn("Invalid period number:", periodStr);
    return 0;
  }

  switch (unit) {
    case "D": return num;
    case "M": return num * 30;
    case "Y": return num * 365;
    default: return 0;
  }
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
          tenDays: "0.00",
          oneMonth: "0.00",
          threeMonths: "0.00",
          sixMonths: "0.00",
          oneYear: "0.00",
          twoYears: "0.00",
          fiveYears: "0.00",
          sinceInception: "0.00",
          MDD: "0.00",
          currentDD: "0.00"
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
        trailingReturns: {
          tenDays: "0.00",
          oneMonth: "0.00",
          threeMonths: "0.00",
          sixMonths: "0.00",
          oneYear: "0.00",
          twoYears: "0.00",
          fiveYears: "0.00",
          sinceInception: "0.00",
          MDD: "0.00",
          currentDD: "0.00"
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

    // Calculate monthly and quarterly PNL
    const monthlyPnLData = calculateMonthlyPnL(formattedData);
    const monthlyPnl: PmsStats["monthlyPnl"] = {};
    monthlyPnLData.forEach(({ year, month, pnl }) => {
      if (!monthlyPnl[year]) {
        monthlyPnl[year] = { months: {}, totalPercent: 0, totalCash: 0, totalCapitalInOut: 0 };
      }
      monthlyPnl[year].months[month] = {
        percent: pnl.toFixed(2),
        cash: "0.00",
        capitalInOut: "0.00"
      };
      monthlyPnl[year].totalPercent += pnl || 0;
      monthlyPnl[year].totalCash = 0;
      monthlyPnl[year].totalCapitalInOut = 0;
    });

    const quarterlyPnl: PmsStats["quarterlyPnl"] = {};
    monthlyPnLData.forEach(({ year, month, pnl }) => {
      const monthIndex = monthsFull.indexOf(month);
      const quarter = monthIndex < 3 ? "q1" : monthIndex < 6 ? "q2" : monthIndex < 9 ? "q3" : "q4";
      if (!quarterlyPnl[year]) {
        quarterlyPnl[year] = {
          percent: { q1: "0.00", q2: "0.00", q3: "0.00", q4: "0.00", total: "0.00" },
          cash: { q1: "0.00", q2: "0.00", q3:"0.00", q4: "0.00", total: "0.00" },
          yearCash: "0.00"
        };
      }
      quarterlyPnl[year].percent[quarter] = (parseFloat(quarterlyPnl[year].percent[quarter]) + (pnl || 0)).toFixed(2);
      quarterlyPnl[year].percent.total = (parseFloat(quarterlyPnl[year].percent.total) + (pnl || 0)).toFixed(2);
      quarterlyPnl[year].cash[quarter] = "0.00";
      quarterlyPnl[year].cash.total = "0.00";
      quarterlyPnl[year].yearCash = "0.00";
    });

    const trailingReturns = calculateTrailingReturns(formattedData);

    return {
      totalPortfolioValue: totalPortfolioValue.toFixed(2),
      totalPnl: totalPnl.toFixed(2),
      maxDrawdown: trailingReturns.MDD?.toFixed(2) || "0.00",
      cumulativeReturn: cumulativeReturn.toFixed(2),
      equityCurve,
      drawdownCurve,
      quarterlyPnl,
      monthlyPnl,
      trailingReturns: {
        tenDays: trailingReturns["10D"]?.toFixed(2) || "0.00",
        oneMonth: trailingReturns["1M"]?.toFixed(2) || "0.00",
        threeMonths: trailingReturns["3M"]?.toFixed(2) || "0.00",
        sixMonths: trailingReturns["6M"]?.toFixed(2) || "0.00",
        oneYear: trailingReturns["1Y"]?.toFixed(2) || "0.00",
        twoYears: trailingReturns["2Y"]?.toFixed(2) || "0.00",
        fiveYears: trailingReturns["5Y"]?.toFixed(2) || "0.00",
        sinceInception: trailingReturns["Since Inception"]?.toFixed(2) || "0.00",
        MDD: trailingReturns["MDD"]?.toFixed(2) || "0.00",
        currentDD: trailingReturns["currentDD"]?.toFixed(2) || "0.00"
      },
      cashInOut
    };
  } catch (error) {
    console.error("Error fetching PMS data:", error);
    throw error;
  }
}