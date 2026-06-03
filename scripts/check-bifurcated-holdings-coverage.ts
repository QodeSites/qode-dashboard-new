/**
 * Coverage report: which managed accounts have holdings migrated into the
 * bifurcated holdings tables (bifurcated_equity_holding_test /
 * bifurcated_mutual_fund_holding_sheet_test).
 *
 * Until an account appears as COVERED here, its /holding-summary view will be
 * empty (no regression — it was empty before too). Use this to track the
 * data-team migration of regular managed accounts.
 *
 * THIS SCRIPT IS READ-ONLY — only findMany / count.
 *
 * Usage: npx tsx scripts/check-bifurcated-holdings-coverage.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=".repeat(80));
  console.log("BIFURCATED HOLDINGS COVERAGE — managed accounts");
  console.log("=".repeat(80));

  const accounts = await prisma.accounts.findMany({
    where: { account_type: "managed_account" },
    select: { qcode: true, account_name: true, broker: true },
    orderBy: { qcode: "asc" },
  });

  let covered = 0;
  for (const a of accounts) {
    const eq = await prisma.bifurcated_equity_holding_test.count({
      where: { qcode: a.qcode },
    });
    const mf = await prisma.bifurcated_mutual_fund_holding_sheet_test.count({
      where: { qcode: a.qcode },
    });
    const ok = eq > 0 || mf > 0;
    if (ok) covered++;
    console.log(
      `  ${ok ? "✓" : "·"} ${a.qcode.padEnd(10)} ${(a.account_name || "").padEnd(28)} ${(a.broker || "").padEnd(10)} eq=${String(eq).padStart(4)} mf=${String(mf).padStart(4)}`
    );
  }

  console.log("\n" + "=".repeat(80));
  console.log(`${covered}/${accounts.length} managed accounts have bifurcated holdings rows`);
  console.log("=".repeat(80));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Error:", e);
  await prisma.$disconnect();
  process.exit(1);
});
