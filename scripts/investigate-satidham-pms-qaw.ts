/**
 * Investigation script for Satidham Scheme PMS QAW
 *
 * This script investigates why Q2 2025 and May 2025 percentage PnL
 * might be showing incorrect values.
 *
 * Run with: npx ts-node scripts/investigate-satidham-pms-qaw.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SATIDHAM_PMS_ACCOUNT = "QAW00041"; // Satidham's PMS account code

async function main() {
  console.log("=".repeat(80));
  console.log("SATIDHAM SCHEME PMS QAW INVESTIGATION");
  console.log("Account Code:", SATIDHAM_PMS_ACCOUNT);
  console.log("=".repeat(80));

  // 1. Get all data for 2025
  console.log("\n1. ALL 2025 DATA SUMMARY");
  console.log("-".repeat(60));

  const allData2025 = await prisma.pms_master_sheet.findMany({
    where: {
      account_code: SATIDHAM_PMS_ACCOUNT,
      report_date: {
        gte: new Date("2025-01-01"),
        lte: new Date("2025-12-31"),
      },
    },
    select: {
      report_date: true,
      nav: true,
      pnl: true,
      portfolio_value: true,
      cash_in_out: true,
    },
    orderBy: { report_date: "asc" },
  });

  console.log(`Total 2025 records: ${allData2025.length}`);

  if (allData2025.length === 0) {
    console.log("NO DATA FOUND for 2025!");
    await prisma.$disconnect();
    return;
  }

  // 2. Group by month and show summary
  console.log("\n2. MONTHLY BREAKDOWN FOR 2025");
  console.log("-".repeat(60));

  const monthlyGroups: Record<string, typeof allData2025> = {};
  allData2025.forEach((d) => {
    const month = d.report_date.toISOString().slice(0, 7);
    if (!monthlyGroups[month]) monthlyGroups[month] = [];
    monthlyGroups[month].push(d);
  });

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  console.log("Month     | Records | First NAV | Last NAV  | % Change  | Total PnL");
  console.log("-".repeat(75));

  let prevMonthLastNav: number | null = null;

  Object.keys(monthlyGroups).sort().forEach((month) => {
    const records = monthlyGroups[month];
    const firstNav = Number(records[0].nav);
    const lastNav = Number(records[records.length - 1].nav);
    const totalPnl = records.reduce((sum, r) => sum + Number(r.pnl || 0), 0);

    // Calculate percentage change from previous month's end
    let percentChange = "-";
    if (prevMonthLastNav !== null && prevMonthLastNav > 0) {
      const pct = ((lastNav - prevMonthLastNav) / prevMonthLastNav) * 100;
      percentChange = pct.toFixed(2) + "%";
    } else if (firstNav > 0) {
      // For first month, use first NAV as starting point (should be ~100)
      const pct = ((lastNav - 100) / 100) * 100;
      percentChange = pct.toFixed(2) + "% (from 100)";
    }

    const monthIdx = parseInt(month.slice(5, 7)) - 1;
    const monthLabel = monthNames[monthIdx] + " " + month.slice(0, 4);

    console.log(
      `${monthLabel.padEnd(9)} | ${String(records.length).padStart(7)} | ${firstNav.toFixed(2).padStart(9)} | ${lastNav.toFixed(2).padStart(9)} | ${percentChange.padStart(15)} | ${totalPnl.toFixed(2)}`
    );

    prevMonthLastNav = lastNav;
  });

  // 3. Q2 2025 specific analysis
  console.log("\n3. Q2 2025 DETAILED ANALYSIS (April, May, June)");
  console.log("-".repeat(60));

  // Get Q1 end (March) for starting NAV
  const q1End = await prisma.pms_master_sheet.findFirst({
    where: {
      account_code: SATIDHAM_PMS_ACCOUNT,
      report_date: {
        gte: new Date("2025-03-01"),
        lte: new Date("2025-03-31"),
      },
    },
    select: { report_date: true, nav: true },
    orderBy: { report_date: "desc" },
  });

  console.log("Q1 2025 End (starting point for Q2):");
  if (q1End) {
    console.log(`  Date: ${q1End.report_date.toISOString().slice(0, 10)}`);
    console.log(`  NAV: ${Number(q1End.nav).toFixed(2)}`);
  } else {
    console.log("  NO DATA FOUND for March 2025");
  }

  // Q2 data
  const q2Data = await prisma.pms_master_sheet.findMany({
    where: {
      account_code: SATIDHAM_PMS_ACCOUNT,
      report_date: {
        gte: new Date("2025-04-01"),
        lte: new Date("2025-06-30"),
      },
    },
    select: {
      report_date: true,
      nav: true,
      pnl: true,
    },
    orderBy: { report_date: "asc" },
  });

  if (q2Data.length > 0) {
    const q2FirstNav = Number(q2Data[0].nav);
    const q2LastNav = Number(q2Data[q2Data.length - 1].nav);
    const q2TotalPnl = q2Data.reduce((sum, r) => sum + Number(r.pnl || 0), 0);

    console.log("\nQ2 2025 Summary:");
    console.log(`  Total records: ${q2Data.length}`);
    console.log(`  First record: ${q2Data[0].report_date.toISOString().slice(0, 10)}, NAV=${q2FirstNav.toFixed(2)}`);
    console.log(`  Last record: ${q2Data[q2Data.length - 1].report_date.toISOString().slice(0, 10)}, NAV=${q2LastNav.toFixed(2)}`);
    console.log(`  Total PnL: ${q2TotalPnl.toFixed(2)}`);

    // Calculate Q2 percentage return
    if (q1End) {
      const startNav = Number(q1End.nav);
      const q2Percent = ((q2LastNav - startNav) / startNav) * 100;
      console.log(`\n  Q2 % Return (from Q1 end NAV ${startNav.toFixed(2)}): ${q2Percent.toFixed(2)}%`);
    }

    // Alternative: using first Q2 NAV as start
    const q2PercentAlt = ((q2LastNav - q2FirstNav) / q2FirstNav) * 100;
    console.log(`  Q2 % Return (from Q2 first NAV ${q2FirstNav.toFixed(2)}): ${q2PercentAlt.toFixed(2)}%`);
  } else {
    console.log("\nNO DATA FOUND for Q2 2025");
  }

  // 4. May 2025 specific analysis
  console.log("\n4. MAY 2025 DETAILED ANALYSIS");
  console.log("-".repeat(60));

  // Get April end for starting NAV
  const aprilEnd = await prisma.pms_master_sheet.findFirst({
    where: {
      account_code: SATIDHAM_PMS_ACCOUNT,
      report_date: {
        gte: new Date("2025-04-01"),
        lte: new Date("2025-04-30"),
      },
    },
    select: { report_date: true, nav: true },
    orderBy: { report_date: "desc" },
  });

  console.log("April 2025 End (starting point for May):");
  if (aprilEnd) {
    console.log(`  Date: ${aprilEnd.report_date.toISOString().slice(0, 10)}`);
    console.log(`  NAV: ${Number(aprilEnd.nav).toFixed(2)}`);
  } else {
    console.log("  NO DATA FOUND for April 2025");
  }

  // May data
  const mayData = await prisma.pms_master_sheet.findMany({
    where: {
      account_code: SATIDHAM_PMS_ACCOUNT,
      report_date: {
        gte: new Date("2025-05-01"),
        lte: new Date("2025-05-31"),
      },
    },
    select: {
      report_date: true,
      nav: true,
      pnl: true,
    },
    orderBy: { report_date: "asc" },
  });

  if (mayData.length > 0) {
    const mayFirstNav = Number(mayData[0].nav);
    const mayLastNav = Number(mayData[mayData.length - 1].nav);
    const mayTotalPnl = mayData.reduce((sum, r) => sum + Number(r.pnl || 0), 0);

    console.log("\nMay 2025 Summary:");
    console.log(`  Total records: ${mayData.length}`);
    console.log(`  First record: ${mayData[0].report_date.toISOString().slice(0, 10)}, NAV=${mayFirstNav.toFixed(2)}`);
    console.log(`  Last record: ${mayData[mayData.length - 1].report_date.toISOString().slice(0, 10)}, NAV=${mayLastNav.toFixed(2)}`);
    console.log(`  Total PnL: ${mayTotalPnl.toFixed(2)}`);

    // Calculate May percentage return
    if (aprilEnd) {
      const startNav = Number(aprilEnd.nav);
      const mayPercent = ((mayLastNav - startNav) / startNav) * 100;
      console.log(`\n  May % Return (from April end NAV ${startNav.toFixed(2)}): ${mayPercent.toFixed(2)}%`);
    }

    // Alternative: using first May NAV as start
    const mayPercentAlt = ((mayLastNav - mayFirstNav) / mayFirstNav) * 100;
    console.log(`  May % Return (from May first NAV ${mayFirstNav.toFixed(2)}): ${mayPercentAlt.toFixed(2)}%`);

    // Show all May daily data
    console.log("\n  Daily May 2025 Data:");
    console.log("  Date       | NAV      | PnL");
    console.log("  " + "-".repeat(40));
    mayData.forEach((d) => {
      const date = d.report_date.toISOString().slice(0, 10);
      const nav = Number(d.nav).toFixed(2);
      const pnl = Number(d.pnl).toFixed(2);
      console.log(`  ${date} | ${nav.padStart(8)} | ${pnl}`);
    });
  } else {
    console.log("\nNO DATA FOUND for May 2025");
  }

  // 5. Check for data gaps
  console.log("\n5. DATA CONTINUITY CHECK");
  console.log("-".repeat(60));

  let prevDate: Date | null = null;
  const gaps: string[] = [];

  allData2025.forEach((d) => {
    if (prevDate) {
      const daysDiff = Math.floor(
        (d.report_date.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysDiff > 5) {
        gaps.push(
          `Gap of ${daysDiff} days between ${prevDate.toISOString().slice(0, 10)} and ${d.report_date.toISOString().slice(0, 10)}`
        );
      }
    }
    prevDate = d.report_date;
  });

  if (gaps.length > 0) {
    console.log("Large gaps found (>5 days):");
    gaps.forEach((g) => console.log(`  - ${g}`));
  } else {
    console.log("No significant data gaps found.");
  }

  console.log("\n" + "=".repeat(80));
  console.log("END OF INVESTIGATION");
  console.log("=".repeat(80));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Error:", e);
  prisma.$disconnect();
  process.exit(1);
});
