/**
 * Port of calculations.py's calc_overview_cash_summary (`/opt/investment-summary/investment-summary-excel/src/calculations.py`,
 * WSL, ~line 546). Confirmed 2026-08-13 against the literal source (not just
 * the doc 02 summary) — see main.py ~line 248-335 for the two real call-site
 * shapes this function must support:
 *
 *  - Single-active-strategy client (main.py's `not multi_strategy` branch):
 *    ONE call, with `adjustmentStrategyNames` = [active strategy] + every
 *    INACTIVE NON-full-cash strategy's name, and `inactiveRealisedRows` =
 *    EVERY inactive row (full-cash or not) — this is the "client-wide" scope.
 *  - Multi-active-strategy client (2+ concurrently active strategies,
 *    main.py's `else` branch, `calc_per_strategy_summaries`): each active
 *    strategy's OWN per-strategy sheet gets a call scoped to ONLY that one
 *    strategy's own name for `adjustmentStrategyNames`, and an EMPTY
 *    `inactiveRealisedRows` — inactive-strategy profit is instead folded in
 *    exactly once at the combined level (see strategy-summaries.ts's
 *    `overviewCashScope` helper and calc_combined_summaries's separate
 *    `inactive_realised` loop, calculations.py ~line 822-828).
 *
 * The caller (strategy-summaries.ts) is responsible for picking the right
 * scope per call — this function just sums whatever prefixes/rows it's given.
 *
 * Deliberately ADDITIVE, not residual (doc 02): `check` is meant to be a
 * real signal of bad/missing data, not forced to zero by construction.
 *
 * Must preserve the full-cash-strategy exclusion fix: full-cash INACTIVE
 * strategies (QAW+/QAW++/QTF+/QTF++) are excluded from `adjustmentStrategyNames`
 * by the caller, because their `forProfitTag` already nets everything
 * internally — double-counting them produced an exact ₹33,805.44 discrepancy
 * for Mangesh Hirve (QAC00064) in the Python pipeline, per doc 02. Mangesh
 * Hirve has exactly this shape (inactive QAW++ + active QYE++), so he's used
 * as the regression-test client below.
 */
import * as tags from "./tags";
import * as mastersheet from "./mastersheet";
import { isFullCashStrategy } from "./tradebook";
import { getBaseTags } from "./config";
import type { ClientStrategyConfigRow } from "./types";

export interface OverviewCashSummary {
  /** liq + lb + miscPnl + eqOther + eqTax, summed across whichever strategy names the caller passed in `adjustmentStrategyNames` — see this file's header comment for the two real scopes. */
  adjustmentItems: number;
  /** calc_eq_purchase_sold's result for this client (from cash-inputs.ts), passed in by the caller. */
  eqPurchaseSold: number;
  /** Sum of sumPnl(forProfitTag) across whichever rows the caller passed in `inactiveRealisedRows` — empty for a multi-active-strategy client's per-strategy sheets (folded in once at the combined level instead). */
  inactiveRealised: number;
  totalRealised: number;
  /** sumPnl(forProfitTag) for the ONE active strategy this summary is being computed for. */
  totalUnrealised: number;
  totalProfits: number;
  /** calc_cash_investment_summary's netCashBalance for this client/strategy, passed in by the caller. */
  cashInvestment: number;
  totalCashGenerated: number;
  currentZerodhaCash: number;
  /** currentZerodhaCash - totalCashGenerated — the reconciliation signal. abs(check) < 1.0 is doc 02's "PASS" threshold (see validation.ts). */
  check: number;
}

/**
 * Sums the 5 "adjustment item" base tags (liquidcase, liquidbees,
 * miscellaneous_pnl, equity_other_debits_credits, equity_holdings_tax) for
 * ONE strategy prefix, via tags.ts (alias-aware). `isMultiActive` gates
 * allowUnprefixedFallback the same way as the ztp/esh/mf/bond/liq/lb lookups
 * below (see calcOverviewCashSummary's header comment) — multi-active
 * clients must not fall back to an unprefixed tag (would leak another
 * strategy's numbers), but single-active clients default to allowing it,
 * matching main.py's single-active call site which passes no
 * strategy_prefix at all. Missed when the isMultiActive fix first landed;
 * confirmed 2026-08-14 this helper was hardcoding false unconditionally.
 */
