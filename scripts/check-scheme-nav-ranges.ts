/**
 * Check NAV ranges for different Satidham schemes
 *
 * This helps understand which schemes have NAV normalized to 100
 * vs those that don't (like PMS data).
 *
 * Run with: npx ts-node scripts/check-scheme-nav-ranges.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=".repeat(80));
  console.log("SCHEME NAV RANGES CHECK - Satidham");
  console.log("=".repeat(80));

  // 1. Check Scheme QAW++ (QAC00066 - master_sheet)
  console.log("\n1. SCHEME QAW++ (QAC00066 - master_sheet)");
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
      console.log(`  ${d.date.toISOString().slice(0, 10)}: NAV = ${Number(d.nav).toFixed(4)}`);
    });
  } else {
    console.log("  No data found");
  }

  // 2. Check Scheme A (QAC00046 - master_sheet)
  console.log("\n2. SCHEME A (QAC00046 - master_sheet)");
  console.log("-".repeat(60));

  const schemeAData = await prisma.master_sheet.findMany({
    where: { qcode: "QAC00046", system_tag: "Total Portfolio Value A" },
    select: { nav: true, date: true },
    orderBy: { date: "asc" },
    take: 5,
  });

  if (schemeAData.length > 0) {
    console.log("First 5 records:");
    schemeAData.forEach((d) => {
      console.log(`  ${d.date.toISOString().slice(0, 10)}: NAV = ${Number(d.nav).toFixed(4)}`);
    });
  } else {
    console.log("  No data found");
  }

  // 3. Check Scheme B (QAC00046 - master_sheet)
  console.log("\n3. SCHEME B (QAC00046 - master_sheet)");
  console.log("-".repeat(60));

  const schemeBData = await prisma.master_sheet.findMany({
    where: { qcode: "QAC00046", system_tag: "Total Portfolio Value B" },
    select: { nav: true, date: true },
    orderBy: { date: "asc" },
    take: 5,
  });

  if (schemeBData.length > 0) {
    console.log("First 5 records:");
    schemeBData.forEach((d) => {
      console.log(`  ${d.date.toISOString().slice(0, 10)}: NAV = ${Number(d.nav).toFixed(4)}`);
    });
  } else {
    console.log("  No data found");
  }

  // 4. Check Scheme PMS QAW (QAW00041 - pms_master_sheet)
  console.log("\n4. SCHEME PMS QAW (QAW00041 - pms_master_sheet)");
  console.log("-".repeat(60));

  const pmsData = await prisma.pms_master_sheet.findMany({
    where: { account_code: "QAW00041" },
    select: { nav: true, report_date: true },
    orderBy: { report_date: "asc" },
    take: 5,
  });

  if (pmsData.length > 0) {
    console.log("First 5 records:");
    pmsData.forEach((d) => {
      console.log(`  ${d.report_date.toISOString().slice(0, 10)}: NAV = ${Number(d.nav).toFixed(4)}`);
    });
  } else {
    console.log("  No data found");
  }

  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));
  console.log("\nIf master_sheet schemes (QAW++, A, B) start near 100 but PMS starts at ~10,");
  console.log("then reverting to 'startNav = entries[0].nav' will work for ALL schemes");
  console.log("because:");
  console.log("  - master_sheet schemes: entries[0].nav ≈ 100 (already normalized)");
  console.log("  - PMS scheme: entries[0].nav ≈ 10 (actual value, which is correct)");
  console.log("\n");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Error:", e);
  prisma.$disconnect();
  process.exit(1);
});
