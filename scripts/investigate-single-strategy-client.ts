/**
 * Investigation Script: SINGLE-STRATEGY client onboarding
 *
 * For clients that have exactly one strategy and must render in the
 * no-dropdown single-strategy format (renderMode: "single" in the registry),
 * sourced from bifurcated_master_sheet_test.
 *
 * Works the same way as investigate-bifurcated-client.ts: run it with just a
 * qcode and it emits a paste-ready config + registry entry, with the strategy
 * name and inception date auto-detected from the DB and the system tags left
 * as <FILL_FROM_DATA_TEAM> placeholders (fill those from the data team's
 * message). Difference from the multi-scheme script: this emits a
 * defineSingleStrategyClient block (one scheme, no Total Portfolio, no
 * dropdown) + a registry entry with renderMode "single" and broker auto-filled.
 *
 * THIS SCRIPT IS READ-ONLY — NO DATABASE MODIFICATIONS.
 * All queries are SELECT operations only (findFirst / findMany / count).
 *
 * Usage:
 *   npx tsx scripts/investigate-single-strategy-client.ts <qcode> [name-search]
 *
 * Example:
 *   npx tsx scripts/investigate-single-strategy-client.ts QAC00092 GRD
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
  const [, , qcodeArg, nameArg] = process.argv;
  if (!qcodeArg) {
    console.error(
      "Usage: npx tsx scripts/investigate-single-strategy-client.ts <qcode> [name-search]"
    );
    process.exit(1);
  }
  const qcode = qcodeArg;

  console.log("=".repeat(80));
  console.log(`SINGLE-STRATEGY INVESTIGATION: ${qcode}${nameArg ? ` (name~${nameArg})` : ""}`);
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
  let chosenIcode = linkedIcodes[0] ?? "QUS00XXX";
  console.log(`  Linked icodes via pooled_account_users: ${linkedIcodes.join(", ") || "(none)"}`);
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

  // 4. Detect the single strategy + inception.
  // Matches both the Radiance convention ("<PREFIX> Total Portfolio Exposure"
  // / "...Value") and the Zerodha convention ("<PREFIX> Zerodha Total
  // Portfolio"). For a true single-strategy client there is exactly one
  // prefix; if more than one is found we warn and use the first.
  console.log("\n" + "─".repeat(80));
  console.log("4. STRATEGY DETECTION");
  console.log("─".repeat(80));

  const tagRows = await prisma.bifurcated_master_sheet_test.findMany({
    where: { qcode },
    distinct: ["system_tag"],
    select: { system_tag: true },
  });
  const allTags = tagRows.map((t) => t.system_tag);

  const prefixRegex = /^([A-Z]+\+*)\s+(?:Zerodha Total Portfolio|Total Portfolio (?:Exposure|Value))$/;
  const prefixes = Array.from(
    new Set(
      allTags
        .map((t) => t.match(prefixRegex)?.[1])
        .filter((p): p is string => !!p)
    )
  );

  if (prefixes.length === 0) {
    console.log("  ✗ No strategy prefix detected via the portfolio-tag patterns.");
    console.log("    Portfolio-ish tags present (fill strategyName/tags manually):");
    allTags
      .filter((t) => /Total Portfolio|Exposure|Value/.test(t))
      .sort()
      .forEach((t) => console.log(`      ${t}`));
    await prisma.$disconnect();
    process.exit(3);
  }
  if (prefixes.length > 1) {
    console.log(`  ⚠ Multiple prefixes detected: ${prefixes.join(", ")} — this may not be a single-strategy client. Using "${prefixes[0]}"; confirm before using the output.`);
  }
  const strategyName = prefixes[0];

  // Candidate tags for this prefix (the hint set the teammate picks from).
  const candidateTags = allTags
    .filter((t) => t.startsWith(`${strategyName} `) && /Total Portfolio/.test(t))
    .sort();

  // Inception = MIN date across the prefix's candidate tags (prefer Exposure,
  // then Zerodha, then Value, then fall back to Qode Total Portfolio).
  const inceptionTagPreference = [
    `${strategyName} Total Portfolio Exposure`,
    `${strategyName} Zerodha Total Portfolio`,
    `${strategyName} Total Portfolio Value`,
    "Qode Total Portfolio",
  ];
  let inceptionDate = "NO DATA";
  let inceptionTagUsed = "(none)";
  for (const tag of inceptionTagPreference) {
    const min = await prisma.bifurcated_master_sheet_test.findFirst({
      where: { qcode, system_tag: tag },
      orderBy: { date: "asc" },
      select: { date: true },
    });
    if (min?.date) {
      inceptionDate = fmtDate(min.date);
      inceptionTagUsed = tag;
      break;
    }
  }

  console.log(`  Detected strategy: "${strategyName}"`);
  console.log(`  Inception: ${inceptionDate} (from MIN date of "${inceptionTagUsed}")`);
  console.log(`  Candidate tags for this strategy (pick exposure/profit from these):`);
  for (const tag of candidateTags) {
    const cnt = await prisma.bifurcated_master_sheet_test.count({
      where: { qcode, system_tag: tag },
    });
    const max = await prisma.bifurcated_master_sheet_test.findFirst({
      where: { qcode, system_tag: tag },
      orderBy: { date: "desc" },
      select: { date: true },
    });
    console.log(`      ${tag.padEnd(38)} count=${String(cnt).padStart(4)}  → ${fmtDate(max?.date)}`);
  }

  const hint = candidateTags.length
    ? `  // candidates: ${candidateTags.map((t) => `"${t}"`).join(", ")}`
    : "";

  // 5. Paste-ready blocks
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
  exposure: "<FILL_FROM_DATA_TEAM>",${hint}
  profit:   "<FILL_FROM_DATA_TEAM>",${hint}
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
  console.log("\nThen: fill the two <FILL_FROM_DATA_TEAM> tags from the data team's");
  console.log("message, run validate-bifurcated-registry.ts, npm run build, and do a");
  console.log("manual metric parity check vs the client's current production view.");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Error:", e);
  await prisma.$disconnect();
  process.exit(1);
});
