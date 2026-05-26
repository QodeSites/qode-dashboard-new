/**
 * Investigation Script: bifurcated_master_sheet_test client onboarding
 *
 * PURPOSE: Given a qcode, gather everything a teammate needs to add a new
 * bifurcated client. Emits a paste-ready defineBifurcatedClient(...) block
 * with inception dates filled in, plus a paste-ready registry entry.
 *
 * THIS SCRIPT IS READ-ONLY — NO DATABASE MODIFICATIONS.
 * All queries are SELECT operations only (findFirst / findMany / count).
 *
 * Usage:
 *   npx tsx scripts/investigate-bifurcated-client.ts <qcode> [name-search]
 *
 * (Use `tsx`, not `ts-node` — the project's `moduleResolution: "bundler"`
 * tsconfig setting breaks ts-node when importing project code; `tsx` works
 * out of the box.)
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function fmtDate(d: Date | null | undefined): string {
  return d ? d.toISOString().split("T")[0] : "NO DATA";
}

interface SchemeInfo {
  schemeName: string;        // e.g. "Scheme QYE++"
  prefix: string;            // e.g. "QYE++"
  exposureTagGuess: string;  // e.g. "QYE++ Zerodha Total Portfolio"
  inceptionDate: string;     // YYYY-MM-DD
}

async function main() {
  const [, , qcodeArg, nameArg] = process.argv;
  if (!qcodeArg) {
    console.error("Usage: npx tsx scripts/investigate-bifurcated-client.ts <qcode> [name-search]");
    process.exit(1);
  }
  const qcode = qcodeArg;

  console.log("=".repeat(80));
  console.log(`INVESTIGATION: ${qcode}${nameArg ? ` (name~${nameArg})` : ""}`);
  console.log("=".repeat(80));
  console.log("\nAll queries are READ-ONLY (SELECT only)\n");

  // 1. Account + client identity
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
  console.log(`  Linked icodes via pooled_account_users: ${linkedIcodes.join(", ") || "(none)"}`);

  let chosenIcode = linkedIcodes[0] ?? "QUS00XXX";
  if (nameArg) {
    const nameMatches = await prisma.clients.findMany({
      where: { user_name: { contains: nameArg, mode: "insensitive" } },
      select: { icode: true, user_name: true },
    });
    nameMatches.forEach((c) =>
      console.log(`  Name match: icode=${c.icode} name="${c.user_name}"`)
    );
    if (nameMatches.length === 1) chosenIcode = nameMatches[0].icode;
  }

  // 2. Distinct system_tags in bifurcated_master_sheet_test
  console.log("\n" + "─".repeat(80));
  console.log(`2. DISTINCT system_tag IN bifurcated_master_sheet_test WHERE qcode = ${qcode}`);
  console.log("─".repeat(80));

  const tagRows = await prisma.bifurcated_master_sheet_test.findMany({
    where: { qcode },
    distinct: ["system_tag"],
    select: { system_tag: true },
  });
  console.log(`  ${tagRows.length} distinct tag(s) found.`);

  // 3. Detect schemes (heuristic: tags starting with "<PREFIX>++ Zerodha Total Portfolio")
  const schemes: SchemeInfo[] = [];
  const exposureTagRegex = /^([A-Z]+\+\+)\s+Zerodha Total Portfolio$/;
  for (const { system_tag } of tagRows) {
    const m = system_tag.match(exposureTagRegex);
    if (m) {
      const prefix = m[1];
      const schemeName = `Scheme ${prefix}`;
      const minRow = await prisma.bifurcated_master_sheet_test.findFirst({
        where: { qcode, system_tag },
        orderBy: { date: "asc" },
        select: { date: true },
      });
      const maxRow = await prisma.bifurcated_master_sheet_test.findFirst({
        where: { qcode, system_tag },
        orderBy: { date: "desc" },
        select: { date: true },
      });
      const cnt = await prisma.bifurcated_master_sheet_test.count({
        where: { qcode, system_tag },
      });
      const inception = fmtDate(minRow?.date);
      schemes.push({
        schemeName,
        prefix,
        exposureTagGuess: system_tag,
        inceptionDate: inception,
      });
      console.log(
        `  Detected ${schemeName} via "${system_tag}": ${cnt} rows, ${inception} → ${fmtDate(maxRow?.date)}`
      );
    }
  }

  // 4. Qode Total Portfolio presence
  console.log("\n" + "─".repeat(80));
  console.log("3. Qode Total Portfolio PRESENCE");
  console.log("─".repeat(80));
  const qtpCount = await prisma.bifurcated_master_sheet_test.count({
    where: { qcode, system_tag: "Qode Total Portfolio" },
  });
  console.log(qtpCount > 0 ? `  ✓ present (${qtpCount} rows)` : "  ✗ MISSING — talk to data team");

  // 5. Holdings presence
  console.log("\n" + "─".repeat(80));
  console.log("4. HOLDINGS PRESENCE");
  console.log("─".repeat(80));
  const eqCount = await prisma.bifurcated_equity_holding_test.count({ where: { qcode } });
  const mfCount = await prisma.bifurcated_mutual_fund_holding_sheet_test.count({
    where: { qcode },
  });
  console.log(`  bifurcated_equity_holding_test:                 ${eqCount} rows`);
  console.log(`  bifurcated_mutual_fund_holding_sheet_test:      ${mfCount} rows`);

  // 6. Paste-ready blocks
  console.log("\n" + "=".repeat(80));
  console.log("READY-TO-PASTE CONFIG (save to app/lib/clients/<name>.ts)");
  console.log("=".repeat(80));
  const fileName = (account.account_name || "newclient")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  console.log(`
import { defineBifurcatedClient } from "../bifurcated-client-builder";

export const ${fileName.toUpperCase().replace(/-/g, "_")}_CONFIG = defineBifurcatedClient({
  name: "${account.account_name}",
  qcode: "${qcode}",`);
  if (schemes.length === 0) {
    console.log(`  schemes: { /* no schemes auto-detected — add manually */ },`);
  } else {
    console.log(`  schemes: {`);
    for (const s of schemes) {
      console.log(`    "${s.schemeName}": {`);
      console.log(`      inceptionDate: "${s.inceptionDate}",`);
      console.log(`      exposure: "<FILL_FROM_DATA_TEAM>",  // hint: detected "${s.exposureTagGuess}"`);
      console.log(`      profit:   "<FILL_FROM_DATA_TEAM>",`);
      console.log(`      // inactive: true,  // uncomment if the data team marked this scheme inactive`);
      console.log(`    },`);
    }
    console.log(`  },`);
  }
  console.log(`});
`);

  console.log("=".repeat(80));
  console.log("READY-TO-PASTE REGISTRY ENTRY (append to app/lib/bifurcated-clients-registry.ts)");
  console.log("=".repeat(80));
  console.log(`
  {
    icode: "${chosenIcode}",
    qcode: "${qcode}",
    displayName: "${account.account_name}",
    config: ${fileName.toUpperCase().replace(/-/g, "_")}_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
  },
`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Error:", e);
  await prisma.$disconnect();
  process.exit(1);
});
