/**
 * Script to calculate statistics for the inactive QYE++ scheme for Satidham
 * This will generate hardcoded data to be added to sarla-utils.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface DataRow {
  systemTag: string;
  date: string;
  portfolioValue: number;
  cashInOut: number;
  nav: number;
  prevNav: number;
  pnl: number;
  dailyPLPercent: number;
  exposureValue: number;
  prevPortfolioValue: number;
  prevExposureValue: number;
  prevPnl: number;
  drawdownPercent: number;
}

// Read and parse CSV
const csvPath = path.join(__dirname, '../data/satidham_old_qye_mastersheet.csv');
const csvContent = fs.readFileSync(csvPath, 'utf-8');
const lines = csvContent.trim().split('\n');

// Parse header
const headers = lines[0].split(',');
console.log('Headers:', headers);

// Parse data rows and filter for "QYE Total Portfolio Value"
const allData: DataRow[] = [];
for (let i = 1; i < lines.length; i++) {
  const values = lines[i].split(',');
  const row: DataRow = {
    systemTag: values[0],
    date: values[1],
    portfolioValue: parseFloat(values[2]) || 0,
    cashInOut: parseFloat(values[3]) || 0,
    nav: parseFloat(values[4]) || 0,
    prevNav: parseFloat(values[5]) || 0,
    pnl: parseFloat(values[6]) || 0,
    dailyPLPercent: parseFloat(values[7]) || 0,
    exposureValue: parseFloat(values[8]) || 0,
    prevPortfolioValue: parseFloat(values[9]) || 0,
    prevExposureValue: parseFloat(values[10]) || 0,
    prevPnl: parseFloat(values[11]) || 0,
    drawdownPercent: parseFloat(values[12]) || 0,
  };
  allData.push(row);
}

// Filter for QYE Total Portfolio Value
const qyeData = allData
  .filter(row => row.systemTag === 'QYE Total Portfolio Value')
  .sort((a, b) => a.date.localeCompare(b.date));

console.log('\n=== QYE Total Portfolio Value Analysis ===\n');
console.log(`Total records: ${qyeData.length}`);
console.log(`Date range: ${qyeData[0].date} to ${qyeData[qyeData.length - 1].date}`);

// 1. Amount Deposited (sum of all positive Cash In/Out)
const totalCashInOut = qyeData.reduce((sum, row) => sum + row.cashInOut, 0);
const cashInflows = qyeData.filter(row => row.cashInOut > 0).reduce((sum, row) => sum + row.cashInOut, 0);
const cashOutflows = qyeData.filter(row => row.cashInOut < 0).reduce((sum, row) => sum + row.cashInOut, 0);
console.log(`\n1. AMOUNT DEPOSITED:`);
console.log(`   Total Cash In/Out: ${totalCashInOut.toFixed(2)}`);
console.log(`   Cash Inflows: ${cashInflows.toFixed(2)}`);
console.log(`   Cash Outflows: ${cashOutflows.toFixed(2)}`);

// Get the first day's cash in/out as initial deposit
const firstRow = qyeData[0];
const lastRow = qyeData[qyeData.length - 1];
console.log(`   First day deposit: ${firstRow.cashInOut.toFixed(2)}`);

// 2. Current Portfolio Value (latest)
console.log(`\n2. CURRENT PORTFOLIO VALUE:`);
console.log(`   Latest Portfolio Value: ${lastRow.portfolioValue.toFixed(2)}`);
console.log(`   Latest Exposure Value: ${lastRow.exposureValue.toFixed(2)}`);

// 3. Total Profit (sum of all PnL)
const totalProfit = qyeData.reduce((sum, row) => sum + row.pnl, 0);
console.log(`\n3. TOTAL PROFIT:`);
console.log(`   Sum of PnL: ${totalProfit.toFixed(2)}`);
console.log(`   Latest cumulative PnL: ${lastRow.pnl.toFixed(2)}`);

// 4. Returns (from NAV)
const initialNav = qyeData[0].nav;
const finalNav = lastRow.nav;
const absoluteReturn = ((finalNav - initialNav) / initialNav) * 100;
const days = (new Date(lastRow.date).getTime() - new Date(qyeData[0].date).getTime()) / (1000 * 60 * 60 * 24);
const years = days / 365;
const cagr = years >= 1 ? (Math.pow(finalNav / initialNav, 1 / years) - 1) * 100 : absoluteReturn;
console.log(`\n4. RETURNS:`);
console.log(`   Initial NAV: ${initialNav.toFixed(4)}`);
console.log(`   Final NAV: ${finalNav.toFixed(4)}`);
console.log(`   Days: ${days.toFixed(0)}`);
console.log(`   Absolute Return: ${absoluteReturn.toFixed(2)}%`);
console.log(`   Since Inception: ${(years >= 1 ? cagr : absoluteReturn).toFixed(2)}%`);

// 5. Drawdown Metrics
let peak = qyeData[0].nav;
let maxDrawdown = 0;
const drawdownCurve: { date: string; drawdown: number }[] = [];

qyeData.forEach(row => {
  if (row.nav > peak) peak = row.nav;
  const dd = ((peak - row.nav) / peak) * 100;
  if (dd > maxDrawdown) maxDrawdown = dd;
  drawdownCurve.push({ date: row.date, drawdown: parseFloat(dd.toFixed(2)) });
});

const currentDrawdown = drawdownCurve[drawdownCurve.length - 1].drawdown;
console.log(`\n5. DRAWDOWN METRICS:`);
console.log(`   Max Drawdown (MDD): ${maxDrawdown.toFixed(2)}%`);
console.log(`   Current Drawdown: ${currentDrawdown.toFixed(2)}%`);

// 6. Equity Curve (NAV over time)
const equityCurve = qyeData.map(row => ({
  date: row.date,
  nav: parseFloat(row.nav.toFixed(2)),
}));
console.log(`\n6. EQUITY CURVE:`);
console.log(`   First: ${JSON.stringify(equityCurve[0])}`);
console.log(`   Last: ${JSON.stringify(equityCurve[equityCurve.length - 1])}`);

// 7. Cash Flows (non-zero cash in/out entries)
const cashFlows = qyeData
  .filter(row => Math.abs(row.cashInOut) > 0.01)
  .map(row => ({
    date: row.date,
    amount: parseFloat(row.cashInOut.toFixed(2)),
    dividend: 0,
  }));
console.log(`\n7. CASH FLOWS:`);
console.log(`   Total transactions: ${cashFlows.length}`);
cashFlows.forEach(cf => console.log(`   ${cf.date}: ${cf.amount.toFixed(2)}`));

// 8. Monthly PnL
interface MonthlyData {
  months: { [month: string]: { percent: string; cash: string; capitalInOut: string } };
  totalPercent: number;
  totalCash: number;
  totalCapitalInOut: number;
}

const monthlyPnl: { [year: string]: MonthlyData } = {};
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Group data by year-month
const monthlyGroups: { [yearMonth: string]: DataRow[] } = {};
qyeData.forEach(row => {
  const [year, month] = row.date.split('-');
  const yearMonth = `${year}-${month}`;
  if (!monthlyGroups[yearMonth]) {
    monthlyGroups[yearMonth] = [];
  }
  monthlyGroups[yearMonth].push(row);
});

// Calculate monthly returns
const sortedMonths = Object.keys(monthlyGroups).sort();
let prevMonthEndNav = 100; // Starting NAV

sortedMonths.forEach((yearMonth, idx) => {
  const [year, month] = yearMonth.split('-');
  const monthName = monthNames[parseInt(month) - 1];
  const monthData = monthlyGroups[yearMonth];

  const startNav = idx === 0 ? 100 : prevMonthEndNav;
  const endNav = monthData[monthData.length - 1].nav;
  const monthPnl = monthData.reduce((sum, row) => sum + row.pnl, 0);
  const monthCapitalInOut = monthData.reduce((sum, row) => sum + row.cashInOut, 0);
  const monthReturn = startNav > 0 ? ((endNav - startNav) / startNav) * 100 : 0;

  if (!monthlyPnl[year]) {
    monthlyPnl[year] = {
      months: {},
      totalPercent: 0,
      totalCash: 0,
      totalCapitalInOut: 0,
    };
  }

  monthlyPnl[year].months[monthName] = {
    percent: monthReturn.toFixed(2),
    cash: monthPnl.toFixed(2),
    capitalInOut: monthCapitalInOut.toFixed(2),
  };

  monthlyPnl[year].totalCash += monthPnl;
  monthlyPnl[year].totalCapitalInOut += monthCapitalInOut;

  prevMonthEndNav = endNav;
});

// Calculate yearly totals
Object.keys(monthlyPnl).forEach(year => {
  let compounded = 1;
  Object.values(monthlyPnl[year].months).forEach(month => {
    if (month.percent !== '-') {
      compounded *= (1 + parseFloat(month.percent) / 100);
    }
  });
  monthlyPnl[year].totalPercent = parseFloat(((compounded - 1) * 100).toFixed(2));
  monthlyPnl[year].totalCash = parseFloat(monthlyPnl[year].totalCash.toFixed(2));
  monthlyPnl[year].totalCapitalInOut = parseFloat(monthlyPnl[year].totalCapitalInOut.toFixed(2));
});

console.log(`\n8. MONTHLY PNL:`);
console.log(JSON.stringify(monthlyPnl, null, 2));

// 9. Quarterly PnL
interface QuarterlyData {
  percent: { q1: string; q2: string; q3: string; q4: string; total: string };
  cash: { q1: string; q2: string; q3: string; q4: string; total: string };
  yearCash: string;
}

const quarterlyPnl: { [year: string]: QuarterlyData } = {};

// Group by quarter
const getQuarter = (month: number): string => {
  if (month <= 3) return 'q1';
  if (month <= 6) return 'q2';
  if (month <= 9) return 'q3';
  return 'q4';
};

const quarterlyGroups: { [yearQuarter: string]: DataRow[] } = {};
qyeData.forEach(row => {
  const [year, month] = row.date.split('-');
  const quarter = getQuarter(parseInt(month));
  const yearQuarter = `${year}-${quarter}`;
  if (!quarterlyGroups[yearQuarter]) {
    quarterlyGroups[yearQuarter] = [];
  }
  quarterlyGroups[yearQuarter].push(row);
});

const sortedQuarters = Object.keys(quarterlyGroups).sort();
let prevQuarterEndNav = 100;

sortedQuarters.forEach((yearQuarter, idx) => {
  const [year, quarter] = yearQuarter.split('-');
  const quarterData = quarterlyGroups[yearQuarter];

  const startNav = idx === 0 ? 100 : prevQuarterEndNav;
  const endNav = quarterData[quarterData.length - 1].nav;
  const quarterPnl = quarterData.reduce((sum, row) => sum + row.pnl, 0);
  const quarterReturn = startNav > 0 ? ((endNav - startNav) / startNav) * 100 : 0;

  if (!quarterlyPnl[year]) {
    quarterlyPnl[year] = {
      percent: { q1: '-', q2: '-', q3: '-', q4: '-', total: '-' },
      cash: { q1: '-', q2: '-', q3: '-', q4: '-', total: '-' },
      yearCash: '-',
    };
  }

  quarterlyPnl[year].percent[quarter as keyof typeof quarterlyPnl[typeof year]['percent']] = quarterReturn.toFixed(2);
  quarterlyPnl[year].cash[quarter as keyof typeof quarterlyPnl[typeof year]['cash']] = quarterPnl.toFixed(2);

  prevQuarterEndNav = endNav;
});

// Calculate yearly totals
Object.keys(quarterlyPnl).forEach(year => {
  let compounded = 1;
  let totalCash = 0;
  ['q1', 'q2', 'q3', 'q4'].forEach(q => {
    const pct = quarterlyPnl[year].percent[q as keyof typeof quarterlyPnl[typeof year]['percent']];
    const cash = quarterlyPnl[year].cash[q as keyof typeof quarterlyPnl[typeof year]['cash']];
    if (pct !== '-') {
      compounded *= (1 + parseFloat(pct) / 100);
    }
    if (cash !== '-') {
      totalCash += parseFloat(cash);
    }
  });
  quarterlyPnl[year].percent.total = ((compounded - 1) * 100).toFixed(2);
  quarterlyPnl[year].cash.total = totalCash.toFixed(2);
  quarterlyPnl[year].yearCash = totalCash.toFixed(2);
});

console.log(`\n9. QUARTERLY PNL:`);
console.log(JSON.stringify(quarterlyPnl, null, 2));

// 10. Trailing Returns
const calculateTrailingReturn = (days: number): number | null => {
  const currentDate = new Date(lastRow.date);
  const targetDate = new Date(currentDate);
  targetDate.setDate(targetDate.getDate() - days);

  // Find closest date
  let closest: DataRow | null = null;
  for (const row of qyeData) {
    const rowDate = new Date(row.date);
    if (rowDate <= targetDate) {
      closest = row;
    }
  }

  if (!closest) return null;

  const daysActual = (currentDate.getTime() - new Date(closest.date).getTime()) / (1000 * 60 * 60 * 24);
  if (Math.abs(daysActual - days) > 7 && days <= 30) return null;
  if (Math.abs(daysActual - days) > 30 && days > 30) return null;

  const yearsActual = daysActual / 365;
  if (yearsActual >= 1) {
    return (Math.pow(finalNav / closest.nav, 1 / yearsActual) - 1) * 100;
  }
  return ((finalNav - closest.nav) / closest.nav) * 100;
};

const trailingReturns = {
  '5d': calculateTrailingReturn(5),
  '10d': calculateTrailingReturn(10),
  '15d': calculateTrailingReturn(15),
  '1m': calculateTrailingReturn(30),
  '3m': calculateTrailingReturn(90),
  '6m': calculateTrailingReturn(180),
  '1y': calculateTrailingReturn(365),
  '2y': calculateTrailingReturn(730),
  '5y': null,
  sinceInception: parseFloat(absoluteReturn.toFixed(2)),
  MDD: parseFloat((-maxDrawdown).toFixed(2)),
  currentDD: parseFloat((-currentDrawdown).toFixed(2)),
};

console.log(`\n10. TRAILING RETURNS:`);
console.log(JSON.stringify(trailingReturns, null, 2));

// Generate the hardcoded data structure
console.log('\n\n=== GENERATED HARDCODED DATA FOR sarla-utils.ts ===\n');

const hardcodedData = {
  data: {
    amountDeposited: '0.00', // Inactive scheme
    currentExposure: '0.00', // Inactive scheme
    return: absoluteReturn.toFixed(2),
    totalProfit: totalProfit.toFixed(2),
    trailingReturns: {
      '5d': trailingReturns['5d'] !== null ? parseFloat(trailingReturns['5d'].toFixed(2)) : null,
      '10d': trailingReturns['10d'] !== null ? parseFloat(trailingReturns['10d'].toFixed(2)) : null,
      '15d': trailingReturns['15d'] !== null ? parseFloat(trailingReturns['15d'].toFixed(2)) : null,
      '1m': trailingReturns['1m'] !== null ? parseFloat(trailingReturns['1m'].toFixed(2)) : null,
      '3m': null,
      '6m': null,
      '1y': null,
      '2y': null,
      '5y': null,
      sinceInception: parseFloat(absoluteReturn.toFixed(2)),
      MDD: parseFloat((-maxDrawdown).toFixed(2)),
      currentDD: parseFloat((-currentDrawdown).toFixed(2)),
    },
    drawdown: (-currentDrawdown).toFixed(2),
    maxDrawdown: (-maxDrawdown).toFixed(2),
    equityCurve: equityCurve,
    drawdownCurve: drawdownCurve,
    quarterlyPnl: quarterlyPnl,
    monthlyPnl: monthlyPnl,
    cashFlows: cashFlows,
    strategyName: 'Scheme QYE++',
  },
  metadata: {
    icode: 'Scheme QYE++',
    accountCount: 1,
    lastUpdated: new Date().toISOString().split('T')[0],
    filtersApplied: { accountType: null, broker: null, startDate: null, endDate: null },
    inceptionDate: qyeData[0].date,
    dataAsOfDate: lastRow.date,
    strategyName: 'Scheme QYE++',
    isActive: false,
  },
};

console.log('"Scheme QYE++": ' + JSON.stringify(hardcodedData, null, 2));
