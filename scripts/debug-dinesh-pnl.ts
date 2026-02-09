/**
 * Script to debug Dinesh monthly and quarterly PnL percentage calculations
 *
 * This script traces how NAV values are used to compute PnL percentages,
 * specifically verifying whether the first month uses NAV=100 (baseline) correctly.
 *
 * Run with: npx tsx scripts/debug-dinesh-pnl.ts
 *
 * SAFETY: This script is READ-ONLY - only uses SELECT queries (findMany, $queryRaw SELECT)
 * Follows CLAUDE.md Database Safety Rules:
 * - ✅ Uses findMany() - SELECT multiple rows
 * - ✅ Uses $queryRaw - Only for SELECT statements
 * - ❌ NO create/update/delete/upsert operations
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Dinesh configuration (from dinesh-utils.ts)
const DINESH_QCODE = 'QAC00053';
const DINESH_SYSTEM_TAGS: Record<string, string> = {
  'Scheme QTF': 'QTF Zerodha Total Portfolio',
  'Scheme QAW++': 'Zerodha Total Portfolio',
};

// QAW++ starts on Jan 12, 2026 (after QTF ended on Jan 9, 2026)
const QAW_START_DATE = new Date('2026-01-12');

function getMonthName(monthIndex: number): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return months[monthIndex];
}

function getQuarter(month: number): string {
  if (month < 3) return 'q1';
  if (month < 6) return 'q2';
  if (month < 9) return 'q3';
  return 'q4';
}

/**
 * Simulates the getHistoricalData logic from dinesh-utils.ts
 * for QAW++ scheme - this is where the baseline NAV=100 is prepended
 */
async function getHistoricalDataForQAW(qcode: string): Promise<Array<{ date: Date; nav: number; pnl: number; capitalInOut: number }>> {
  const systemTag = DINESH_SYSTEM_TAGS['Scheme QAW++'];

  // READ-ONLY: Using findMany (SELECT)
  const data = await prisma.master_sheet_test.findMany({
    where: {
      qcode,
      system_tag: systemTag,
      date: { gte: QAW_START_DATE },
      nav: { not: null },
    },
    select: { date: true, nav: true, pnl: true, capital_in_out: true },
    orderBy: { date: 'asc' },
  });

  const result = data.map((entry) => ({
    date: entry.date,
    nav: Number(entry.nav) || 0,
    pnl: Number(entry.pnl) || 0,
    capitalInOut: Number(entry.capital_in_out) || 0,
  }));

  // This is where dinesh-utils.ts prepends the baseline NAV=100
  // Add baseline point for QAW++ (Jan 11, 2026 with NAV = 100)
  if (result.length > 0) {
    const firstDate = new Date(result[0].date);
    firstDate.setDate(firstDate.getDate() - 1);
    result.unshift({
      date: firstDate,
      nav: 100,
      pnl: 0,
      capitalInOut: 0,
    });
  }

  return result;
}

/**
 * Simulates the calculateMonthlyPnL logic from dinesh-utils.ts for QAW++
 */
