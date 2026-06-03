/**
 * Verify the two migrated Sarla/Satidham active schemes read from
 * bifurcated_master_sheet_test under the expected tags. READ-ONLY.
 *
 * Usage: npx tsx scripts/verify-sarla-bifurcated-schemes.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const fmt = (d: Date | null | undefined) =>
  d ? d.toISOString().split("T")[0] : "—";

// (label, qcode, expected bifurcated tag)
const CHECKS: Array<{ label: string; qcode: string; tag: string }> = [
  { label: "Sarla Scheme B — exposure/deposit", qcode: "QAC00041", tag: "Zerodha Total Portfolio" },
  { label: "Sarla Scheme B — NAV", qcode: "QAC00041", tag: "Total Portfolio Value" },
  { label: "Satidham QAW++ — exposure/deposit", qcode: "QAC00066", tag: "QAW++ Zerodha Total Portfolio" },
  { label: "Satidham QAW++ — NAV", qcode: "QAC00066", tag: "QAW++ Total Portfolio Value" },
];

async function main() {
  console.log("=".repeat(80));
  console.log("VERIFY Sarla/Satidham migrated schemes in bifurcated_master_sheet_test");
  console.log("=".repeat(80));

  let allOk = true;
  for (const c of CHECKS) {
    const cnt = await prisma.bifurcated_master_sheet_test.count({
      where: { qcode: c.qcode, system_tag: c.tag },
    });
    const min = await prisma.bifurcated_master_sheet_test.findFirst({
      where: { qcode: c.qcode, system_tag: c.tag },
      orderBy: { date: "asc" },
      select: { date: true, nav: true },
    });
    const max = await prisma.bifurcated_master_sheet_test.findFirst({
      where: { qcode: c.qcode, system_tag: c.tag },
      orderBy: { date: "desc" },
      select: { date: true, nav: true },
    });
    const ok = cnt > 0;
    if (!ok) allOk = false;
    console.log(
      `  ${ok ? "✓" : "✗"} ${c.label.padEnd(36)} [${c.qcode} | "${c.tag}"]  count=${cnt}  ${fmt(min?.date)}(${min?.nav}) -> ${fmt(max?.date)}(${max?.nav})`
    );
  }

  console.log("\n" + "=".repeat(80));
  console.log(allOk ? "✓ All migrated-scheme tags present in bifurcated table" : "✗ Some tags missing — investigate");
  console.log("=".repeat(80));

  await prisma.$disconnect();
  process.exit(allOk ? 0 : 1);
}

main().catch(async (e) => {
  console.error("Error:", e);
  await prisma.$disconnect();
  process.exit(1);
});
