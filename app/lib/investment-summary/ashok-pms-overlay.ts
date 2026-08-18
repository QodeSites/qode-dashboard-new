/**
 * Ashok Jogani HUF (QUS00124 / QAC00110) has 3 PMS accounts
 * (QTF00161, QGF00157, QAW00158 in pms_master_sheet) that the generic
 * Postgres-native calculator never touches — same class of gap as Sarla's
 * PMS QAW (see sarla-pms-overlay.ts), just with 3 accounts instead of 1.
 * Unlike Satidham/Sarla, Ashok is NOT excluded from the generic engine (his
 * own qcode QAC00110 has real QAW+/QAW++ data) — this overlay only patches
 * his overviewCashSummary on top of the generic result, same layering
 * pattern as applySarlaPmsOverlay.
 *
 * A 4th account under the same client_name (account_code "61608", latest
 * value ₹7,52,91,470.59) was found in pms_master_sheet but deliberately
 * excluded per explicit instruction (2026-08-18) — it has no corresponding
 * cash_transactions.csv entry and wasn't part of the QTF/QGF/QAW scheme set
 * the data team gave numbers for.
 *
 * Per explicit instruction: ALL 3 PMS schemes' profit (active or inactive)
 * folds into Total Unrealised as one lump — no Realised/Unrealised split,
 * no per-scheme Realised bucket (unlike Satidham's closed-scheme
 * treatment). And per explicit instruction, none of these 3 schemes should
 * appear anywhere in the investment-summary web frontend: confirmed
 * app/investment-summary/page.tsx never reads overviewCashSummary.adjustments
 * (only xlsx-export.ts does, for the admin-only Excel download), so listing
 * the per-scheme breakdown there keeps it fully out of the web UI. No new
 * `strategies` entry, no `perStrategy` key, no Profit Redeployment row is
 * added anywhere — this overlay only ever touches overviewCashSummary.
 */
import { prisma } from "@/lib/prisma";
import type { OverviewCashSummaryView } from "./strategy-summaries";

const ASHOK_ICODE = "QUS00124";

const ASHOK_PMS_ACCOUNT_CODES: Record<string, string> = {
  QTF: "QTF00161",
  QGF: "QGF00157",
  QAW: "QAW00158",
};

async function getPmsSchemeSummary(accountCode: string): Promise<{ currentExposure: number; totalProfit: number }> {
  const rows = await prisma.pms_master_sheet.findMany({
    where: { account_code: accountCode },
    orderBy: { report_date: "asc" },
    select: { portfolio_value: true, pnl: true },
  });
  const latest = rows.at(-1);
  return {
    currentExposure: latest ? Number(latest.portfolio_value) || 0 : 0,
    totalProfit: rows.reduce((sum, r) => sum + (Number(r.pnl) || 0), 0),
  };
}

function getAmount(view: OverviewCashSummaryView, label: string): number {
  return view.rows.find((r) => r.label === label)?.amount ?? 0;
}

export async function applyAshokPmsOverlay(
  icode: string,
  view: OverviewCashSummaryView,
): Promise<OverviewCashSummaryView> {
  if (icode !== ASHOK_ICODE) return view;

  const entries = Object.entries(ASHOK_PMS_ACCOUNT_CODES);
  const summaries = await Promise.all(entries.map(([, code]) => getPmsSchemeSummary(code)));

  const pmsTotalExposure = summaries.reduce((sum, s) => sum + s.currentExposure, 0);
  const pmsTotalProfit = summaries.reduce((sum, s) => sum + s.totalProfit, 0);

  const totalUnrealised = getAmount(view, "Total Unrealised") + pmsTotalProfit;
  const totalRealised = getAmount(view, "Total Realised");
  const cashInvestment = getAmount(view, "Cash Investment");
  const currentZerodhaCash = getAmount(view, "Current Zerodha Cash") + pmsTotalExposure;

  const totalProfits = totalRealised + totalUnrealised;
  const totalCashGenerated = totalProfits + cashInvestment;
  const check = currentZerodhaCash - totalCashGenerated;

  const rows = view.rows.map((row) => {
    switch (row.label) {
      case "Total Unrealised":
        return { ...row, amount: totalUnrealised };
      case "Total Profits":
        return { ...row, amount: totalProfits };
      case "Total Cash Generated":
        return { ...row, amount: totalCashGenerated };
      case "Current Zerodha Cash":
        return { ...row, amount: currentZerodhaCash };
      case "Check":
        return { ...row, amount: check };
      default:
        return row;
    }
  });

  const adjustments = [
    ...view.adjustments,
    ...entries.map(([scheme], i) => ({
      label: `Scheme PMS ${scheme} Profit (Unrealised)`,
      amount: summaries[i].totalProfit,
    })),
    ...entries.map(([scheme], i) => ({
      label: `Scheme PMS ${scheme} Current Exposure`,
      amount: summaries[i].currentExposure,
    })),
  ];

  return { rows, adjustments };
}
