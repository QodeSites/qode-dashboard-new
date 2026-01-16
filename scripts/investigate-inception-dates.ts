/**
 * Investigation Script: Inception Dates for Satidham (QUS0010)
 *
 * PURPOSE: Understand why all schemes show 17/11/2024 as inception date
 *
 * THIS SCRIPT IS READ-ONLY - NO DATABASE MODIFICATIONS
 * All queries are SELECT operations only.
 *
 * Run with: npx ts-node scripts/investigate-inception-dates.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Satidham system tags mapping (from sarla-utils.ts)
const SATIDHAM_SYSTEM_TAGS: Record<string, string> = {
  "Total Portfolio": "Total Portfolio Value A",
  "Scheme A": "Total Portfolio Value A",
  "Scheme B": "Total Portfolio Value B",
  "Scheme A (Old)": "Total Portfolio Value Old",
  "Scheme PMS QAW": "PMS QAW Portfolio",
  "Scheme QAW++ QUS00081": "Zerodha Total Portfolio",
};

// Expected inception dates from hardcoded data
const EXPECTED_INCEPTION_DATES: Record<string, string> = {
  "Scheme A": "2024-11-17",
  "Scheme B": "2024-12-05",
  "Scheme A (Old)": "2024-06-18",
};

async function main() {
  console.log("=".repeat(80));
  console.log("INVESTIGATION: Inception Dates for Satidham (QAC00046)");
  console.log("=".repeat(80));
  console.log("\nAll queries are READ-ONLY (SELECT only)\n");

  // 1. Get all distinct system_tags for QAC00046
  console.log("─".repeat(80));
  console.log("1. ALL DISTINCT SYSTEM_TAGS FOR QAC00046");
  console.log("─".repeat(80));

  const distinctTags = await prisma.master_sheet.findMany({
    where: { qcode: "QAC00046" },
    distinct: ["system_tag"],
    select: { system_tag: true },
  });

  console.log("\nAvailable system_tags in master_sheet for QAC00046:");
  distinctTags.forEach((t, i) => {
    console.log(`  ${i + 1}. "${t.system_tag}"`);
  });

  // 2. For each Satidham scheme, find MIN and MAX dates
  console.log("\n" + "─".repeat(80));
  console.log("2. DATE RANGES FOR EACH SATIDHAM SCHEME");
  console.log("─".repeat(80));

  for (const [scheme, systemTag] of Object.entries(SATIDHAM_SYSTEM_TAGS)) {
    if (scheme === "Scheme PMS QAW") {
      console.log(`\n${scheme} → Uses pms_master_sheet (separate table)`);
      continue;
    }

    const qcode = scheme === "Scheme QAW++ QUS00081" ? "QAC00066" : "QAC00046";

    const minDate = await prisma.master_sheet.findFirst({
      where: { qcode, system_tag: systemTag },
      orderBy: { date: "asc" },
      select: { date: true },
    });

    const maxDate = await prisma.master_sheet.findFirst({
      where: { qcode, system_tag: systemTag },
      orderBy: { date: "desc" },
      select: { date: true },
    });

    const count = await prisma.master_sheet.count({
      where: { qcode, system_tag: systemTag },
    });

    const expectedDate = EXPECTED_INCEPTION_DATES[scheme];
    const actualMinDate = minDate?.date?.toISOString().split("T")[0] || "NO DATA";
    const match = expectedDate === actualMinDate ? "✓" : "✗";

    console.log(`\n${scheme}`);
    console.log(`  System Tag: "${systemTag}"`);
    console.log(`  Source qcode: ${qcode}`);
    console.log(`  Record Count: ${count}`);
    console.log(`  Date Range: ${actualMinDate} → ${maxDate?.date?.toISOString().split("T")[0] || "NO DATA"}`);
    if (expectedDate) {
      console.log(`  Expected Inception: ${expectedDate} ${match}`);
    }
  }

  // 3. Check first few records for each scheme to understand data pattern
  console.log("\n" + "─".repeat(80));
  console.log("3. FIRST 5 RECORDS FOR EACH SCHEME (checking data quality)");
  console.log("─".repeat(80));

  for (const [scheme, systemTag] of Object.entries(SATIDHAM_SYSTEM_TAGS)) {
    if (scheme === "Scheme PMS QAW") continue;

    const qcode = scheme === "Scheme QAW++ QUS00081" ? "QAC00066" : "QAC00046";

    const firstRecords = await prisma.master_sheet.findMany({
      where: { qcode, system_tag: systemTag },
      orderBy: { date: "asc" },
      take: 5,
      select: { date: true, nav: true, drawdown: true, portfolio_value: true },
    });

    console.log(`\n${scheme} (first 5 records):`);
    if (firstRecords.length === 0) {
      console.log("  NO DATA FOUND");
    } else {
      firstRecords.forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.date.toISOString().split("T")[0]} | NAV: ${r.nav} | DD: ${r.drawdown} | PV: ${r.portfolio_value}`);
      });
    }
  }

  // 4. Check if there's data BEFORE 2024-11-17 that might be filtered out
  console.log("\n" + "─".repeat(80));
  console.log("4. CHECKING FOR DATA BEFORE 2024-11-17 (may be filtered by nav/drawdown nulls)");
  console.log("─".repeat(80));

  const cutoffDate = new Date("2024-11-17");

  for (const [scheme, systemTag] of Object.entries(SATIDHAM_SYSTEM_TAGS)) {
    if (scheme === "Scheme PMS QAW") continue;

    const qcode = scheme === "Scheme QAW++ QUS00081" ? "QAC00066" : "QAC00046";

    // Check for ANY records before cutoff (regardless of nav/drawdown)
    const recordsBeforeCutoff = await prisma.master_sheet.count({
      where: {
        qcode,
        system_tag: systemTag,
        date: { lt: cutoffDate },
      },
    });

    // Check for records before cutoff WITH valid nav/drawdown
    const validRecordsBeforeCutoff = await prisma.master_sheet.count({
      where: {
        qcode,
        system_tag: systemTag,
        date: { lt: cutoffDate },
        nav: { not: null },
        drawdown: { not: null },
      },
    });

    console.log(`\n${scheme}:`);
    console.log(`  Total records before 2024-11-17: ${recordsBeforeCutoff}`);
    console.log(`  Records with valid nav/drawdown before 2024-11-17: ${validRecordsBeforeCutoff}`);

    if (recordsBeforeCutoff > 0 && validRecordsBeforeCutoff === 0) {
      console.log(`  ⚠️  Data exists but has NULL nav/drawdown (filtered out by getHistoricalData)`);

      // Sample the data
      const sampleNullData = await prisma.master_sheet.findMany({
        where: {
          qcode,
          system_tag: systemTag,
          date: { lt: cutoffDate },
        },
        orderBy: { date: "asc" },
        take: 3,
        select: { date: true, nav: true, drawdown: true },
      });

      console.log(`  Sample records with NULL values:`);
      sampleNullData.forEach((r) => {
        console.log(`    ${r.date.toISOString().split("T")[0]} | NAV: ${r.nav} | DD: ${r.drawdown}`);
      });
    }
  }

  // 5. Check PMS data separately
  console.log("\n" + "─".repeat(80));
  console.log("5. PMS DATA CHECK (pms_master_sheet)");
  console.log("─".repeat(80));

  const pmsMinDate = await prisma.pms_master_sheet.findFirst({
    where: { account_code: "QAW00041" },
    orderBy: { report_date: "asc" },
    select: { report_date: true },
  });

  const pmsMaxDate = await prisma.pms_master_sheet.findFirst({
    where: { account_code: "QAW00041" },
    orderBy: { report_date: "desc" },
    select: { report_date: true },
  });

  const pmsCount = await prisma.pms_master_sheet.count({
    where: { account_code: "QAW00041" },
  });

  console.log(`\nScheme PMS QAW (account_code: QAW00041):`);
  console.log(`  Record Count: ${pmsCount}`);
  console.log(`  Date Range: ${pmsMinDate?.report_date?.toISOString().split("T")[0] || "NO DATA"} → ${pmsMaxDate?.report_date?.toISOString().split("T")[0] || "NO DATA"}`);

  // 6. Summary
  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));
  console.log(`
Based on this investigation, we can determine:

1. Whether the database actually has data before 2024-11-17
2. Whether data exists but has NULL nav/drawdown values (filtered out)
3. Whether the hardcoded inception dates match database reality
4. What the appropriate fix should be:
   - If data exists but is filtered: Fix the query or use hardcoded dates
   - If data doesn't exist: Use hardcoded dates
   - If data is correct: The bug is elsewhere
`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Error:", e);
  await prisma.$disconnect();
  process.exit(1);
});
