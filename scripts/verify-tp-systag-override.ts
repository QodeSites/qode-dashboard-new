/**
 * Verify the data contract behind the Total Portfolio system-tag override:
 * for a sample bifurcated client + tag, confirm the tag exists, has a bounded
 * date range, and its first occurrence carries prev_nav = 100 (the baseline
 * the override returns/curve depend on). READ-ONLY.
 *
 * Usage: npx tsx scripts/verify-tp-systag-override.ts [qcode] [system_tag]
 *   defaults: QAC00053 "QYE++ Zerodha Total Portfolio"
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const fmt = (d: Date | null | undefined) =>
  d ? d.toISOString().split("T")[0] : "—";

async function main() {
  const qcode = process.argv[2] || "QAC00053";
  const tag = process.argv[3] || "QYE++ Zerodha Total Portfolio";

  console.log("=".repeat(80));
  console.log(`VERIFY TP override data contract — ${qcode} | "${tag}"`);
  console.log("=".repeat(80));

  const count = await prisma.bifurcated_master_sheet_test.count({
    where: { qcode, system_tag: tag },
  });
  const first = await prisma.bifurcated_master_sheet_test.findFirst({
    where: { qcode, system_tag: tag, nav: { not: null } },
    orderBy: { date: "asc" },
    select: { date: true, nav: true, prev_nav: true },
  });
  const last = await prisma.bifurcated_master_sheet_test.findFirst({
    where: { qcode, system_tag: tag, nav: { not: null } },
    orderBy: { date: "desc" },
    select: { date: true, nav: true },
  });

  console.log(`  rows:        ${count}`);
  console.log(`  date range:  ${fmt(first?.date)} -> ${fmt(last?.date)}`);
  console.log(`  first nav:   ${first?.nav}  prev_nav: ${first?.prev_nav}`);
  console.log(`  last nav:    ${last?.nav}`);

  const prevNav = first?.prev_nav != null ? Number(first.prev_nav) : null;
  const baselineOk = prevNav === 100;
  const hasData = count > 0 && !!first && !!last;

  console.log("");
  console.log(`  ${hasData ? "✓" : "✗"} tag has a bounded date range`);
  console.log(
    `  ${baselineOk ? "✓" : "✗"} first occurrence prev_nav = 100 ` +
      `(override baseline)${baselineOk ? "" : ` — got ${prevNav}`}`
  );

  await prisma.$disconnect();
  process.exit(hasData && baselineOk ? 0 : 1);
}

main().catch(async (e) => {
  console.error("Error:", e);
  await prisma.$disconnect();
  process.exit(1);
});
