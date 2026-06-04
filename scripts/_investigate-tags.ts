/**
 * TEMP read-only: dump raw aggregates for ALL tags of a qcode in bifurcated_master_sheet_test.
 * Usage: npx tsx scripts/_investigate-tags.ts QAC00065 [startDateISO]
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const fmt = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");
const nz = (x: any) => (x == null ? null : Number(x));

async function main() {
  const qcode = process.argv[2] || "QAC00065";
  const startDate = process.argv[3] ? new Date(process.argv[3]) : null;
  const distinct = await prisma.bifurcated_master_sheet_test.findMany({
    where: { qcode }, select: { system_tag: true }, distinct: ["system_tag"],
  });
  const tags = distinct.map((d) => d.system_tag).sort();
  console.log(`qcode=${qcode}  tags=${tags.length}${startDate ? `  (window >= ${fmt(startDate)})` : ""}`);
  for (const tag of tags) {
    const where: any = { qcode, system_tag: tag };
    const whereWin: any = startDate ? { ...where, date: { gte: startDate } } : where;
    const count = await prisma.bifurcated_master_sheet_test.count({ where: whereWin });
    if (count === 0) { console.log(`\n[${tag}] — 0 rows in window`); continue; }
    const first = await prisma.bifurcated_master_sheet_test.findFirst({
      where: { ...whereWin, nav: { not: null } }, orderBy: { date: "asc" },
      select: { date: true, nav: true, prev_nav: true, portfolio_value: true, capital_in_out: true },
    });
    const last = await prisma.bifurcated_master_sheet_test.findFirst({
      where: { ...whereWin, nav: { not: null } }, orderBy: { date: "desc" },
      select: { date: true, nav: true, portfolio_value: true },
    });
    const sumPnl = await prisma.bifurcated_master_sheet_test.aggregate({ where: { ...whereWin, pnl: { not: null } }, _sum: { pnl: true } });
    const sumCio = await prisma.bifurcated_master_sheet_test.aggregate({ where: { ...whereWin, capital_in_out: { not: null } }, _sum: { capital_in_out: true } });
    const fn = nz(first?.nav), ln = nz(last?.nav), pn = nz(first?.prev_nav);
    // Excel-style returns under different baseline conventions:
    const rNaive = fn && ln ? ((ln / fn - 1) * 100).toFixed(2) : "—";
    const rPrev = pn && ln ? ((ln / pn - 1) * 100).toFixed(2) : "—";
    const r100 = ln ? ((ln / 100 - 1) * 100).toFixed(2) : "—";
    console.log(`\n[${tag}] rows=${count} ${fmt(first?.date)}->${fmt(last?.date)}`);
    console.log(`  firstNav=${fn} prevNav=${pn} lastNav=${ln}`);
    console.log(`  return: last/first=${rNaive}%  last/prevNav=${rPrev}%  last/100=${r100}%`);
    console.log(`  Σpnl=${nz(sumPnl._sum.pnl)?.toFixed(2)}  Σcap_in_out=${nz(sumCio._sum.capital_in_out)?.toFixed(2)}  lastPV=${nz(last?.portfolio_value)?.toFixed(2)}`);
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
