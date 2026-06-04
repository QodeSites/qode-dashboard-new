/**
 * TEMP read-only: verify ALL THREE override dropdowns (deposit/nav/cashflow) for a
 * single-scheme client by overriding each independently and comparing the engine's
 * output to an independent raw computation of the chosen tag (full range AND windowed
 * to the scheme inception). READ-ONLY.
 * Usage: npx tsx scripts/_verify-dropdowns.ts <qcode> <scheme> <tag>
 */
import { getEngineForQcode } from "../app/lib/bifurcated-portfolio-utils";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const N = (x: any) => (x == null ? null : Number(x));
const f2 = (x: any) => (x == null ? "—" : Number(x).toFixed(2));

async function runEngine(qcode: string, extra: Record<string, string>) {
  const engine = getEngineForQcode(qcode)!;
  const p = new URLSearchParams({ qcode, ...extra });
  const res = await engine.handleGET(new Request(`http://x/api/bifurcated-portfolio?${p}`));
  const json: any = await res.json();
  const key = Object.keys(json)[0];
  return json[key].data;
}

async function rawForTag(qcode: string, tag: string, since?: Date) {
  const w: any = { qcode, system_tag: tag };
  const ww: any = since ? { ...w, date: { gte: since } } : w;
  const first = await prisma.bifurcated_master_sheet_test.findFirst({ where: { ...ww, nav: { not: null } }, orderBy: { date: "asc" }, select: { date: true, nav: true, prev_nav: true } });
  const last = await prisma.bifurcated_master_sheet_test.findFirst({ where: { ...ww, nav: { not: null } }, orderBy: { date: "desc" }, select: { date: true, nav: true, portfolio_value: true } });
  const sumPnl = await prisma.bifurcated_master_sheet_test.aggregate({ where: { ...ww, pnl: { not: null } }, _sum: { pnl: true } });
  const sumCio = await prisma.bifurcated_master_sheet_test.aggregate({ where: { ...ww, capital_in_out: { not: null } }, _sum: { capital_in_out: true } });
  const cfRows = await prisma.bifurcated_master_sheet_test.count({ where: { ...ww, AND: [{ capital_in_out: { not: null } }, { capital_in_out: { not: 0 } }] } });
  return { firstNav: N(first?.nav), prevNav: N(first?.prev_nav), firstDate: first?.date, lastNav: N(last?.nav), lastPV: N(last?.portfolio_value), sumPnl: N(sumPnl._sum.pnl), sumCio: N(sumCio._sum.capital_in_out), cfRows };
}

async function main() {
  const [, , qcode, scheme, tag] = process.argv;
  if (!qcode || !scheme || !tag) { console.log("usage: <qcode> <scheme> <tag>"); process.exit(1); }

  const def = await runEngine(qcode, {});
  // scheme inception = first real curve date (curve[0] is the prepended 100 baseline)
  const since = def.equityCurve?.[1]?.date ? new Date(def.equityCurve[1].date) : undefined;
  console.log(`qcode=${qcode} scheme="${scheme}" tag="${tag}"  inception(window)=${since?.toISOString().slice(0,10)}`);

  const rawFull = await rawForTag(qcode, tag);
  const rawWin = await rawForTag(qcode, tag, since);
  console.log(`\nRAW tag full-range:  first ${rawFull.firstDate?.toISOString().slice(0,10)} nav=${rawFull.firstNav} prevNav=${rawFull.prevNav}  last nav=${rawFull.lastNav} PV=${f2(rawFull.lastPV)}  Σpnl=${f2(rawFull.sumPnl)} Σcio=${f2(rawFull.sumCio)} cfRows=${rawFull.cfRows}`);
  console.log(`RAW tag windowed:    Σpnl=${f2(rawWin.sumPnl)} Σcio=${f2(rawWin.sumCio)} lastPV=${f2(rawWin.lastPV)} cfRows=${rawWin.cfRows}`);

  // 1) DEPOSIT/VALUE dropdown
  const dep = await runEngine(qcode, { scheme, depositTag: tag });
  console.log(`\n[DEPOSIT/VALUE override]`);
  console.log(`  engine amountDeposited = ${dep.amountDeposited}   raw Σcio(full)=${f2(rawFull.sumCio)} (win)=${f2(rawWin.sumCio)}  ${f2(N(dep.amountDeposited)) === f2(rawWin.sumCio) ? "== windowed" : f2(N(dep.amountDeposited)) === f2(rawFull.sumCio) ? "== full" : "*** NEITHER ***"}`);
  console.log(`  engine currentExposure = ${dep.currentExposure}   raw lastPV(full)=${f2(rawFull.lastPV)} (win)=${f2(rawWin.lastPV)}  ${f2(N(dep.currentExposure)) === f2(rawWin.lastPV) ? "== windowed" : f2(N(dep.currentExposure)) === f2(rawFull.lastPV) ? "== full" : "*** NEITHER ***"}`);

  // 2) RETURNS/P&L dropdown
  const nav = await runEngine(qcode, { scheme, navTag: tag });
  const rWin = rawWin.lastNav ? ((rawWin.lastNav / 100 - 1) * 100).toFixed(2) : "—";
  console.log(`\n[RETURNS/P&L override]`);
  console.log(`  engine return = ${nav.return}%   raw last/100=${rWin}%  last/first(naive)=${rawWin.firstNav && rawWin.lastNav ? ((rawWin.lastNav/rawWin.firstNav-1)*100).toFixed(2) : "—"}%`);
  console.log(`  engine totalProfit = ${nav.totalProfit}   raw Σpnl(win)=${f2(rawWin.sumPnl)} (full)=${f2(rawFull.sumPnl)}  ${f2(N(nav.totalProfit)) === f2(rawWin.sumPnl) ? "== windowed" : f2(N(nav.totalProfit)) === f2(rawFull.sumPnl) ? "== full" : "*** NEITHER ***"}`);

  // 3) CASH FLOW dropdown
  const cf = await runEngine(qcode, { scheme, cashflowTag: tag });
  const cfList = cf.cashFlows || [];
  const cfSum = cfList.reduce((s: number, x: any) => s + (x.amount || 0), 0);
  console.log(`\n[CASH FLOW override]`);
  console.log(`  engine cashFlows: count=${cfList.length} sum=${f2(cfSum)}   raw non-zero rows(win)=${rawWin.cfRows} Σcio(win)=${f2(rawWin.sumCio)} | full rows=${rawFull.cfRows} Σcio(full)=${f2(rawFull.sumCio)}`);
  console.log(`  ${cfList.length === rawWin.cfRows ? "count == windowed" : cfList.length === rawFull.cfRows ? "count == full" : "*** count mismatch ***"}`);

  await prisma.$disconnect();
  process.exit(0);
}
main().catch(async (e) => { console.error("ERR:", e); await prisma.$disconnect(); process.exit(1); });
