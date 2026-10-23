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
  // Some inception rows are booked with prev_nav = nav ≠ 10 (e.g. Dinesh
  // QAW00356 opens at 9.8938), which drops the day-one move. PMS units start
  // at 10, so restore that as the first row's base.
  if (daily.length && daily[0].prevNav === daily[0].nav && daily[0].nav !== 10) {
    daily[0].prevNav = 10;
  }

  const deposited = daily.reduce((s, d) => s + d.cashIn, 0);
  const totalProfit = daily.reduce((s, d) => s + d.pnl, 0);
  const currentValue = daily.length ? daily[daily.length - 1].value : 0;
  const cashFlows: CashFlow[] = daily
    .filter((d) => d.cashIn !== 0)
    .map((d) => ({ date: d.date, amount: d.cashIn, dividend: 0 }));

  return { accountCode, daily, deposited, currentValue, totalProfit, cashFlows };
}

// Chains several PMS accounts that ran one after another (e.g. a closed account
// and its successor) into a single TWRR series for one PMS page. Each later
// account's unit NAV is scaled so its first day continues from the previous
// account's last NAV: chained = anchor × nav / firstBase. Values, pnl and cash
// pass through unchanged. Assumes the accounts' date ranges do not overlap.
export async function getChainedPmsSeries(
  accountCodes: string[]
): Promise<PmsAccountSeries> {
  const parts = (await Promise.all(accountCodes.map(getPmsAccountSeries)))
    .filter((s) => s.daily.length > 0)
    .sort((a, b) => a.daily[0].date.localeCompare(b.daily[0].date));

  const daily: PmsDailyPoint[] = [];
  for (const part of parts) {
    const anchor = daily.length ? daily[daily.length - 1].nav : null;
    const firstBase = part.daily[0].prevNav || part.daily[0].nav || 1;
    const scale = anchor != null ? anchor / firstBase : 1;
    part.daily.forEach((d, i) => {
      daily.push({
        ...d,
        nav: d.nav * scale,
        prevNav:
          i === 0
            ? anchor ?? d.prevNav
            : d.prevNav != null ? d.prevNav * scale : null,
      });
    });
  }

  const deposited = daily.reduce((s, d) => s + d.cashIn, 0);
  const totalProfit = daily.reduce((s, d) => s + d.pnl, 0);
  const currentValue = daily.length ? daily[daily.length - 1].value : 0;
  const cashFlows: CashFlow[] = daily
    .filter((d) => d.cashIn !== 0)
    .map((d) => ({ date: d.date, amount: d.cashIn, dividend: 0 }));

  return {
    accountCode: accountCodes.join("+"),
    daily, deposited, currentValue, totalProfit, cashFlows,
  };
}
