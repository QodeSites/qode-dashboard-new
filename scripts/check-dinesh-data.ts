/**
 * Diagnostic script to check Dinesh's data in the database
 *
 * This script is READ-ONLY - it only performs SELECT queries
 *
 * Run with: npx ts-node scripts/check-dinesh-data.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DINESH_QCODE = "QAC00053";
const QAW_START_DATE = new Date("2026-01-12");

async function main() {
  console.log("=".repeat(80));
  console.log("DINESH DATA DIAGNOSTIC REPORT");
  console.log("qcode:", DINESH_QCODE);
  console.log("=".repeat(80));

  // 1. Check all distinct system_tags for this qcode
  console.log("\n1. DISTINCT SYSTEM TAGS FOR", DINESH_QCODE);
  console.log("-".repeat(60));

  const systemTags = await prisma.master_sheet.findMany({
    where: { qcode: DINESH_QCODE },
    distinct: ["system_tag"],
    select: { system_tag: true },
    orderBy: { system_tag: "asc" },
  });

  if (systemTags.length === 0) {
    console.log("  NO DATA FOUND for this qcode in master_sheet");
  } else {
    console.log(`  Found ${systemTags.length} distinct system_tags:`);
    systemTags.forEach((t, i) => {
      console.log(`    ${i + 1}. "${t.system_tag}"`);
    });
  }

  // 2. Check "Zerodha Total Portfolio" data (QAW++ tag)
  console.log("\n2. ZERODHA TOTAL PORTFOLIO DATA (for QAW++)");
  console.log("-".repeat(60));

  const zerodhaTotalData = await prisma.master_sheet.findMany({
    where: {
      qcode: DINESH_QCODE,
      system_tag: "Zerodha Total Portfolio",
    },
    select: {
      date: true,
      portfolio_value: true,
      capital_in_out: true,
      nav: true,
    },
    orderBy: { date: "asc" },
  });

  if (zerodhaTotalData.length === 0) {
    console.log("  NO DATA FOUND for 'Zerodha Total Portfolio' system_tag");
  } else {
    console.log(`  Found ${zerodhaTotalData.length} rows:`);
    console.log("  Date       | Capital In/Out    | NAV     | Portfolio Value");
    console.log("  " + "-".repeat(70));
    zerodhaTotalData.forEach((row) => {
      const date = row.date.toISOString().split("T")[0];
      const capitalInOut = row.capital_in_out?.toNumber().toLocaleString("en-IN") || "null";
      const nav = row.nav?.toNumber().toFixed(2) || "null";
      const portfolioValue = row.portfolio_value?.toNumber().toLocaleString("en-IN") || "null";
      console.log(`  ${date} | ${capitalInOut.padStart(17)} | ${nav.padStart(7)} | ${portfolioValue}`);
    });
  }

  // 3. Check data after QAW_START_DATE specifically
  console.log("\n3. ZERODHA TOTAL PORTFOLIO DATA AFTER", QAW_START_DATE.toISOString().split("T")[0]);
  console.log("-".repeat(60));

  const zerodhaTotalAfterDate = await prisma.master_sheet.findMany({
    where: {
      qcode: DINESH_QCODE,
      system_tag: "Zerodha Total Portfolio",
      date: { gte: QAW_START_DATE },
    },
    select: {
      date: true,
      capital_in_out: true,
    },
    orderBy: { date: "asc" },
  });

  if (zerodhaTotalAfterDate.length === 0) {
    console.log("  NO DATA FOUND after", QAW_START_DATE.toISOString().split("T")[0]);
  } else {
    console.log(`  Found ${zerodhaTotalAfterDate.length} rows after ${QAW_START_DATE.toISOString().split("T")[0]}`);
  }

  // 4. Sum of capital_in_out for Zerodha Total Portfolio (after QAW start)
  console.log("\n4. SUM OF CAPITAL_IN_OUT FOR ZERODHA TOTAL PORTFOLIO (>= 2026-01-12)");
  console.log("-".repeat(60));

  const depositSum = await prisma.master_sheet.aggregate({
    where: {
      qcode: DINESH_QCODE,
      system_tag: "Zerodha Total Portfolio",
      date: { gte: QAW_START_DATE },
      capital_in_out: { not: null },
    },
    _sum: { capital_in_out: true },
    _count: true,
  });

  console.log(`  Rows with non-null capital_in_out: ${depositSum._count}`);
  console.log(`  Sum of capital_in_out: ${depositSum._sum.capital_in_out?.toNumber().toLocaleString("en-IN") || 0}`);

  // 5. Check QTF Zerodha Total Portfolio data (for reference)
  console.log("\n5. QTF ZERODHA TOTAL PORTFOLIO DATA (frozen scheme reference)");
  console.log("-".repeat(60));

  const qtfDataCount = await prisma.master_sheet.count({
    where: {
      qcode: DINESH_QCODE,
      system_tag: "QTF Zerodha Total Portfolio",
    },
  });

  console.log(`  Total rows: ${qtfDataCount}`);

  if (qtfDataCount > 0) {
    const qtfFirstLast = await prisma.master_sheet.findMany({
      where: {
        qcode: DINESH_QCODE,
        system_tag: "QTF Zerodha Total Portfolio",
      },
      select: {
        date: true,
        capital_in_out: true,
        nav: true,
      },
      orderBy: { date: "asc" },
      take: 3,
    });

    const qtfLast = await prisma.master_sheet.findMany({
      where: {
        qcode: DINESH_QCODE,
        system_tag: "QTF Zerodha Total Portfolio",
      },
      select: {
        date: true,
        capital_in_out: true,
        nav: true,
      },
      orderBy: { date: "desc" },
      take: 3,
    });

    console.log("  First 3 rows:");
    qtfFirstLast.forEach((row) => {
      const date = row.date.toISOString().split("T")[0];
      const capitalInOut = row.capital_in_out?.toNumber().toLocaleString("en-IN") || "0";
      const nav = row.nav?.toNumber().toFixed(2) || "null";
      console.log(`    ${date} | capital_in_out: ${capitalInOut} | nav: ${nav}`);
    });

    console.log("  Last 3 rows:");
    qtfLast.reverse().forEach((row) => {
      const date = row.date.toISOString().split("T")[0];
      const capitalInOut = row.capital_in_out?.toNumber().toLocaleString("en-IN") || "0";
      const nav = row.nav?.toNumber().toFixed(2) || "null";
      console.log(`    ${date} | capital_in_out: ${capitalInOut} | nav: ${nav}`);
    });
  }

  // 6. Summary
  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));
  console.log(`  - Total system_tags found: ${systemTags.length}`);
  console.log(`  - Zerodha Total Portfolio rows: ${zerodhaTotalData.length}`);
  console.log(`  - Zerodha Total Portfolio rows after 2026-01-12: ${zerodhaTotalAfterDate.length}`);
  console.log(`  - QTF Zerodha Total Portfolio rows: ${qtfDataCount}`);
  console.log(`  - Sum of capital_in_out (QAW++): ${depositSum._sum.capital_in_out?.toNumber().toLocaleString("en-IN") || 0}`);
  console.log("");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Error:", e);
  prisma.$disconnect();
  process.exit(1);
});
