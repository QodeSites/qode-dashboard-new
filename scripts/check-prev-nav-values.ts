/**
 * Check prev_nav values for different Satidham schemes
 *
 * This explores whether using prev_nav of the first day is a valid fix
 * for the startNav calculation issue.
 *
 * Run with: npx ts-node scripts/check-prev-nav-values.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=".repeat(80));
  console.log("PREV_NAV VALUES CHECK - Satidham Schemes");
  console.log("=".repeat(80));

  // 1. Check Scheme QAW++ (QAC00066 - master_sheet)
  console.log("\n1. SCHEME QAW++ (QAC00066 - master_sheet, 'Zerodha Total Portfolio')");
  console.log("-".repeat(60));

  const qawPlusData = await prisma.master_sheet.findMany({
    where: { qcode: "QAC00066", system_tag: "Zerodha Total Portfolio" },
    select: { nav: true, prev_nav: true, date: true },
    orderBy: { date: "asc" },
    take: 5,
  });

  if (qawPlusData.length > 0) {
    console.log("First 5 records:");
    console.log("  Date       | prev_nav   | nav        | nav - prev_nav");
    console.log("  " + "-".repeat(55));
    qawPlusData.forEach((d) => {
      const prevNav = d.prev_nav ? Number(d.prev_nav).toFixed(4) : "NULL";
      const nav = Number(d.nav).toFixed(4);
      const diff = d.prev_nav ? (Number(d.nav) - Number(d.prev_nav)).toFixed(4) : "N/A";
      console.log(`  ${d.date.toISOString().slice(0, 10)} | ${prevNav.padStart(10)} | ${nav.padStart(10)} | ${diff}`);
    });
  } else {
    console.log("  No data found");
  }

  // 2. Check Scheme A (QAC00046 - master_sheet)
  console.log("\n2. SCHEME A (QAC00046 - master_sheet, 'Total Portfolio Value A')");
  console.log("-".repeat(60));

  const schemeAData = await prisma.master_sheet.findMany({
    where: { qcode: "QAC00046", system_tag: "Total Portfolio Value A" },
    select: { nav: true, prev_nav: true, date: true },
    orderBy: { date: "asc" },
    take: 5,
  });

  if (schemeAData.length > 0) {
    console.log("First 5 records:");
    console.log("  Date       | prev_nav   | nav        | nav - prev_nav");
    console.log("  " + "-".repeat(55));
    schemeAData.forEach((d) => {
      const prevNav = d.prev_nav ? Number(d.prev_nav).toFixed(4) : "NULL";
      const nav = Number(d.nav).toFixed(4);
      const diff = d.prev_nav ? (Number(d.nav) - Number(d.prev_nav)).toFixed(4) : "N/A";
      console.log(`  ${d.date.toISOString().slice(0, 10)} | ${prevNav.padStart(10)} | ${nav.padStart(10)} | ${diff}`);
    });
  } else {
    console.log("  No data found");
  }

  // 3. Check Scheme B (QAC00046 - master_sheet)
  console.log("\n3. SCHEME B (QAC00046 - master_sheet, 'Total Portfolio Value B')");
  console.log("-".repeat(60));

  const schemeBData = await prisma.master_sheet.findMany({
    where: { qcode: "QAC00046", system_tag: "Total Portfolio Value B" },
    select: { nav: true, prev_nav: true, date: true },
    orderBy: { date: "asc" },
    take: 5,
  });

  if (schemeBData.length > 0) {
    console.log("First 5 records:");
    console.log("  Date       | prev_nav   | nav        | nav - prev_nav");
    console.log("  " + "-".repeat(55));
    schemeBData.forEach((d) => {
      const prevNav = d.prev_nav ? Number(d.prev_nav).toFixed(4) : "NULL";
      const nav = Number(d.nav).toFixed(4);
      const diff = d.prev_nav ? (Number(d.nav) - Number(d.prev_nav)).toFixed(4) : "N/A";
      console.log(`  ${d.date.toISOString().slice(0, 10)} | ${prevNav.padStart(10)} | ${nav.padStart(10)} | ${diff}`);
    });
  } else {
    console.log("  No data found");
  }

  // 4. Check Scheme PMS QAW (QAW00041 - pms_master_sheet)
  console.log("\n4. SCHEME PMS QAW (QAW00041 - pms_master_sheet)");
  console.log("-".repeat(60));

  const pmsData = await prisma.pms_master_sheet.findMany({
    where: { account_code: "QAW00041" },
    select: { nav: true, prev_nav: true, report_date: true },
    orderBy: { report_date: "asc" },
    take: 5,
  });

  if (pmsData.length > 0) {
    console.log("First 5 records:");
    console.log("  Date       | prev_nav   | nav        | nav - prev_nav");
    console.log("  " + "-".repeat(55));
    pmsData.forEach((d) => {
      const prevNav = d.prev_nav ? Number(d.prev_nav).toFixed(4) : "NULL";
      const nav = Number(d.nav).toFixed(4);
      const diff = d.prev_nav ? (Number(d.nav) - Number(d.prev_nav)).toFixed(4) : "N/A";
      console.log(`  ${d.report_date.toISOString().slice(0, 10)} | ${prevNav.padStart(10)} | ${nav.padStart(10)} | ${diff}`);
    });
  } else {
    console.log("  No data found");
  }

  console.log("\n" + "=".repeat(80));
  console.log("ANALYSIS");
  console.log("=".repeat(80));
  console.log("\nIf prev_nav on the first day shows the correct baseline:");
  console.log("  - For normalized schemes (QAW++, A, B): prev_nav should be 100");
  console.log("  - For PMS scheme: prev_nav should be ~10 (or the actual previous NAV)");
  console.log("\nThen using 'startNav = entries[0].prev_nav' for the first month would be");
  console.log("a valid and elegant fix that works for ALL schemes without special cases.");
  console.log("\n");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Error:", e);
  prisma.$disconnect();
  process.exit(1);
});