async function sumAdjustmentItemsForStrategy(
  qcode: string,
  strategyName: string,
  baseTags: Awaited<ReturnType<typeof getBaseTags>>,
  isMultiActive: boolean,
): Promise<number> {
  const prefix = `${strategyName} `;
  const opts = { strategyPrefix: prefix, allowUnprefixedFallback: !isMultiActive };

  const [liquidcase, liquidbees, miscPnl, eqOther, eqTax] = await Promise.all([
    tags.sumPnl(qcode, baseTags.liquidcaseStockHoldings, opts),
    tags.sumPnl(qcode, baseTags.liquidbees, opts),
    tags.sumPnl(qcode, baseTags.miscellaneousPnl, opts),
    tags.sumPnl(qcode, baseTags.equityOtherDebitsCredits, opts),
    tags.sumPnl(qcode, baseTags.equityHoldingsTax, opts),
  ]);

  return liquidcase + liquidbees + miscPnl + eqOther + eqTax;
}

/**
 * Port of calc_overview_cash_summary. Computed for ONE active strategy at a
 * time (matching calc_current_account_summary's per-strategy shape).
 *
 * `adjustmentStrategyNames` and `inactiveRealisedRows` are the caller-chosen
 * SCOPE for this call — see this file's header comment for the two exact
 * shapes Python uses (single-active-strategy client vs each per-strategy
 * sheet of a multi-active-strategy client). This function does not derive
 * that scope itself; it just sums whatever it's given.
 *
 * `isMultiActive` gates the SAME branch for the ztp/esh/mf/bond/liq/lb
 * lookups behind `currentZerodhaCash` — confirmed 2026-08-13 this was
 * missed when the scope fix above first landed. Python's `tag()` closure
 * (calculations.py:605-608) uses whatever `strategy_prefix` the CALLER
 * passed: main.py's single-active-strategy call (~298-306) passes none at
 * all (defaults to "", `allow_unprefixed_fallback` defaults True), while
 * only the multi-active call site (calc_per_strategy_summaries,
 * calculations.py:747-757) passes the strategy-prefixed,
 * fallback-disabled form. Hardcoding the prefixed form unconditionally
 * here corrupted `currentZerodhaCash`/`check` for single-active clients
 * whose Mastersheet stores these tags unprefixed.
 */
export async function calcOverviewCashSummary(
  qcode: string,
  activeRow: ClientStrategyConfigRow,
  adjustmentStrategyNames: string[],
  inactiveRealisedRows: ClientStrategyConfigRow[],
  isMultiActive: boolean,
  cashInvestment: number,
  eqPurchaseSold: number,
): Promise<OverviewCashSummary> {
  const baseTags = await getBaseTags();
  const fullCashActive = isFullCashStrategy(activeRow.strategy);

  const adjustmentItems = (
    await Promise.all(
      adjustmentStrategyNames.map((name) => sumAdjustmentItemsForStrategy(qcode, name, baseTags, isMultiActive)),
    )
  ).reduce((sum, v) => sum + v, 0);

  const inactiveRealised = (
    await Promise.all(inactiveRealisedRows.map((row) => mastersheet.sumPnl(qcode, row.forProfitTag)))
  ).reduce((sum, v) => sum + v, 0);

  const totalRealised = fullCashActive
    ? inactiveRealised
    : adjustmentItems + eqPurchaseSold + inactiveRealised;

  const totalUnrealised = await mastersheet.sumPnl(qcode, activeRow.forProfitTag);

  const totalProfits = totalRealised + totalUnrealised;
  const totalCashGenerated = totalProfits + cashInvestment;

  const activeOpts = isMultiActive
    ? { strategyPrefix: `${activeRow.strategy} `, allowUnprefixedFallback: false }
    : {};
  const ztp = await tags.getLatestPortfolioValue(qcode, baseTags.zerodhaTotalPortfolio, activeOpts);

  let currentZerodhaCash: number;
  if (fullCashActive) {
    currentZerodhaCash = ztp;
  } else {
    const [esh, mf, bond, liq, lb] = await Promise.all([
      tags.getLatestPortfolioValue(qcode, baseTags.equityStockHoldings, activeOpts),
      tags.getLatestPortfolioValue(qcode, baseTags.mutualFunds, activeOpts),
      tags.getLatestPortfolioValue(qcode, baseTags.bondStockHoldings, activeOpts),
      tags.getLatestPortfolioValue(qcode, baseTags.liquidcaseStockHoldings, activeOpts),
      tags.getLatestPortfolioValue(qcode, baseTags.liquidbees, activeOpts),
    ]);
    currentZerodhaCash = ztp - esh - mf - bond - liq - lb + liq + lb;
  }

  const check = currentZerodhaCash - totalCashGenerated;

  return {
    adjustmentItems,
    eqPurchaseSold,
    inactiveRealised,
    totalRealised,
    totalUnrealised,
    totalProfits,
    cashInvestment,
    totalCashGenerated,
    currentZerodhaCash,
    check,
  };
}
