// READ-ONLY bridge to pms_master_sheet. The ONLY module that reads PMS data.
// Returns normalized daily series + summary cards for one PMS account_code.
import { prisma } from "@/lib/prisma";   // NAMED export — not default
import type { CashFlow } from "./bifurcated-portfolio-utils";

export interface PmsDailyPoint {
  date: string;            // YYYY-MM-DD
  value: number;           // portfolio_value
  nav: number;             // unit NAV (base ~10)
  prevNav: number | null;
  pnl: number;
  cashIn: number;          // cash_in_out
}

export interface PmsAccountSeries {
  accountCode: string;
  daily: PmsDailyPoint[];
  deposited: number;       // Σ cash_in_out
  currentValue: number;    // latest portfolio_value
  totalProfit: number;     // Σ pnl
  cashFlows: CashFlow[];
}

function ymd(d: Date): string {
  return d.toISOString().split("T")[0];
}

export async function getPmsAccountSeries(
  accountCode: string
): Promise<PmsAccountSeries> {
  const rows = await prisma.pms_master_sheet.findMany({
    where: { account_code: accountCode },
    select: {
      report_date: true,
      portfolio_value: true,
      cash_in_out: true,
      nav: true,
      prev_nav: true,
      pnl: true,
    },
    orderBy: { report_date: "asc" },
  });

  const daily: PmsDailyPoint[] = rows.map((r) => ({
    date: ymd(r.report_date),
    value: Number(r.portfolio_value) || 0,
    nav: Number(r.nav) || 0,
    prevNav: r.prev_nav != null ? Number(r.prev_nav) : null,
    pnl: Number(r.pnl) || 0,
    cashIn: Number(r.cash_in_out) || 0,
  }));

  const deposited = daily.reduce((s, d) => s + d.cashIn, 0);
  const totalProfit = daily.reduce((s, d) => s + d.pnl, 0);
  const currentValue = daily.length ? daily[daily.length - 1].value : 0;
  const cashFlows: CashFlow[] = daily
    .filter((d) => d.cashIn !== 0)
    .map((d) => ({ date: d.date, amount: d.cashIn, dividend: 0 }));

  return { accountCode, daily, deposited, currentValue, totalProfit, cashFlows };
}
