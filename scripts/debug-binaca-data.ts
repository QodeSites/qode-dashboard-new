import { prisma } from "../lib/prisma";

async function main() {
  const qcode = "QAC00107";

  console.log(`=== Account row for ${qcode} ===`);
  const acct = await prisma.accounts.findFirst({
    where: { qcode },
    select: { qcode: true, account_name: true, account_type: true, broker: true, strategy: true },
  });
  console.log(acct);

  console.log(`\n=== Date range coverage for relevant tags (QAC00107) ===`);
  for (const tag of [
    "Total Portfolio Exposure",
    "Total Portfolio Value",
    "Zerodha Total Portfolio",
  ]) {
    const first = await prisma.master_sheet.findFirst({
      where: { qcode, system_tag: tag },
      orderBy: { date: "asc" },
      select: { date: true },
    });
    const last = await prisma.master_sheet.findFirst({
      where: { qcode, system_tag: tag },
      orderBy: { date: "desc" },
      select: { date: true },
    });
    const count = await prisma.master_sheet.count({ where: { qcode, system_tag: tag } });
    console.log(
      `tag="${tag}"  rows=${count}  first=${first?.date.toISOString().split("T")[0] ?? "—"}  last=${last?.date.toISOString().split("T")[0] ?? "—"}`,
    );
  }

  console.log(`\n=== Last 5 rows for "Total Portfolio Value" (QAC00107) ===`);
  const tpv = await prisma.master_sheet.findMany({
    where: { qcode, system_tag: "Total Portfolio Value" },
    orderBy: { date: "desc" },
    take: 5,
    select: { date: true, nav: true, drawdown: true, portfolio_value: true },
  });
  tpv.forEach((r) =>
    console.log(
      `date=${r.date.toISOString().split("T")[0]}  nav=${r.nav}  drawdown=${r.drawdown}  pv=${r.portfolio_value}`,
    ),
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
