/**
 * Script to verify Dinesh monthly and quarterly PnL calculations
 *
 * This script compares computed PnL values against expected values
 * by manually tracing through the calculation logic.
 *
 * Run with: npx tsx scripts/verify-dinesh-pnl.ts
 *
 * SAFETY: This script is READ-ONLY - only uses SELECT queries
 * Follows CLAUDE.md Database Safety Rules:
 * - ✅ Uses findMany() - SELECT multiple rows
 * - ✅ Uses $queryRaw - Only for SELECT statements
 * - ❌ NO create/update/delete/upsert operations
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Dinesh configuration (from dinesh-utils.ts)
const DINESH_QCODE = 'QAC00053';
const SYSTEM_TAG = 'Zerodha Total Portfolio';
const QAW_START_DATE = new Date('2026-01-12');

// QTF configuration for Total Portfolio rebasing
const QTF_FINAL_NAV = 113.57;

interface DailyData {
  date: string;
  nav: number;
  pnl: number;
  capitalInOut: number;
}

async function fetchRawData(): Promise<DailyData[]> {
  // READ-ONLY: Using findMany (SELECT)
  const data = await prisma.master_sheet_test.findMany({
    where: {
      qcode: DINESH_QCODE,
      system_tag: SYSTEM_TAG,
      date: { gte: QAW_START_DATE },
      nav: { not: null },
    },
    select: {
      date: true,
      nav: true,
      pnl: true,
      capital_in_out: true,
    },
    orderBy: { date: 'asc' },
  });

  return data.map((entry) => ({
    date: entry.date.toISOString().split('T')[0],
    nav: Number(entry.nav) || 0,
    pnl: Number(entry.pnl) || 0,
    capitalInOut: Number(entry.capital_in_out) || 0,
  }));
}

async function fetchAllQAWData(): Promise<DailyData[]> {
  // READ-ONLY: Fetch ALL data without date filter to see full history
  const data = await prisma.master_sheet_test.findMany({
    where: {
      qcode: DINESH_QCODE,
      system_tag: SYSTEM_TAG,
      nav: { not: null },
    },
    select: {
      date: true,
      nav: true,
      pnl: true,
      capital_in_out: true,
    },
    orderBy: { date: 'asc' },
  });

  return data.map((entry) => ({
    date: entry.date.toISOString().split('T')[0],
    nav: Number(entry.nav) || 0,
    pnl: Number(entry.pnl) || 0,
    capitalInOut: Number(entry.capital_in_out) || 0,
  }));
}

function groupByMonth(data: DailyData[]): Record<string, DailyData[]> {
  const grouped: Record<string, DailyData[]> = {};

  for (const entry of data) {
    const [year, month] = entry.date.split('-');
    const key = `${year}-${month}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(entry);
  }

  return grouped;
}

function getMonthName(monthNum: string): string {
  const months: Record<string, string> = {
    '01': 'January', '02': 'February', '03': 'March', '04': 'April',
    '05': 'May', '06': 'June', '07': 'July', '08': 'August',
    '09': 'September', '10': 'October', '11': 'November', '12': 'December',
  };
  return months[monthNum] || monthNum;
}

async function main() {
  console.log('='.repeat(80));
  console.log('DINESH PNL VERIFICATION SCRIPT');
  console.log('='.repeat(80));
  console.log('\nSAFETY: READ-ONLY operations only (findMany, $queryRaw SELECT)\n');

  // ============================================================
  // PART 1: Examine raw database data
  // ============================================================
  console.log('\n' + '='.repeat(80));
  console.log('PART 1: RAW DATABASE DATA');
  console.log('='.repeat(80));

  const allData = await fetchAllQAWData();
  const filteredData = await fetchRawData();

  console.log(`\n📊 All "Zerodha Total Portfolio" data (no date filter):`);
  console.log(`   Total records: ${allData.length}`);
  if (allData.length > 0) {
    console.log(`   Date range: ${allData[0].date} to ${allData[allData.length - 1].date}`);
    console.log(`\n   First 10 entries:`);
    allData.slice(0, 10).forEach((d, i) => {
      console.log(`   ${i + 1}. ${d.date} | NAV: ${d.nav.toFixed(4)} | PnL: ${d.pnl.toFixed(2)} | Capital: ${d.capitalInOut.toFixed(2)}`);
    });
  }

  console.log(`\n📊 Filtered data (>= ${QAW_START_DATE.toISOString().split('T')[0]}):`);
  console.log(`   Total records: ${filteredData.length}`);
  if (filteredData.length > 0) {
    console.log(`   Date range: ${filteredData[0].date} to ${filteredData[filteredData.length - 1].date}`);
    console.log(`\n   All entries:`);
    filteredData.forEach((d, i) => {
      console.log(`   ${i + 1}. ${d.date} | NAV: ${d.nav.toFixed(4)} | PnL: ${d.pnl.toFixed(2)} | Capital: ${d.capitalInOut.toFixed(2)}`);
    });
  }

  // ============================================================
  // PART 2: Analyze the NAV starting point issue
  // ============================================================
  console.log('\n\n' + '='.repeat(80));
  console.log('PART 2: NAV STARTING POINT ANALYSIS');
  console.log('='.repeat(80));

  if (filteredData.length > 0) {
    const firstActualNav = filteredData[0].nav;
    const prependedBaseline = 100;

    console.log(`\n🔍 Key NAV Values:`);
    console.log(`   - Prepended baseline (dinesh-utils.ts): ${prependedBaseline}`);
    console.log(`   - First actual NAV in database: ${firstActualNav.toFixed(4)}`);
    console.log(`   - QTF final NAV (for rebasing): ${QTF_FINAL_NAV}`);
    console.log(`   - Difference from 100: ${(firstActualNav - 100).toFixed(4)} (${((firstActualNav / 100 - 1) * 100).toFixed(2)}%)`);

    if (Math.abs(firstActualNav - 100) > 1) {
      console.log(`\n   ⚠️  WARNING: First actual NAV (${firstActualNav.toFixed(4)}) is significantly different from 100`);
      console.log(`   This could indicate the NAV is already rebased or the baseline of 100 is incorrect.`);
    }
  }

  // ============================================================
  // PART 3: Monthly PnL Calculation Verification
  // ============================================================
  console.log('\n\n' + '='.repeat(80));
  console.log('PART 3: MONTHLY PNL CALCULATION VERIFICATION');
  console.log('='.repeat(80));

  const monthlyGroups = groupByMonth(filteredData);
  const sortedMonths = Object.keys(monthlyGroups).sort();

  console.log(`\n📆 Months with data: ${sortedMonths.join(', ')}`);

  // Method 1: Current dinesh-utils.ts approach (prepend NAV=100)
  console.log(`\n\n--- METHOD 1: Current dinesh-utils.ts (prepend NAV=100 baseline) ---`);

  let prevEndNav = 100; // Prepended baseline
  for (const yearMonth of sortedMonths) {
    const [year, month] = yearMonth.split('-');
    const entries = monthlyGroups[yearMonth];
    const monthName = getMonthName(month);

    const startNav = prevEndNav;
    const endNav = entries[entries.length - 1].nav;
    const totalPnl = entries.reduce((sum, e) => sum + e.pnl, 0);
    const percent = ((endNav / startNav) - 1) * 100;

    console.log(`\n${year} ${monthName}:`);
    console.log(`   Start NAV: ${startNav.toFixed(4)} (previous end)`);
    console.log(`   End NAV: ${endNav.toFixed(4)}`);
    console.log(`   Percent: ((${endNav.toFixed(4)} / ${startNav.toFixed(4)}) - 1) * 100 = ${percent.toFixed(2)}%`);
    console.log(`   Cash PnL: ${totalPnl.toFixed(2)}`);

    prevEndNav = endNav;
  }

  // Method 2: Use actual first NAV as starting point
  console.log(`\n\n--- METHOD 2: Use actual first NAV as baseline ---`);

  if (filteredData.length > 0) {
    prevEndNav = filteredData[0].nav; // First actual NAV
    let isFirst = true;

    for (const yearMonth of sortedMonths) {
      const [year, month] = yearMonth.split('-');
      const entries = monthlyGroups[yearMonth];
      const monthName = getMonthName(month);

      const startNav = isFirst ? entries[0].nav : prevEndNav;
      const endNav = entries[entries.length - 1].nav;
      const totalPnl = entries.reduce((sum, e) => sum + e.pnl, 0);
      const percent = ((endNav / startNav) - 1) * 100;

      console.log(`\n${year} ${monthName}:`);
      console.log(`   Start NAV: ${startNav.toFixed(4)}`);
      console.log(`   End NAV: ${endNav.toFixed(4)}`);
      console.log(`   Percent: ${percent.toFixed(2)}%`);
      console.log(`   Cash PnL: ${totalPnl.toFixed(2)}`);

      prevEndNav = endNav;
      isFirst = false;
    }
  }

  // Method 3: Day-over-day calculation (sum of daily returns)
  console.log(`\n\n--- METHOD 3: Sum of daily NAV returns ---`);

  for (const yearMonth of sortedMonths) {
    const [year, month] = yearMonth.split('-');
    const entries = monthlyGroups[yearMonth];
    const monthName = getMonthName(month);

    let dailyReturnsSum = 0;
    for (let i = 1; i < entries.length; i++) {
      const dailyReturn = ((entries[i].nav / entries[i - 1].nav) - 1) * 100;
      dailyReturnsSum += dailyReturn;
    }

    const totalPnl = entries.reduce((sum, e) => sum + e.pnl, 0);

    console.log(`\n${year} ${monthName}:`);
    console.log(`   Sum of daily returns: ${dailyReturnsSum.toFixed(2)}%`);
    console.log(`   Cash PnL: ${totalPnl.toFixed(2)}`);
  }

  // ============================================================
  // PART 4: Check for potential issues
  // ============================================================
  console.log('\n\n' + '='.repeat(80));
  console.log('PART 4: POTENTIAL ISSUES IDENTIFIED');
  console.log('='.repeat(80));

  const issues: string[] = [];

  if (filteredData.length > 0) {
    const firstNav = filteredData[0].nav;

    // Issue 1: NAV doesn't start at 100
    if (Math.abs(firstNav - 100) > 1) {
      issues.push(`NAV baseline mismatch: First actual NAV is ${firstNav.toFixed(4)}, but code prepends 100. This causes a ${((firstNav / 100 - 1) * 100).toFixed(2)}% artificial jump.`);
    }

    // Issue 2: Check if monthly PnL % matches expected from NAV movement
    for (const yearMonth of sortedMonths) {
      const entries = monthlyGroups[yearMonth];
      const firstEntry = entries[0];
      const lastEntry = entries[entries.length - 1];

      // Calculate expected return from NAV change
      const navReturn = ((lastEntry.nav / firstEntry.nav) - 1) * 100;

      // Calculate return from daily PnL (if we have portfolio value)
      const totalDailyPnl = entries.reduce((sum, e) => sum + e.pnl, 0);

      console.log(`\n${yearMonth}:`);
      console.log(`   NAV change within month: ${firstEntry.nav.toFixed(4)} -> ${lastEntry.nav.toFixed(4)} = ${navReturn.toFixed(2)}%`);
      console.log(`   Total daily PnL: ${totalDailyPnl.toFixed(2)}`);
    }
  }

  // ============================================================
  // PART 5: Verify against hardcoded QTF data
  // ============================================================
  console.log('\n\n' + '='.repeat(80));
  console.log('PART 5: QTF SCHEME VERIFICATION (HARDCODED)');
  console.log('='.repeat(80));

  // From dinesh-utils.ts hardcoded data
  const qtfHardcoded = {
    monthlyPnl: {
      '2025': {
        August: { percent: '1.24', cash: '790790.73' },
        September: { percent: '4.51', cash: '2283135.97' },
        October: { percent: '2.91', cash: '1535912.83' },
        November: { percent: '2.93', cash: '1595655.95' },
        December: { percent: '-0.13', cash: '-61942.29' },
      },
      '2026': {
        January: { percent: '1.47', cash: '844339.77' },
      },
    },
    equityCurve: [
      { date: '2025-08-25', nav: 100 },
      { date: '2025-08-26', nav: 99.66 },
      // ... (first and last of each month for verification)
      { date: '2025-08-29', nav: 101.24 },
      { date: '2025-09-30', nav: 105.81 },
      { date: '2025-10-31', nav: 108.89 },
      { date: '2025-11-28', nav: 112.08 },
      { date: '2025-12-31', nav: 111.93 },
      { date: '2026-01-09', nav: 113.57 },
    ],
  };

  console.log(`\n📊 QTF Hardcoded Monthly PnL (for reference):`);
  console.log(`\n2025:`);
  console.log(`   August:    ${qtfHardcoded.monthlyPnl['2025'].August.percent}% | Cash: ${qtfHardcoded.monthlyPnl['2025'].August.cash}`);
  console.log(`   September: ${qtfHardcoded.monthlyPnl['2025'].September.percent}% | Cash: ${qtfHardcoded.monthlyPnl['2025'].September.cash}`);
  console.log(`   October:   ${qtfHardcoded.monthlyPnl['2025'].October.percent}% | Cash: ${qtfHardcoded.monthlyPnl['2025'].October.cash}`);
  console.log(`   November:  ${qtfHardcoded.monthlyPnl['2025'].November.percent}% | Cash: ${qtfHardcoded.monthlyPnl['2025'].November.cash}`);
  console.log(`   December:  ${qtfHardcoded.monthlyPnl['2025'].December.percent}% | Cash: ${qtfHardcoded.monthlyPnl['2025'].December.cash}`);
  console.log(`\n2026:`);
  console.log(`   January:   ${qtfHardcoded.monthlyPnl['2026'].January.percent}% | Cash: ${qtfHardcoded.monthlyPnl['2026'].January.cash}`);

  // Verify QTF monthly returns from NAV
  console.log(`\n📊 Verify QTF monthly % from NAV curve:`);
  console.log(`   Aug (100 -> 101.24): ${((101.24 / 100) - 1) * 100}% - hardcoded says 1.24% ✓`);
  console.log(`   Sep (101.24 -> 105.81): ${((105.81 / 101.24) - 1) * 100}% - hardcoded says 4.51%`);
  console.log(`   Oct (105.81 -> 108.89): ${((108.89 / 105.81) - 1) * 100}% - hardcoded says 2.91%`);
  console.log(`   Nov (108.89 -> 112.08): ${((112.08 / 108.89) - 1) * 100}% - hardcoded says 2.93%`);
  console.log(`   Dec (112.08 -> 111.93): ${((111.93 / 112.08) - 1) * 100}% - hardcoded says -0.13%`);
  console.log(`   Jan (111.93 -> 113.57): ${((113.57 / 111.93) - 1) * 100}% - hardcoded says 1.47%`);

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log('\n\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));

  if (issues.length > 0) {
    console.log('\n❌ Issues found:');
    issues.forEach((issue, i) => console.log(`   ${i + 1}. ${issue}`));
  } else {
    console.log('\n✅ No obvious issues found');
  }

  console.log(`\n📝 Key observations for QAW++ scheme:`);
  if (filteredData.length > 0) {
    const firstNav = filteredData[0].nav;
    console.log(`   - First actual NAV: ${firstNav.toFixed(4)}`);
    console.log(`   - Code prepends baseline: 100`);
    console.log(`   - This means first month % = ((${filteredData[filteredData.length - 1]?.nav.toFixed(4)} / 100) - 1) * 100`);
    console.log(`   - But within-month NAV change: ${filteredData[0].nav.toFixed(4)} -> ${filteredData[filteredData.length - 1]?.nav.toFixed(4)}`);

    const withinMonthChange = ((filteredData[filteredData.length - 1]?.nav / filteredData[0].nav) - 1) * 100;
    const fromBaselineChange = ((filteredData[filteredData.length - 1]?.nav / 100) - 1) * 100;

    console.log(`\n   📊 Comparison:`);
    console.log(`   - Method 1 (from 100 baseline): ${fromBaselineChange.toFixed(2)}%`);
    console.log(`   - Method 2 (within-month only): ${withinMonthChange.toFixed(2)}%`);
    console.log(`   - Difference: ${(fromBaselineChange - withinMonthChange).toFixed(2)} percentage points`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('VERIFICATION COMPLETE');
  console.log('='.repeat(80));
}

main()
  .catch((e) => {
    console.error('Error running verification script:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
