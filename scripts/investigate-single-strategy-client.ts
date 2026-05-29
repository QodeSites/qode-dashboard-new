/**
 * Investigation Script: SINGLE-STRATEGY client onboarding
 *
 * For clients that have exactly one strategy and must render in the
 * no-dropdown single-strategy format (renderMode: "single" in the registry),
 * sourced from bifurcated_master_sheet_test.
 *
 * Unlike investigate-bifurcated-client.ts (which targets multi-scheme clients
 * and emits a defineBifurcatedClient block), this script:
 *   - does NOT auto-detect schemes (you already know the client is single-
 *     strategy and the data team gives you the exposure/profit tags),
 *   - auto-fills broker + icode + display name + inception from the DB,
 *   - emits a paste-ready defineSingleStrategyClient config + registry entry.
 *
 * THIS SCRIPT IS READ-ONLY — NO DATABASE MODIFICATIONS.
 * All queries are SELECT operations only (findFirst / findMany / count).
 *
 * Usage:
 *   # Discovery mode — list candidate portfolio tags for a qcode:
 *   npx tsx scripts/investigate-single-strategy-client.ts <qcode>
 *
 *   # Generate mode — emit paste-ready config + registry entry:
 *   npx tsx scripts/investigate-single-strategy-client.ts <qcode> "<strategyName>" "<exposureTag>" ["<profitTag>"]
 *   (profitTag defaults to exposureTag when omitted — the Radiance same-tag case)
 *
 * Example:
 *   npx tsx scripts/investigate-single-strategy-client.ts QAC00092 "QYE++" "QYE++ Total Portfolio Exposure"
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function fmtDate(d: Date | null | undefined): string {
  return d ? d.toISOString().split("T")[0] : "NO DATA";
}

function constName(accountName: string): string {
  return (
    accountName
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "NEW_CLIENT"
  ) + "_CONFIG";
}

function fileSlug(accountName: string): string {
  return (
    accountName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "newclient"
  );
}

async function main() {
  const [, , qcodeArg, strategyName, exposureArg, profitArg] = process.argv;
  if (!qcodeArg) {
    console.error(
      "Usage:\n" +
        "  Discovery: npx tsx scripts/investigate-single-strategy-client.ts <qcode>\n" +
        '  Generate:  npx tsx scripts/investigate-single-strategy-client.ts <qcode> "<strategyName>" "<exposureTag>" ["<profitTag>"]'
    );
    process.exit(1);
  }
  const qcode = qcodeArg;
  const profitTag = profitArg ?? exposureArg; // default profit = exposure

  console.log("=".repeat(80));
  console.log(`SINGLE-STRATEGY INVESTIGATION: ${qcode}`);
  console.log("=".repeat(80));
  console.log("\nAll queries are READ-ONLY (SELECT only)\n");

  // 1. Account + client identity (auto-fills name, broker, icode)
  console.log("─".repeat(80));
  console.log("1. ACCOUNT + CLIENT IDENTITY");
  console.log("─".repeat(80));

  const account = await prisma.accounts.findFirst({
    where: { qcode },
    select: {
      qcode: true,
      account_name: true,
      account_type: true,
      broker: true,
    },
  });
  if (!account) {
    console.log(`  Account ${qcode} not found in accounts table.`);
    await prisma.$disconnect();
    process.exit(2);
  }
  console.log(`  qcode:        ${account.qcode}`);
  console.log(`  account_name: ${account.account_name}`);
  console.log(`  account_type: ${account.account_type}`);
  console.log(`  broker:       ${account.broker}`);

  const accessRows = await prisma.pooled_account_users.findMany({
    where: { qcode },
    select: { icode: true },
  });
  const linkedIcodes = accessRows.map((r) => r.icode);
  const chosenIcode = linkedIcodes[0] ?? "QUS00XXX";
  console.log(`  Linked icodes via pooled_account_users: ${linkedIcodes.join(", ") || "(none)"}`);

  // 2. Qode Total Portfolio presence (table-routing sanity check)
  console.log("\n" + "─".repeat(80));
  console.log("2. Qode Total Portfolio PRESENCE (must exist for the engine to read this client)");
  console.log("─".repeat(80));
  const qtpCount = await prisma.bifurcated_master_sheet_test.count({
    where: { qcode, system_tag: "Qode Total Portfolio" },
  });
  console.log(
    qtpCount > 0
      ? `  ✓ present (${qtpCount} rows)`
      : "  ✗ MISSING — data not in bifurcated_master_sheet_test yet; talk to data team"
  );

  // 3. Holdings presence (informational — holdings are out of scope for now)
  console.log("\n" + "─".repeat(80));
  console.log("3. HOLDINGS PRESENCE (informational — single-strategy holdings are out of scope)");
  console.log("─".repeat(80));
  const eqCount = await prisma.bifurcated_equity_holding_test.count({ where: { qcode } });
  const mfCount = await prisma.bifurcated_mutual_fund_holding_sheet_test.count({
    where: { qcode },
  });
  console.log(`  bifurcated_equity_holding_test:                 ${eqCount} rows`);
  console.log(`  bifurcated_mutual_fund_holding_sheet_test:      ${mfCount} rows`);

  // ===== DISCOVERY MODE =====
  if (!strategyName || !exposureArg) {
    console.log("\n" + "─".repeat(80));
    console.log("4. CANDIDATE PORTFOLIO TAGS (discovery mode — pick exposure/profit from these)");
    console.log("─".repeat(80));
    const tagRows = await prisma.bifurcated_master_sheet_test.findMany({
      where: { qcode },
      distinct: ["system_tag"],
      select: { system_tag: true },
    });
    const candidates = tagRows
      .map((t) => t.system_tag)
      .filter((t) => /Total Portfolio|Exposure|Value/.test(t))
      .sort();
    if (candidates.length === 0) {
      console.log("  No portfolio-style tags found for this qcode.");
    } else {
      for (const tag of candidates) {
        const cnt = await prisma.bifurcated_master_sheet_test.count({
          where: { qcode, system_tag: tag },
        });
        const min = await prisma.bifurcated_master_sheet_test.findFirst({
          where: { qcode, system_tag: tag },
          orderBy: { date: "asc" },
          select: { date: true },
        });
        const max = await prisma.bifurcated_master_sheet_test.findFirst({
          where: { qcode, system_tag: tag },
          orderBy: { date: "desc" },
          select: { date: true },
        });
        console.log(
          `  ${tag.padEnd(38)} count=${String(cnt).padStart(4)}  ${fmtDate(min?.date)} → ${fmtDate(max?.date)}`
        );
      }
    }
    console.log("\n" + "=".repeat(80));
    console.log("Next: re-run in GENERATE mode with the exposure (and profit) tag:");
    console.log(
      `  npx tsx scripts/investigate-single-strategy-client.ts ${qcode} "<strategyName>" "<exposureTag>" ["<profitTag>"]`
    );
    console.log("=".repeat(80));
    await prisma.$disconnect();
    return;
  }

  // ===== GENERATE MODE =====
  const exposureTag = exposureArg;

  console.log("\n" + "─".repeat(80));
  console.log("4. TAG VALIDATION + INCEPTION (generate mode)");
  console.log("─".repeat(80));

  const expCount = await prisma.bifurcated_master_sheet_test.count({
    where: { qcode, system_tag: exposureTag },
  });
  const expMin = await prisma.bifurcated_master_sheet_test.findFirst({
    where: { qcode, system_tag: exposureTag },
    orderBy: { date: "asc" },
    select: { date: true, nav: true },
  });
  const expMax = await prisma.bifurcated_master_sheet_test.findFirst({
    where: { qcode, system_tag: exposureTag },
    orderBy: { date: "desc" },
    select: { date: true, nav: true },
  });
  const profCount = await prisma.bifurcated_master_sheet_test.count({
    where: { qcode, system_tag: profitTag },
  });

  console.log(`  exposure tag "${exposureTag}":`);
  console.log(
    `    count=${expCount}  ${fmtDate(expMin?.date)} (nav ${expMin?.nav ?? "—"}) → ${fmtDate(expMax?.date)} (nav ${expMax?.nav ?? "—"})`
  );
  console.log(`  profit tag   "${profitTag}": count=${profCount}`);

  if (expCount === 0) {
    console.log(`\n  ✗ exposure tag "${exposureTag}" has NO rows for ${qcode} — check the spelling against discovery mode.`);
    await prisma.$disconnect();
    process.exit(3);
  }
  if (profCount === 0) {
    console.log(`\n  ⚠ profit tag "${profitTag}" has NO rows for ${qcode} — double-check the tag.`);
  }

  const inceptionDate = fmtDate(expMin?.date);

  // Paste-ready blocks
  const cName = constName(account.account_name);
  const slug = fileSlug(account.account_name);

  console.log("\n" + "=".repeat(80));
  console.log(`READY-TO-PASTE CONFIG (save to app/lib/clients/${slug}.ts)`);
  console.log("=".repeat(80));
  console.log(`
import { defineSingleStrategyClient } from "../bifurcated-client-builder";

export const ${cName} = defineSingleStrategyClient({
  name: "${account.account_name}",
  qcode: "${qcode}",
  strategyName: "${strategyName}",
  inceptionDate: "${inceptionDate}",
  exposure: "${exposureTag}",
  profit: "${profitTag}",
});
`);

  console.log("=".repeat(80));
  console.log("READY-TO-PASTE REGISTRY ENTRY (append to app/lib/bifurcated-clients-registry.ts)");
  console.log("=".repeat(80));
  console.log(`
  {
    icode: "${chosenIcode}",
    qcode: "${qcode}",
    displayName: "${account.account_name}",
    config: ${cName},
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "${account.broker}",
  },
`);
  console.log("Also add the import near the other client-config imports:");
  console.log(`  import { ${cName} } from "./clients/${slug}";`);
  console.log("\nThen: run validate-bifurcated-registry.ts, npm run build, and do a");
  console.log("manual metric parity check vs the client's current production view.");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Error:", e);
  await prisma.$disconnect();
  process.exit(1);
});
