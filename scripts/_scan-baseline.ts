/**
 * TEMP read-only: scan tags of given qcodes for the forced-100-baseline trigger —
 * tags whose FIRST row prev_nav is null or != 100 (the engine forces firstNav=100
 * for fresh schemes, so overriding to such a tag yields a wrong return).
 * Usage: npx tsx scripts/_scan-baseline.ts QAC00065 QAC00056 ...
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const nz = (x: any) => (x == null ? null : Number(x));

async function main() {
  const qcodes = process.argv.slice(2);
  if (qcodes.length === 0) { console.log("pass qcodes"); process.exit(1); }
  for (const qcode of qcodes) {
    const distinct = await prisma.bifurcated_master_sheet_test.findMany({
      where: { qcode }, select: { system_tag: true }, distinct: ["system_tag"],
    });
    const tags = distinct.map((d) => d.system_tag);
    let flagged = 0;
    const examples: string[] = [];
    for (const tag of tags) {
      const first = await prisma.bifurcated_master_sheet_test.findFirst({
        where: { qcode, system_tag: tag, nav: { not: null } }, orderBy: { date: "asc" },
        select: { date: true, nav: true, prev_nav: true },
      });
      if (!first) continue;
      const pn = nz(first.prev_nav);
      const fn = nz(first.nav);
      const violates = pn == null || Math.abs(pn - 100) > 0.001;
      if (violates) {
        flagged++;
        if (examples.length < 12) examples.push(`    "${tag}": firstNav=${fn} prevNav=${pn} @${first.date.toISOString().slice(0,10)}`);
      }
    }
    console.log(`\n${qcode}: ${tags.length} tags, ${flagged} with first-row prev_nav != 100`);
    examples.forEach((e) => console.log(e));
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