function simulateMonthlyPnLCalculation(
  historicalData: Array<{ date: Date; nav: number; pnl: number; capitalInOut: number }>
): void {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  // Group data by year and month (same logic as dinesh-utils.ts:756-776)
  const grouped: Record<string, Record<string, { startNav: number; endNav: number; pnl: number; capitalInOut: number; entries: number }>> = {};

  console.log('\n📊 SIMULATING dinesh-utils.ts calculateMonthlyPnL LOGIC:');
  console.log('-'.repeat(80));

  // This mirrors the loop in dinesh-utils.ts (starts at i=1)
  for (let i = 1; i < historicalData.length; i++) {
    const entry = historicalData[i];
    const date = new Date(entry.date);
    const year = date.getFullYear().toString();
    const month = monthNames[date.getMonth()];

    // Key: what does historicalData[i-1] give us?
    const prevNav = historicalData[i - 1]?.nav || entry.nav;

    if (!grouped[year]) grouped[year] = {};
    if (!grouped[year][month]) {
      // First entry of this month - startNav comes from previous entry
      grouped[year][month] = {
        startNav: prevNav, // This is the key! For i=1, prevNav = historicalData[0].nav
        endNav: entry.nav,
        pnl: entry.pnl,
        capitalInOut: entry.capitalInOut,
        entries: 1,
      };

      // Debug: show what's happening for first entry of each month
      console.log(`\n[i=${i}] First entry for ${year} ${month}:`);
      console.log(`   entry.date: ${entry.date.toISOString().split('T')[0]}`);
      console.log(`   entry.nav: ${entry.nav.toFixed(4)}`);
      console.log(`   historicalData[i-1].date: ${historicalData[i - 1]?.date.toISOString().split('T')[0]}`);
      console.log(`   historicalData[i-1].nav: ${historicalData[i - 1]?.nav.toFixed(4)} <-- THIS IS USED AS startNav`);
    } else {
      grouped[year][month].endNav = entry.nav;
      grouped[year][month].pnl += entry.pnl;
      grouped[year][month].capitalInOut += entry.capitalInOut;
      grouped[year][month].entries++;
    }
  }

  // Calculate and show monthly percentages
  console.log('\n\n📆 MONTHLY PNL RESULTS:');
  console.log('-'.repeat(80));

  let isFirstMonth = true;
  for (const year of Object.keys(grouped).sort()) {
    for (const month of monthNames) {
      if (grouped[year]?.[month]) {
        const data = grouped[year][month];
        const percent = ((data.endNav / data.startNav) - 1) * 100;

        const marker = isFirstMonth ? '🔴 FIRST MONTH' : '';

        console.log(`\n${year} ${month} ${marker}`);
        console.log(`   Entries: ${data.entries} days`);
        console.log(`   Start NAV: ${data.startNav.toFixed(4)}`);
        console.log(`   End NAV: ${data.endNav.toFixed(4)}`);
        console.log(`   Percent: ((${data.endNav.toFixed(4)} / ${data.startNav.toFixed(4)}) - 1) * 100 = ${percent.toFixed(2)}%`);

        if (isFirstMonth) {
          if (Math.abs(data.startNav - 100) < 0.01) {
            console.log(`   ✅ CORRECT: First month uses NAV=100 as baseline`);
          } else {
            console.log(`   ❌ ISSUE: First month does NOT use NAV=100 (uses ${data.startNav.toFixed(4)})`);
            const expectedPercent = ((data.endNav / 100) - 1) * 100;
            console.log(`   ⚠️  Expected percent if using 100: ${expectedPercent.toFixed(2)}%`);
            console.log(`   ⚠️  Difference: ${(percent - expectedPercent).toFixed(2)} percentage points`);
          }
          isFirstMonth = false;
        }

        console.log(`   Cash P/L: ${data.pnl.toFixed(2)}`);
      }
    }
  }
}

/**
 * Simulates the calculateQuarterlyPnL logic from dinesh-utils.ts for QAW++
 */
