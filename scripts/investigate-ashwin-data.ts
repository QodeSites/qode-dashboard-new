/**
 * Investigation Script: Ashwin Agarwal (QAC00083) — Bifurcated View Data
 *
 * PURPOSE: Confirm DB state before adding Ashwin to BifurcatedPortfolioEngine
 *  - Find Ashwin's icode (via clients.user_name and pooled_account_users)
 *  - Confirm QAC00083 exists in accounts
 *  - List all system_tags present for QAC00083 in master_sheet AND
 *    bifurcated_master_sheet_test
 *  - For each target tag, get MIN/MAX date + record count + first 5 rows
 *  - Check whether "Qode Total Portfolio" exists for QAC00083 in
 *    bifurcated_master_sheet_test (drives Total Portfolio aggregate decision)
 *  - Check bifurcated_equity_holding_test / bifurcated_mutual_fund_holding_sheet_test
 *    presence + distinct strategy values
 *  - Check capital_in_out rows for the target tags
 *
 * THIS SCRIPT IS READ-ONLY - NO DATABASE MODIFICATIONS
 * All queries are SELECT operations only (findMany / findFirst / count).
 *
 * Run with: npx ts-node scripts/investigate-ashwin-data.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const QCODE = "QAC00083";

const TARGET_TAGS = [
  "QAW++ Zerodha Total Portfolio", // QAW++ deposit + nav
  "QYE++ Zerodha Total Portfolio", // QYE++ deposit + exposure
  "QYE++ Total Portfolio Value", // QYE++ nav (profit)
  "Qode Total Portfolio", // Total Portfolio aggregate (authoritative curve)
];

function fmtDate(d: Date | null | undefined): string {
  return d ? d.toISOString().split("T")[0] : "NO DATA";
}

async function main() {
  console.log("=".repeat(80));
  console.log(`INVESTIGATION: Ashwin Agarwal (${QCODE})`);
  console.log("=".repeat(80));
  console.log("\nAll queries are READ-ONLY (SELECT only)\n");

  // 1. Find Ashwin in clients table
  console.log("─".repeat(80));
  console.log("1. CLIENT LOOKUP (clients table — match by name)");
  console.log("─".repeat(80));

  const ashwinClients = await prisma.clients.findMany({
    where: { user_name: { contains: "Ashwin", mode: "insensitive" } },
    select: {
      id: true,
      icode: true,
      user_id: true,
      user_name: true,
      email: true,
    },
  });

  if (ashwinClients.length === 0) {
    console.log("  No clients with name containing 'Ashwin' found.");
  } else {
    ashwinClients.forEach((c, i) => {
      console.log(
        `  ${i + 1}. icode=${c.icode} | name="${c.user_name}" | email=${c.email}`
      );
    });
  }

  // 2. Verify account exists
  console.log("\n" + "─".repeat(80));
  console.log(`2. ACCOUNT LOOKUP (accounts table where qcode = ${QCODE})`);
  console.log("─".repeat(80));

  const account = await prisma.accounts.findFirst({
    where: { qcode: QCODE },
    select: {
      qcode: true,
      account_id: true,
      account_name: true,
      account_type: true,
      broker: true,
      strategy: true,
    },
  });

  if (!account) {
    console.log(`  Account ${QCODE} NOT FOUND in accounts table.`);
  } else {
    console.log(`  qcode:        ${account.qcode}`);
    console.log(`  account_id:   ${account.account_id ?? "(null)"}`);
    console.log(`  account_name: ${account.account_name}`);
    console.log(`  account_type: ${account.account_type}`);
    console.log(`  broker:       ${account.broker}`);
    console.log(`  strategy:     ${account.strategy ?? "(null)"}`);
  }

  // 3. Find which icodes have access to QAC00083
  console.log("\n" + "─".repeat(80));
  console.log(`3. POOLED ACCOUNT USERS (icodes linked to ${QCODE})`);
  console.log("─".repeat(80));

  const accessRows = await prisma.pooled_account_users.findMany({
    where: { qcode: QCODE },
    select: {
      icode: true,
      access_level: true,
      created_at: true,
    },
  });

  if (accessRows.length === 0) {
    console.log(`  No pooled_account_users rows for ${QCODE}.`);
  } else {
    accessRows.forEach((r, i) => {
      console.log(
        `  ${i + 1}. icode=${r.icode} | access=${r.access_level} | created=${fmtDate(
          r.created_at
        )}`
      );
    });
  }

  // 4. Distinct system_tags in master_sheet
  console.log("\n" + "─".repeat(80));
  console.log(`4. DISTINCT system_tag IN master_sheet WHERE qcode = ${QCODE}`);
  console.log("─".repeat(80));

  const msTags = await prisma.master_sheet.findMany({
    where: { qcode: QCODE },
    distinct: ["system_tag"],
    select: { system_tag: true },
  });

  if (msTags.length === 0) {
    console.log(`  No rows in master_sheet for ${QCODE}.`);
  } else {
    msTags.forEach((t, i) => {
      console.log(`  ${i + 1}. "${t.system_tag}"`);
    });
  }

  // 5. Distinct system_tags in bifurcated_master_sheet_test
  console.log("\n" + "─".repeat(80));
  console.log(
    `5. DISTINCT system_tag IN bifurcated_master_sheet_test WHERE qcode = ${QCODE}`
  );
  console.log("─".repeat(80));

  const bifTags = await prisma.bifurcated_master_sheet_test.findMany({
    where: { qcode: QCODE },
    distinct: ["system_tag"],
    select: { system_tag: true },
  });

  if (bifTags.length === 0) {
    console.log(`  No rows in bifurcated_master_sheet_test for ${QCODE}.`);
  } else {
    bifTags.forEach((t, i) => {
      console.log(`  ${i + 1}. "${t.system_tag}"`);
    });
  }

  // 6. For each TARGET_TAG: counts + min/max date + first 5 rows in BOTH tables
  console.log("\n" + "─".repeat(80));
  console.log("6. TARGET TAG DATE RANGES (master_sheet vs bifurcated_master_sheet_test)");
  console.log("─".repeat(80));

  for (const tag of TARGET_TAGS) {
    console.log(`\n  Tag: "${tag}"`);

    // master_sheet
    const msCount = await prisma.master_sheet.count({
      where: { qcode: QCODE, system_tag: tag },
    });
    const msMin = await prisma.master_sheet.findFirst({
      where: { qcode: QCODE, system_tag: tag },
      orderBy: { date: "asc" },
      select: { date: true, nav: true, drawdown: true, portfolio_value: true },
    });
    const msMax = await prisma.master_sheet.findFirst({
      where: { qcode: QCODE, system_tag: tag },
      orderBy: { date: "desc" },
      select: { date: true, nav: true, drawdown: true, portfolio_value: true },
    });
    console.log(
      `    master_sheet:                  count=${msCount} | min=${fmtDate(
        msMin?.date
      )} (NAV=${msMin?.nav ?? "n/a"}) | max=${fmtDate(msMax?.date)} (NAV=${
        msMax?.nav ?? "n/a"
      })`
    );

    // bifurcated_master_sheet_test
    const bifCount = await prisma.bifurcated_master_sheet_test.count({
      where: { qcode: QCODE, system_tag: tag },
    });
    const bifMin = await prisma.bifurcated_master_sheet_test.findFirst({
      where: { qcode: QCODE, system_tag: tag },
      orderBy: { date: "asc" },
      select: { date: true, nav: true, drawdown: true, portfolio_value: true },
    });
    const bifMax = await prisma.bifurcated_master_sheet_test.findFirst({
      where: { qcode: QCODE, system_tag: tag },
      orderBy: { date: "desc" },
      select: { date: true, nav: true, drawdown: true, portfolio_value: true },
    });
    console.log(
      `    bifurcated_master_sheet_test:  count=${bifCount} | min=${fmtDate(
        bifMin?.date
      )} (NAV=${bifMin?.nav ?? "n/a"}) | max=${fmtDate(bifMax?.date)} (NAV=${
        bifMax?.nav ?? "n/a"
      })`
    );

    // First 5 rows (preferring bifurcated table if present, else master_sheet)
    const sourceTable = bifCount > 0 ? "bifurcated_master_sheet_test" : "master_sheet";
    const firstFive =
      bifCount > 0
        ? await prisma.bifurcated_master_sheet_test.findMany({
            where: { qcode: QCODE, system_tag: tag },
            orderBy: { date: "asc" },
            take: 5,
            select: { date: true, nav: true, drawdown: true, portfolio_value: true },
          })
        : await prisma.master_sheet.findMany({
            where: { qcode: QCODE, system_tag: tag },
            orderBy: { date: "asc" },
            take: 5,
            select: { date: true, nav: true, drawdown: true, portfolio_value: true },
          });

    if (firstFive.length > 0) {
      console.log(`    First 5 rows (${sourceTable}):`);
      firstFive.forEach((r, i) => {
        console.log(
          `      ${i + 1}. ${fmtDate(r.date)} | NAV=${r.nav} | DD=${r.drawdown} | PV=${r.portfolio_value}`
        );
      });
    }
  }

  // 7. Holdings — equity
  console.log("\n" + "─".repeat(80));
  console.log(`7. HOLDINGS — bifurcated_equity_holding_test WHERE qcode = ${QCODE}`);
  console.log("─".repeat(80));

  const eqCount = await prisma.bifurcated_equity_holding_test.count({
    where: { qcode: QCODE },
  });
  const eqLatest = await prisma.bifurcated_equity_holding_test.findFirst({
    where: { qcode: QCODE },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  const eqStrategies = await prisma.bifurcated_equity_holding_test.findMany({
    where: { qcode: QCODE },
    distinct: ["strategy"],
    select: { strategy: true },
  });

  console.log(`  Row count:       ${eqCount}`);
  console.log(`  Latest date:     ${fmtDate(eqLatest?.date)}`);
  console.log(
    `  Strategies:      ${
      eqStrategies.length === 0
        ? "(none)"
        : eqStrategies.map((s) => `"${s.strategy ?? "(null)"}"`).join(", ")
    }`
  );

  // 8. Holdings — mutual funds
  console.log("\n" + "─".repeat(80));
  console.log(
    `8. HOLDINGS — bifurcated_mutual_fund_holding_sheet_test WHERE qcode = ${QCODE}`
  );
  console.log("─".repeat(80));

  const mfCount = await prisma.bifurcated_mutual_fund_holding_sheet_test.count({
    where: { qcode: QCODE },
  });
  const mfLatest = await prisma.bifurcated_mutual_fund_holding_sheet_test.findFirst({
    where: { qcode: QCODE },
    orderBy: { as_of_date: "desc" },
    select: { as_of_date: true },
  });
  const mfStrategies =
    await prisma.bifurcated_mutual_fund_holding_sheet_test.findMany({
      where: { qcode: QCODE },
      distinct: ["strategy"],
      select: { strategy: true },
    });

  console.log(`  Row count:       ${mfCount}`);
  console.log(`  Latest as_of_date: ${fmtDate(mfLatest?.as_of_date)}`);
  console.log(
    `  Strategies:      ${
      mfStrategies.length === 0
        ? "(none)"
        : mfStrategies.map((s) => `"${s.strategy ?? "(null)"}"`).join(", ")
    }`
  );

  // 9. capital_in_out for target tags
  console.log("\n" + "─".repeat(80));
  console.log(`9. capital_in_out FOR ${QCODE} BY TARGET TAG`);
  console.log("─".repeat(80));

  for (const tag of TARGET_TAGS) {
    const cioCount = await prisma.capital_in_out.count({
      where: { qcode: QCODE, system_tag: tag },
    });
    const cioMin = await prisma.capital_in_out.findFirst({
      where: { qcode: QCODE, system_tag: tag },
      orderBy: { date: "asc" },
      select: { date: true, capital_in_out: true },
    });
    const cioMax = await prisma.capital_in_out.findFirst({
      where: { qcode: QCODE, system_tag: tag },
      orderBy: { date: "desc" },
      select: { date: true, capital_in_out: true },
    });
    console.log(
      `  "${tag}": count=${cioCount} | min=${fmtDate(cioMin?.date)} (${
        cioMin?.capital_in_out ?? "n/a"
      }) | max=${fmtDate(cioMax?.date)} (${cioMax?.capital_in_out ?? "n/a"})`
    );
  }

  // 10. Summary
  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY — Use to populate ASHWIN_CONFIG in bifurcated-portfolio-utils.ts");
  console.log("=".repeat(80));
  console.log(`
  Decisions to make from above:
   • icode for Ashwin (from Section 1 + Section 3)
   • newStartDate / per-scheme startDate (MIN date from Section 6)
   • qodeTotalPortfolioTag: keep "Qode Total Portfolio" if Section 6 shows
     data exists in bifurcated_master_sheet_test for QAC00083; else set to
     undefined (engine will fall back to master_sheet without aggregate NAV).
   • Holdings API: only add if Sections 7/8 show row counts > 0.
`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Error:", e);
  await prisma.$disconnect();
  process.exit(1);
});
