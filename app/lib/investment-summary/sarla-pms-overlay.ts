/**
 * Sarla (QUS0007) is the only client whose Overview Cash Summary needs
 * corrections the generic Postgres-native calculator (a straight port of
 * calculations.py's calc_overview_cash_summary) can't produce on its own —
 * confirmed by reading the real Python source directly, which has no PMS
 * concept at all and derives "Total Realised"/"inactive_realised" purely
 * from Master_Config.csv rows. Two gaps, both real for Sarla specifically:
 *
 * 1. Her PMS allocation lives entirely in pms_master_sheet, a table the
 *    generic formula never touches — "Current Zerodha Cash" and "Check"
 *    both come out Zerodha-only, understating her real current cash
 *    position by her whole PMS value.
 * 2. Master_Config.csv has no Inactive rows for QAC00041 (only her single
 *    active QYE+ row), so the generic formula's "inactive_realised" term
 *    is always 0 — her six historical schemes (A/C/D/E/F/QAW) never flow
 *    into Total Realised. Their combined profit is tracked instead as a
 *    fixed, hand-verified figure in profit-redeployment-overrides.ts.
 *
 * On top of the inactive-schemes figure, the data team's own manual
 * reconciliation applies 6 fixed adjustment amounts (confirmed one by one,
 * not derivable from any table) correcting for known double-counted /
 * never-realised-as-cash profit across the Scheme A -> B and MF-transfer-
 * at-scheme-close redeployment paths.
 *
 * This module layers both corrections onto the generic view returned by
 * calcCombinedSummary, recomputing every downstream row (Total Realised ->
 * Total Profits -> Total Cash Generated -> Check) so they stay internally
 * consistent. Scoped to QUS0007 only — every other client's
 * OverviewCashSummaryView passes through completely unchanged.
 */
import { PortfolioApi } from "@/app/lib/sarla-utils";
import * as tags from "./tags";
import { getBaseTags } from "./config";
import type { OverviewCashSummaryView } from "./strategy-summaries";

const SARLA_ICODE = "QUS0007";
const SARLA_PMS_QCODE = "QAC00041";

/** Sum of Scheme A/C/D/E/F/QAW lifetime PnL — see profit-redeployment-overrides.ts's "Total Profits" row (same figure, same source). */
const INACTIVE_SCHEMES_TOTAL_PROFIT = 115212193.4;

/** The 6 manual reconciliation adjustments, confirmed one by one against the data team's ground-truth Excel logic. Fixed figures — not derivable from any table. */
const MANUAL_ADJUSTMENTS = [
  { label: "Scheme A profit redeployed to Scheme B (double-count removal)", amount: -4955516.5 },
  { label: "Portion of above never added to MA Cash+Liquidcase (reversal)", amount: 374853.9 },
  { label: "Equity dividends — never received as Qode cash", amount: -2201050.7 },
  { label: "MF profit transferred unrealised at Scheme A close", amount: -6098413.5 },
  { label: "Tata Liquid fund sale profit — flowed through to PMS on Scheme A close", amount: 777979.27 },
  { label: "Tata Liquid fund sale shortfall (cap-out)", amount: -77979.3 },
];
const MANUAL_ADJUSTMENTS_NET = MANUAL_ADJUSTMENTS.reduce((sum, a) => sum + a.amount, 0);

function getAmount(view: OverviewCashSummaryView, label: string): number {
  return view.rows.find((r) => r.label === label)?.amount ?? 0;
}

export async function applySarlaPmsOverlay(
  icode: string,
  view: OverviewCashSummaryView,
): Promise<OverviewCashSummaryView> {
  if (icode !== SARLA_ICODE) return view;

  const { currentExposure: pmsValue, totalProfit: pmsProfit } = await PortfolioApi.getPmsSummary(SARLA_PMS_QCODE);

  // "Total Realised" as computed by the generic formula is just the QYE+-scoped
  // live adjustmentItems (inactiveRealised = 0, eqPurchaseSold = 0 for her —
  // see this file's header comment). That's the "current" component; layer the
  // fixed inactive-schemes total and the 6 manual adjustments on top of it.
  //
  // Deliberately excluding Liquidbees and Misc P&L from liveAdjustmentItems below —
  // per explicit instruction (2026-08-18). Note: calc-only testing showed this makes
  // Check move further from zero, not closer (from -₹78,777.23 to -₹1,48,617.56 at
  // the time it was tested) — flagging that here since it's counter to what every
  // other correction in this file was chosen for.
  const baseTags = await getBaseTags();
  const [liquidbeesLive, miscPnlLive] = await Promise.all([
    tags.sumPnl(SARLA_PMS_QCODE, baseTags.liquidbees, { strategyPrefix: "QYE+ ", allowUnprefixedFallback: true }),
    tags.sumPnl(SARLA_PMS_QCODE, baseTags.miscellaneousPnl, { strategyPrefix: "QYE+ ", allowUnprefixedFallback: true }),
  ]);
  const liveAdjustmentItems = getAmount(view, "Total Realised") - liquidbeesLive - miscPnlLive;
  const totalRealised = liveAdjustmentItems + INACTIVE_SCHEMES_TOTAL_PROFIT + MANUAL_ADJUSTMENTS_NET;

  // Total Unrealised = active-strategy (QYE+) PnL, as the generic formula
  // already computes, plus Scheme PMS QAW's own lifetime profit — PMS is a
  // live, still-active strategy whose gains aren't reflected anywhere else
  // in Total Realised/Unrealised (Current Zerodha Cash's PMS addition above
  // is her cash POSITION, not her PMS profit).
  const totalUnrealised = getAmount(view, "Total Unrealised") + pmsProfit;
  const cashInvestment = getAmount(view, "Cash Investment");
  const currentZerodhaCash = getAmount(view, "Current Zerodha Cash") + pmsValue;

  const totalProfits = totalRealised + totalUnrealised;
  const totalCashGenerated = totalProfits + cashInvestment;
  const check = currentZerodhaCash - totalCashGenerated;

  const rows = view.rows.map((row) => {
    switch (row.label) {
      case "Total Realised":
        return { ...row, amount: totalRealised };
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
    ...view.adjustments.map((a) =>
      a.label === "Inactive Realised" ? { ...a, amount: INACTIVE_SCHEMES_TOTAL_PROFIT } : a,
    ),
    { label: "Manual Reconciliation Adjustments (net)", amount: MANUAL_ADJUSTMENTS_NET },
    { label: "Scheme PMS QAW Profit (Unrealised)", amount: pmsProfit },
  ];

  return { rows, adjustments };
}