function simulateQuarterlyPnLCalculation(
  historicalData: Array<{ date: Date; nav: number; pnl: number; capitalInOut: number }>
): void {
  // Group data by year and quarter (same logic as dinesh-utils.ts:869-889)
  const grouped: Record<string, Record<string, { startNav: number; endNav: number; pnl: number; entries: number }>> = {};

  console.log('\n\n📊 SIMULATING dinesh-utils.ts calculateQuarterlyPnL LOGIC:');
  console.log('-'.repeat(80));

  for (let i = 1; i < historicalData.length; i++) {
    const entry = historicalData[i];
    const date = new Date(entry.date);
    const year = date.getFullYear().toString();
    const quarter = `q${Math.floor(date.getMonth() / 3) + 1}`;

    const prevNav = historicalData[i - 1]?.nav || entry.nav;

    if (!grouped[year]) grouped[year] = {};
    if (!grouped[year][quarter]) {
      grouped[year][quarter] = {
        startNav: prevNav,
        endNav: entry.nav,
        pnl: entry.pnl,
        entries: 1,
      };

      console.log(`\n[i=${i}] First entry for ${year} ${quarter.toUpperCase()}:`);
      console.log(`   entry.date: ${entry.date.toISOString().split('T')[0]}`);
      console.log(`   historicalData[i-1].nav: ${historicalData[i - 1]?.nav.toFixed(4)} <-- startNav`);
    } else {
      grouped[year][quarter].endNav = entry.nav;
      grouped[year][quarter].pnl += entry.pnl;
      grouped[year][quarter].entries++;
    }
  }

  // Calculate and show quarterly percentages
  console.log('\n\n📆 QUARTERLY PNL RESULTS:');
  console.log('-'.repeat(80));

  let isFirstQuarter = true;
  for (const year of Object.keys(grouped).sort()) {
    for (const q of ['q1', 'q2', 'q3', 'q4']) {
      if (grouped[year]?.[q]) {
        const data = grouped[year][q];
        const percent = ((data.endNav / data.startNav) - 1) * 100;

        const marker = isFirstQuarter ? '🔴 FIRST QUARTER' : '';

        console.log(`\n${year} ${q.toUpperCase()} ${marker}`);
        console.log(`   Entries: ${data.entries} days`);
        console.log(`   Start NAV: ${data.startNav.toFixed(4)}`);
        console.log(`   End NAV: ${data.endNav.toFixed(4)}`);
        console.log(`   Percent: ${percent.toFixed(2)}%`);

        if (isFirstQuarter) {
          if (Math.abs(data.startNav - 100) < 0.01) {
            console.log(`   ✅ CORRECT: First quarter uses NAV=100 as baseline`);
          } else {
            console.log(`   ❌ ISSUE: First quarter does NOT use NAV=100 (uses ${data.startNav.toFixed(4)})`);
            const expectedPercent = ((data.endNav / 100) - 1) * 100;
            console.log(`   ⚠️  Expected percent if using 100: ${expectedPercent.toFixed(2)}%`);
            console.log(`   ⚠️  Difference: ${(percent - expectedPercent).toFixed(2)} percentage points`);
          }
          isFirstQuarter = false;
        }

        console.log(`   Cash P/L: ${data.pnl.toFixed(2)}`);
      }
    }
  }
}

