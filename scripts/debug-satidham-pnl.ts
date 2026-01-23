/**
 * Script to debug Satidham monthly and quarterly PnL percentage calculations
 *
 * This script traces how NAV values are used to compute PnL percentages,
 * specifically investigating whether the first month uses NAV=100 or actual NAV.
 *
 * Run with: npx tsx scripts/debug-satidham-pnl.ts
 *
 * SAFETY: This script is READ-ONLY - only uses SELECT queries (findMany, $queryRaw SELECT)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Satidham configuration
const SATIDHAM_QCODE = 'QAC00046';
const SATIDHAM_SYSTEM_TAGS: Record<string, string> = {
  'Total Portfolio': 'Total Portfolio Value A',
  'Scheme A': 'Total Portfolio Value A',
  'Scheme B': 'Total Portfolio Value B',
  'Scheme A (Old)': 'Total Portfolio Value Old',
  'Scheme QAW++': 'Zerodha Total Portfolio',
  'Scheme QYE++': 'Zerodha Total Portfolio',
};

// Scheme QAW++ uses a different qcode
const SCHEME_QCODE_OVERRIDE: Record<string, string> = {
  'Scheme QAW++': 'QAC00066',
  'Scheme QYE++': 'QAC00066',
};

function getMonthName(monthIndex: number): string {
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  return months[monthIndex];
}

function getQuarter(month: number): string {
  if (month < 3) return 'q1';
  if (month < 6) return 'q2';
  if (month < 9) return 'q3';
  return 'q4';
}

async function debugScheme(schemeName: string) {
  console.log('\n' + '='.repeat(80));
  console.log(`DEBUGGING SCHEME: ${schemeName}`);
  console.log('='.repeat(80));

  const effectiveQcode = SCHEME_QCODE_OVERRIDE[schemeName] || SATIDHAM_QCODE;
  const systemTag = SATIDHAM_SYSTEM_TAGS[schemeName];

  if (!systemTag) {
    console.log(`⚠️  No system tag mapping found for scheme: ${schemeName}`);
    return;
  }

  console.log(`\n📊 Configuration:`);
  console.log(`   - Effective qcode: ${effectiveQcode}`);
  console.log(`   - System tag: ${systemTag}`);

  // Query 1: Get all NAV data for this scheme
  const navData = await prisma.master_sheet.findMany({
    where: {
      qcode: effectiveQcode,
      system_tag: systemTag,
      nav: { not: null },
    },
    select: {
      date: true,
      nav: true,
      daily_p_l: true,
      portfolio_value: true,
    },
    orderBy: { date: 'asc' },
  });

  if (navData.length === 0) {
    console.log(`❌ No NAV data found for ${schemeName}`);
    return;
  }

  console.log(`\n📅 Data Range:`);
  console.log(`   - First date: ${navData[0].date.toISOString().split('T')[0]}`);
  console.log(`   - Last date: ${navData[navData.length - 1].date.toISOString().split('T')[0]}`);
  console.log(`   - Total records: ${navData.length}`);

  // Show first few NAV values
  console.log(`\n🔢 First 5 NAV values:`);
  navData.slice(0, 5).forEach((row, i) => {
    const dailyPL = row.daily_p_l != null ? Number(row.daily_p_l).toFixed(2) : 'null';
    console.log(`   ${i + 1}. ${row.date.toISOString().split('T')[0]} -> NAV: ${row.nav?.toFixed(4)}, Daily P/L: ${dailyPL}`);
  });

  // Group by year-month for monthly analysis
  const monthlyData: Record<string, { entries: Array<{ date: string; nav: number; pnl: number }> }> = {};

  navData.forEach(entry => {
    const dateStr = entry.date.toISOString().split('T')[0];
    const [year, month] = dateStr.split('-').map(Number);
    const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

    if (!monthlyData[yearMonth]) {
      monthlyData[yearMonth] = { entries: [] };
    }
    monthlyData[yearMonth].entries.push({
      date: dateStr,
      nav: entry.nav || 0,
      pnl: Number(entry.daily_p_l) || 0,
    });
  });

  const sortedYearMonths = Object.keys(monthlyData).sort();

  console.log(`\n📆 MONTHLY PNL CALCULATION TRACE:`);
  console.log('-'.repeat(80));

  sortedYearMonths.forEach((yearMonth, index) => {
    const [year, month] = yearMonth.split('-').map(Number);
    const monthName = getMonthName(month - 1);
    const entries = monthlyData[yearMonth].entries;

    if (entries.length === 0) return;

    // Current logic: startNav is previous month's last NAV, or first entry's NAV for first month
    let startNavActual = entries[0].nav;
    let startNavSource = 'first entry of month';

    if (index > 0) {
      const prevYearMonth = sortedYearMonths[index - 1];
      const prevEntries = monthlyData[prevYearMonth].entries;
      if (prevEntries.length > 0) {
        startNavActual = prevEntries[prevEntries.length - 1].nav;
        startNavSource = `last entry of ${prevYearMonth}`;
      }
    }

    const endNav = entries[entries.length - 1].nav;
    const totalPnL = entries.reduce((sum, e) => sum + e.pnl, 0);

    // Calculate percentage using ACTUAL logic (what code does)
    const percentActual = startNavActual > 0
      ? ((endNav - startNavActual) / startNavActual) * 100
      : 0;

    // Calculate percentage if we used 100 as starting NAV for first month
    const startNav100 = index === 0 ? 100 : startNavActual;
    const percent100 = startNav100 > 0
      ? ((endNav - startNav100) / startNav100) * 100
      : 0;

    const isFirstMonth = index === 0;
    const marker = isFirstMonth ? '🔴 FIRST MONTH' : '';

    console.log(`\n${year} ${monthName} ${marker}`);
    console.log(`   Entries: ${entries.length} days`);
    console.log(`   First entry NAV: ${entries[0].nav.toFixed(4)} (${entries[0].date})`);
    console.log(`   Last entry NAV:  ${endNav.toFixed(4)} (${entries[entries.length - 1].date})`);
    console.log(`   Start NAV used:  ${startNavActual.toFixed(4)} (source: ${startNavSource})`);
    console.log(`   `);
    console.log(`   📈 CURRENT LOGIC: percent = ((${endNav.toFixed(4)} - ${startNavActual.toFixed(4)}) / ${startNavActual.toFixed(4)}) * 100`);
    console.log(`                   = ${percentActual.toFixed(2)}%`);

    if (isFirstMonth) {
      console.log(`   `);
      console.log(`   📈 IF USING 100:  percent = ((${endNav.toFixed(4)} - 100) / 100) * 100`);
      console.log(`                   = ${percent100.toFixed(2)}%`);
      console.log(`   `);
      console.log(`   ⚠️  DIFFERENCE: ${(percentActual - percent100).toFixed(2)} percentage points`);
    }

    console.log(`   Cash P/L: ${totalPnL.toFixed(2)}`);
  });

  // Quarterly analysis
  console.log(`\n\n📆 QUARTERLY PNL CALCULATION TRACE:`);
  console.log('-'.repeat(80));

  const quarterlyData: Record<string, { entries: Array<{ date: string; nav: number; pnl: number }> }> = {};

  navData.forEach(entry => {
    const date = new Date(entry.date);
    const year = date.getUTCFullYear();
    const quarter = getQuarter(date.getUTCMonth());
    const yearQuarter = `${year}-${quarter}`;

    if (!quarterlyData[yearQuarter]) {
      quarterlyData[yearQuarter] = { entries: [] };
    }
    quarterlyData[yearQuarter].entries.push({
      date: entry.date.toISOString().split('T')[0],
      nav: entry.nav || 0,
      pnl: Number(entry.daily_p_l) || 0,
    });
  });

  const sortedYearQuarters = Object.keys(quarterlyData).sort((a, b) => {
    const [yearA, qA] = a.split('-');
    const [yearB, qB] = b.split('-');
    const yearCompare = parseInt(yearA) - parseInt(yearB);
    if (yearCompare !== 0) return yearCompare;
    return qA.localeCompare(qB);
  });

  sortedYearQuarters.forEach((yearQuarter, index) => {
    const [year, quarter] = yearQuarter.split('-');
    const entries = quarterlyData[yearQuarter].entries;

    if (entries.length === 0) return;

    let startNavActual = entries[0].nav;
    let startNavSource = 'first entry of quarter';

    if (index > 0) {
      const prevYearQuarter = sortedYearQuarters[index - 1];
      const prevEntries = quarterlyData[prevYearQuarter].entries;
      if (prevEntries.length > 0) {
        startNavActual = prevEntries[prevEntries.length - 1].nav;
        startNavSource = `last entry of ${prevYearQuarter}`;
      }
    }

    const endNav = entries[entries.length - 1].nav;
    const totalPnL = entries.reduce((sum, e) => sum + e.pnl, 0);

    const percentActual = startNavActual > 0
      ? ((endNav - startNavActual) / startNavActual) * 100
      : 0;

    const startNav100 = index === 0 ? 100 : startNavActual;
    const percent100 = startNav100 > 0
      ? ((endNav - startNav100) / startNav100) * 100
      : 0;

    const isFirstQuarter = index === 0;
    const marker = isFirstQuarter ? '🔴 FIRST QUARTER' : '';

    console.log(`\n${year} ${quarter.toUpperCase()} ${marker}`);
    console.log(`   Entries: ${entries.length} days`);
    console.log(`   First entry NAV: ${entries[0].nav.toFixed(4)} (${entries[0].date})`);
    console.log(`   Last entry NAV:  ${endNav.toFixed(4)} (${entries[entries.length - 1].date})`);
    console.log(`   Start NAV used:  ${startNavActual.toFixed(4)} (source: ${startNavSource})`);
    console.log(`   `);
    console.log(`   📈 CURRENT LOGIC: percent = ((${endNav.toFixed(4)} - ${startNavActual.toFixed(4)}) / ${startNavActual.toFixed(4)}) * 100`);
    console.log(`                   = ${percentActual.toFixed(2)}%`);

    if (isFirstQuarter) {
      console.log(`   `);
      console.log(`   📈 IF USING 100:  percent = ((${endNav.toFixed(4)} - 100) / 100) * 100`);
      console.log(`                   = ${percent100.toFixed(2)}%`);
      console.log(`   `);
      console.log(`   ⚠️  DIFFERENCE: ${(percentActual - percent100).toFixed(2)} percentage points`);
    }

    console.log(`   Cash P/L: ${totalPnL.toFixed(2)}`);
  });
}

async function main() {
  console.log('='.repeat(80));
  console.log('SATIDHAM MONTHLY/QUARTERLY PNL DEBUG SCRIPT');
  console.log('='.repeat(80));
  console.log(`\nThis script traces how monthly and quarterly PnL percentages are calculated.`);
  console.log(`Specifically, it checks whether the FIRST month/quarter uses NAV=100 or actual NAV.\n`);

  // Check what schemes/tags exist for Satidham
  console.log('📋 Available system tags for Satidham (QAC00046):');
  const tags = await prisma.$queryRaw<Array<{ system_tag: string; min_date: Date; max_date: Date; count: bigint }>>`
    SELECT
      system_tag,
      MIN(date) as min_date,
      MAX(date) as max_date,
      COUNT(*)::bigint as count
    FROM master_sheet
    WHERE qcode = 'QAC00046' AND nav IS NOT NULL
    GROUP BY system_tag
    ORDER BY min_date
  `;

  tags.forEach(tag => {
    console.log(`   - "${tag.system_tag}": ${tag.min_date.toISOString().split('T')[0]} to ${tag.max_date.toISOString().split('T')[0]} (${tag.count} records)`);
  });

  // Also check QAC00066 (Scheme QAW++)
  console.log('\n📋 Available system tags for QAC00066 (Scheme QAW++/QYE++):');
  const tags66 = await prisma.$queryRaw<Array<{ system_tag: string; min_date: Date; max_date: Date; count: bigint }>>`
    SELECT
      system_tag,
      MIN(date) as min_date,
      MAX(date) as max_date,
      COUNT(*)::bigint as count
    FROM master_sheet
    WHERE qcode = 'QAC00066' AND nav IS NOT NULL
    GROUP BY system_tag
    ORDER BY min_date
  `;

  tags66.forEach(tag => {
    console.log(`   - "${tag.system_tag}": ${tag.min_date.toISOString().split('T')[0]} to ${tag.max_date.toISOString().split('T')[0]} (${tag.count} records)`);
  });

  // Debug each scheme
  const schemesToDebug = ['Scheme A', 'Scheme B', 'Scheme QAW++', 'Scheme QYE++'];

  for (const scheme of schemesToDebug) {
    await debugScheme(scheme);
  }

  // Summary
  console.log('\n\n' + '='.repeat(80));
  console.log('SUMMARY: THE ISSUE');
  console.log('='.repeat(80));
  console.log(`
CURRENT LOGIC (sarla-utils.ts):
  - For the FIRST month: startNav = entries[0].nav (actual NAV from database)
  - For subsequent months: startNav = previous month's last NAV

YOUR TEAMMATE'S EXPECTATION:
  - For the FIRST month: startNav should be 100 (normalized starting point)

THE DIFFERENCE:
  - If first day's NAV is already 100.0000, there's no difference
  - If first day's NAV is different (e.g., 99.5 or 101.2), percentages will differ

LOCATION IN CODE:
  - sarla-utils.ts:2124-2131 (monthly)
  - sarla-utils.ts:2374-2381 (monthly for other schemes)
  - sarla-utils.ts:2722-2737 (quarterly)
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
