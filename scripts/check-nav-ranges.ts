/**
 * Check NAV ranges for different data sources
 *
 * This helps understand which data sources have NAV normalized to 100
 * vs those that don't.
 *
 * Run with: npx ts-node scripts/check-nav-ranges.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=".repeat(80));
  console.log("NAV RANGES CHECK - Satidham (QAC00046)");
  console.log("=".repeat(80));

  // 1. Check PMS data (pms_master_sheet) - QAW00041
  console.log("\n1. PMS DATA (pms_master_sheet) - Account: QAW00041");
  console.log("-".repeat(60));

  const pmsData = await prisma.pms_master_sheet.findMany({
    where: { account_code: "QAW00041" },
    select: { nav: true, report_date: true },
    orderBy: { report_date: "asc" },
    take: 5,
  });

  const pmsDataLast = await prisma.pms_master_sheet.findMany({
    where: { account_code: "QAW00041" },
    select: { nav: true, report_date: true },
    orderBy: { report_date: "desc" },
    take: 3,
  });

  if (pmsData.length > 0) {
    console.log("First 5 records:");
    pmsData.forEach((d) => {
      console.log(`  ${d.report_date.toISOString().slice(0, 10)}: NAV = ${Number(d.nav).toFixed(2)}`);
    });
    console.log("Last 3 records:");
    pmsDataLast.reverse().forEach((d) => {
      console.log(`  ${d.report_date.toISOString().slice(0, 10)}: NAV = ${Number(d.nav).toFixed(2)}`);
    });
  } else {
    console.log("  No data found");
  }

  // 2. Check master_sheet for various system tags
  const systemTags = [
    "Total Portfolio Value A",
    "Total Portfolio Value B",
    "Zerodha Total Portfolio",
    "QYE Total Portfolio Value",
  ];

  for (const tag of systemTags) {
    console.log(`\n2. MASTER_SHEET - Tag: "${tag}" (QAC00046)`);
    console.log("-".repeat(60));

    const data = await prisma.master_sheet.findMany({
      where: { qcode: "QAC00046", system_tag: tag },
      select: { nav: true, date: true },
      orderBy: { date: "asc" },
      take: 5,
    });

    const dataLast = await prisma.master_sheet.findMany({
      where: { qcode: "QAC00046", system_tag: tag },
      select: { nav: true, date: true },
      orderBy: { date: "desc" },
      take: 3,
    });

    if (data.length > 0) {
      console.log("First 5 records:");
      data.forEach((d) => {
        console.log(`  ${d.date.toISOString().slice(0, 10)}: NAV = ${Number(d.nav).toFixed(2)}`);
      });
      console.log("Last 3 records:");
      dataLast.reverse().forEach((d) => {
        console.log(`  ${d.date.toISOString().slice(0, 10)}: NAV = ${Number(d.nav).toFixed(2)}`);
      });
    } else {
      console.log("  No data found for this tag");
    }
  }

  // 3. Also check QAC00066 (used for Scheme QAW++)
  console.log(`\n3. MASTER_SHEET - QAC00066 (Scheme QAW++ source)`);
  console.log("-".repeat(60));

  const qawPlusData = await prisma.master_sheet.findMany({
    where: { qcode: "QAC00066", system_tag: "Zerodha Total Portfolio" },
    select: { nav: true, date: true },
    orderBy: { date: "asc" },
    take: 5,
  });

  if (qawPlusData.length > 0) {
    console.log("First 5 records:");
    qawPlusData.forEach((d) => {
      console.log(`  ${d.date.toISOString().slice(0, 10)}: NAV = ${Number(d.nav).toFixed(2)}`);
    });
  } else {
    console.log("  No data found");
  }

  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));
  console.log("\nIf PMS data NAV starts around 10 but other schemes start around 100,");
  console.log("then only the PMS-specific code needs to be fixed.");
  console.log("\n");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Error:", e);
  prisma.$disconnect();
  process.exit(1);
});