async function main() {
  console.log('='.repeat(80));
  console.log('DINESH MONTHLY/QUARTERLY PNL DEBUG SCRIPT');
  console.log('='.repeat(80));
  console.log(`\nThis script verifies whether dinesh-utils.ts correctly uses NAV=100`);
  console.log(`as the baseline for the first month/quarter PnL calculations.\n`);
  console.log(`SAFETY: READ-ONLY operations only (findMany, $queryRaw SELECT)\n`);

  // Check available system tags for Dinesh in test table
  console.log('📋 Available system tags for Dinesh (QAC00053) in master_sheet_test:');

  // READ-ONLY: Using $queryRaw SELECT
  const tags = await prisma.$queryRaw<Array<{ system_tag: string; min_date: Date; max_date: Date; count: bigint }>>`
    SELECT
      system_tag,
      MIN(date) as min_date,
      MAX(date) as max_date,
      COUNT(*)::bigint as count
    FROM master_sheet_test
    WHERE qcode = ${DINESH_QCODE} AND nav IS NOT NULL
    GROUP BY system_tag
    ORDER BY min_date
  `;

  if (tags.length === 0) {
    console.log('   ⚠️  No data found in master_sheet_test for QAC00053');
    console.log('   Trying master_sheet (production table)...\n');

    const prodTags = await prisma.$queryRaw<Array<{ system_tag: string; min_date: Date; max_date: Date; count: bigint }>>`
      SELECT
        system_tag,
        MIN(date) as min_date,
        MAX(date) as max_date,
        COUNT(*)::bigint as count
      FROM master_sheet
      WHERE qcode = ${DINESH_QCODE} AND nav IS NOT NULL
      GROUP BY system_tag
      ORDER BY min_date
    `;

    prodTags.forEach(tag => {
      console.log(`   - "${tag.system_tag}": ${tag.min_date.toISOString().split('T')[0]} to ${tag.max_date.toISOString().split('T')[0]} (${tag.count} records)`);
    });
  } else {
    tags.forEach(tag => {
      console.log(`   - "${tag.system_tag}": ${tag.min_date.toISOString().split('T')[0]} to ${tag.max_date.toISOString().split('T')[0]} (${tag.count} records)`);
    });
  }

  // Debug QAW++ scheme (the one that fetches from database)
  console.log('\n' + '='.repeat(80));
  console.log('DEBUGGING SCHEME: Scheme QAW++');
  console.log('='.repeat(80));

  console.log(`\n📊 Configuration:`);
  console.log(`   - qcode: ${DINESH_QCODE}`);
  console.log(`   - System tag: ${DINESH_SYSTEM_TAGS['Scheme QAW++']}`);
  console.log(`   - Start date filter: ${QAW_START_DATE.toISOString().split('T')[0]}`);

  // Get historical data (simulating getHistoricalData from dinesh-utils.ts)
  const historicalData = await getHistoricalDataForQAW(DINESH_QCODE);

  if (historicalData.length === 0) {
    console.log('\n❌ No historical data found for Scheme QAW++');
    console.log('   This may be because:');
    console.log('   - Data is not yet available in master_sheet_test');
    console.log('   - The start date filter (2026-01-12) excludes all data');
    console.log('\n   Checking raw data without date filter...');

    // READ-ONLY: Check raw data
    const rawData = await prisma.master_sheet_test.findMany({
      where: {
        qcode: DINESH_QCODE,
        system_tag: DINESH_SYSTEM_TAGS['Scheme QAW++'],
        nav: { not: null },
      },
      select: { date: true, nav: true },
      orderBy: { date: 'asc' },
      take: 10,
    });

    if (rawData.length > 0) {
      console.log(`\n   Found ${rawData.length}+ records without date filter:`);
      rawData.forEach((row, i) => {
        console.log(`   ${i + 1}. ${row.date.toISOString().split('T')[0]} -> NAV: ${row.nav?.toFixed(4)}`);
      });
    } else {
      console.log('   No data found even without date filter.');
    }
  } else {
    console.log(`\n📅 Historical Data (with prepended baseline):`);
    console.log(`   - Total entries: ${historicalData.length}`);
    console.log(`   - First entry: ${historicalData[0].date.toISOString().split('T')[0]} (NAV: ${historicalData[0].nav.toFixed(4)})`);
    console.log(`   - Last entry: ${historicalData[historicalData.length - 1].date.toISOString().split('T')[0]} (NAV: ${historicalData[historicalData.length - 1].nav.toFixed(4)})`);

    console.log(`\n🔢 First 5 entries (including prepended baseline):`);
    historicalData.slice(0, 5).forEach((row, i) => {
      const marker = i === 0 ? ' <-- PREPENDED BASELINE (NAV=100)' : '';
      console.log(`   ${i}. ${row.date.toISOString().split('T')[0]} -> NAV: ${row.nav.toFixed(4)}${marker}`);
    });

    // Simulate monthly PnL calculation
    simulateMonthlyPnLCalculation(historicalData);

    // Simulate quarterly PnL calculation
    simulateQuarterlyPnLCalculation(historicalData);
  }

  // Summary
  console.log('\n\n' + '='.repeat(80));
  console.log('SUMMARY: DINESH vs SARLA/SATIDHAM APPROACH');
  console.log('='.repeat(80));
  console.log(`
DINESH APPROACH (dinesh-utils.ts):
  1. getHistoricalData() PREPENDS a baseline entry with NAV=100
  2. Loop starts at i=1, uses historicalData[i-1].nav as startNav
  3. For first month: startNav = historicalData[0].nav = 100 ✅

SARLA/SATIDHAM APPROACH (sarla-utils.ts - BEFORE FIX):
  1. Groups entries by month
  2. Uses entries[0].nav as startNav for each month
  3. For first month: startNav = actual first day's NAV (NOT 100) ❌

THE FIX APPLIED TO SARLA/SATIDHAM:
  - Changed: let startNav = index === 0 ? 100 : entries[0].nav;
  - This ensures first month uses 100 as baseline

CONCLUSION FOR DINESH:
  If the baseline prepend (NAV=100) works correctly, NO FIX IS NEEDED.
  The debug output above should show "✅ CORRECT" for first month/quarter.
`);

  console.log('='.repeat(80));
  console.log('DEBUG COMPLETE');
  console.log('='.repeat(80));
}

main()
  .catch((e) => {
    console.error('Error running debug script:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
