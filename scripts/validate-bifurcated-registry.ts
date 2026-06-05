/**
 * Validator: bifurcated-clients-registry sanity check
 *
 * For each entry in BIFURCATED_CLIENTS, confirms the client exists in the DB,
 * the account exists, every scheme tag has data, inception dates match
 * MIN(date) in bifurcated_master_sheet_test, and Qode Total Portfolio is
 * populated.
 *
 * THIS SCRIPT IS READ-ONLY — NO DATABASE MODIFICATIONS.
 *
 * Usage: npx tsx scripts/validate-bifurcated-registry.ts
 */

import { PrismaClient } from "@prisma/client";
import { BIFURCATED_CLIENTS } from "../app/lib/bifurcated-clients-registry";

const prisma = new PrismaClient();

let failures = 0;
const fail = (msg: string) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};
const ok = (msg: string) => console.log(`  ✓ ${msg}`);

async function main() {
  console.log("=".repeat(80));
  console.log("VALIDATING BIFURCATED_CLIENTS registry");
  console.log("=".repeat(80));

  // Duplicate qcode check (registry integrity)
  const seenQcodes = new Set<string>();
  for (const c of BIFURCATED_CLIENTS) {
    if (seenQcodes.has(c.qcode)) {
      fail(`duplicate qcode in registry: ${c.qcode}`);
    }
    seenQcodes.add(c.qcode);
  }

  for (const entry of BIFURCATED_CLIENTS) {
    console.log("\n" + "─".repeat(80));
    console.log(`Entry: ${entry.displayName} (icode=${entry.icode}, qcode=${entry.qcode})`);
    console.log("─".repeat(80));

    // 1. icode in clients table
    const client = await prisma.clients.findFirst({
      where: { icode: entry.icode },
      select: { icode: true, user_name: true },
    });
    client
      ? ok(`icode found in clients: "${client.user_name}"`)
      : fail(`icode ${entry.icode} NOT in clients table`);

    // 2. qcode in accounts table
    const account = await prisma.accounts.findFirst({
      where: { qcode: entry.qcode },
      select: { qcode: true, account_name: true },
    });
    account
      ? ok(`qcode found in accounts: "${account.account_name}"`)
      : fail(`qcode ${entry.qcode} NOT in accounts table`);

    // 3. Per-scheme inception date matches MIN(date)
    const schemes = entry.config.portfolioMapping;
    for (const [schemeName, sc] of Object.entries(schemes)) {
      if (schemeName === "Total Portfolio") continue;
      if (!sc.tags) continue;
      const minRow = await prisma.bifurcated_master_sheet_test.findFirst({
        where: { qcode: entry.qcode, system_tag: sc.tags.depositTag },
        orderBy: { date: "asc" },
        select: { date: true },
      });
      if (!minRow) {
        fail(`${schemeName}: NO ROWS for deposit tag "${sc.tags.depositTag}"`);
        continue;
      }
      const dbMin = minRow.date.toISOString().split("T")[0];
      const configMin = sc.tags.startDate.toISOString().split("T")[0];
      const dbDay = new Date(dbMin).getTime();
      const cfgDay = new Date(configMin).getTime();
      const diffDays = Math.abs(dbDay - cfgDay) / 86400000;
      if (diffDays <= 1) {
        ok(`${schemeName}: inception ${configMin} matches DB MIN ${dbMin}`);
      } else {
        fail(`${schemeName}: config inception ${configMin} differs from DB MIN ${dbMin} by ${diffDays} days`);
      }
    }

    // 4. Qode Total Portfolio populated (only if config opts in)
    if (entry.config.qodeTotalPortfolioTag) {
      const tpCount = await prisma.bifurcated_master_sheet_test.count({
        where: {
          qcode: entry.qcode,
          system_tag: entry.config.qodeTotalPortfolioTag,
        },
      });
      tpCount > 0
        ? ok(`"${entry.config.qodeTotalPortfolioTag}" present (${tpCount} rows)`)
        : fail(`"${entry.config.qodeTotalPortfolioTag}" MISSING for qcode ${entry.qcode}`);
    }
  }

  console.log("\n" + "=".repeat(80));
  if (failures === 0) {
    console.log("✓ Registry valid — all entries OK");
  } else {
    console.log(`✗ ${failures} failure(s) — fix before deploying`);
  }
  console.log("=".repeat(80));

  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("Error:", e);
  await prisma.$disconnect();
  process.exit(1);
});
