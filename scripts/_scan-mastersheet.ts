/**
 * TEMP read-only: find master_sheet (qcode, system_tag) series whose FIRST nav is
 * NOT ~100 or whose first prev_nav != 100 — these break the regular-account
 * override return calc (which forces initialNav=100). READ-ONLY ($queryRaw SELECT).
 * Usage: npx tsx scripts/_scan-mastersheet.ts
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // First nav/prev_nav per (qcode, system_tag) via DISTINCT ON (Postgres).
  const rows = await prisma.$queryRaw<Array<{ qcode: string; system_tag: string; nav: number; prev_nav: number | null; date: Date }>>`
    SELECT DISTINCT ON (qcode, system_tag) qcode, system_tag, nav::float8 as nav, prev_nav::float8 as prev_nav, date
    FROM master_sheet
    WHERE nav IS NOT NULL
    ORDER BY qcode, system_tag, date ASC
  `;
  console.log(`total (qcode,tag) series in master_sheet: ${rows.length}`);
  const navNot100 = rows.filter((r) => r.nav < 90 || r.nav > 110);
  const prevNot100 = rows.filter((r) => r.prev_nav == null || Math.abs(r.prev_nav - 100) > 0.001);
  console.log(`series whose FIRST nav is outside [90,110]: ${navNot100.length}`);
  console.log(`series whose FIRST prev_nav != 100 (or null): ${prevNot100.length}`);

  console.log(`\n--- sample: first nav far from 100 (these break forced-100 override) ---`);
  navNot100.slice(0, 25).forEach((r) =>
    console.log(`  ${r.qcode}  "${r.system_tag}"  firstNav=${r.nav.toFixed(3)} prevNav=${r.prev_nav} @${r.date.toISOString().slice(0,10)}`)
  );

  // How many distinct qcodes are affected, and do they have >1 tag (dropdown shows)?
  const affectedQcodes = new Set(navNot100.map((r) => r.qcode));
  console.log(`\ndistinct qcodes with at least one non-100 nav tag: ${affectedQcodes.size}`);

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
