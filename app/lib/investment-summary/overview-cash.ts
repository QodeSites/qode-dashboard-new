/**
 * Port of calculations.py's calc_overview_cash_summary (doc 02, doc 04
 * "overview-cash.ts") — the reconciliation engine. This is the
 * highest-complexity, highest-uncertainty module in the migration: doc 02 is
 * a summary of the Python source, not the literal code, so where its
 * description is terse this file makes an explicit, commented interpretation
 * rather than a silent guess. Before trusting this module's numbers for a
 * real client report, cross-check against `/opt/investment-summary/investment-summary-excel/src/calculations.py`
 * (WSL) directly — see the "INTERPRETATION NOTES" comments below for exactly
 * which parts are inferred vs. explicitly documented.
 *
 * Deliberately ADDITIVE, not residual (doc 02): `check` is meant to be a
 * real signal of bad/missing data, not forced to zero by construction.
 *
 * Must preserve the full-cash-strategy exclusion fix: full-cash INACTIVE
 * strategies (QAW+/QAW++/QTF+/QTF++) are excluded from the "adjustment
 * items" aggregation below, because their `forProfitTag` already nets
 * everything internally — double-counting them produced an exact
 * ₹33,805.44 discrepancy for Mangesh Hirve (QAC00064) in the Python
 * pipeline, per doc 02. Mangesh Hirve has exactly this shape (inactive
 * QAW++ + active QYE++), so he's used as the regression-test client below.
 */
import * as tags from "./tags";
import * as mastersheet from "./mastersheet";
import { isFullCashStrategy } from "./tradebook";
import { getBaseTags } from "./config";
import type { ClientStrategyConfigRow } from "./types";

export interface OverviewCashSummary {
  /** liq + lb + miscPnl + eqOther + eqTax, summed across every ACTIVE strategy prefix + every INACTIVE-but-non-full-cash strategy prefix for this client. */
  adjustmentItems: number;
  /** calc_eq_purchase_sold's result for this client (from cash-inputs.ts), passed in by the caller. */
  eqPurchaseSold: number;
  /** Sum of sumPnl(forProfitTag) across every INACTIVE strategy row (full-cash or not) — "realised" profit already booked from strategies no longer running. */
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

interface Opts {
  asOfDate?: Date;
}

/**
 * Sums the 5 "adjustment item" base tags (liquidcase, liquidbees,
 * miscellaneous_pnl, equity_other_debits_credits, equity_holdings_tax) for
 * ONE strategy prefix, via tags.ts (alias-aware, allowUnprefixedFallback:
 * false — per-strategy lookups on a multi-strategy client must not silently
 * fall back to an unprefixed tag, doc 02).
 */
async function sumAdjustmentItemsForStrategy(
  qcode: string,
  strategyName: string,
  baseTags: Awaited<ReturnType<typeof getBaseTags>>,
  asOfDate?: Date,
): Promise<number> {
  const prefix = `${strategyName} `;
  const opts = { strategyPrefix: prefix, allowUnprefixedFallback: false, asOfDate };

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
 * time (matching calc_current_account_summary's per-strategy shape and how
 * calc_per_strategy_summaries calls this — doc 02).
 *
 * INTERPRETATION NOTE (adjustment-items scope): doc 02 says adjustment items
 * are "summed via sum_pnl across every active strategy prefix + any
 * inactive-but-non-full-cash strategy prefix" — read literally, this spans
 * the CLIENT's full active+qualifying-inactive strategy set, not just the
 * single `activeRow` this call is reporting on. That's why `allStrategyRows`
 * (the client's full Master_Config.csv history, active+inactive) is a
 * required param separate from `activeRow`. total_unrealised and
 * current_zerodha_cash, by contrast, are explicitly strategy-specific in doc
 * 02 ("(active strategy)" / uses "ztp" for THIS strategy), so those use only
 * `activeRow`.
 *
 * INTERPRETATION NOTE (inactiveRealised): doc 02 doesn't spell out the exact
 * formula for "inactive_realised" beyond the name. The most literal reading,
 * consistent with calc_profit_redeployment's shape (doc 02: "for every
 * strategy the client has ever held, profits = sum_pnl(ms, for_profit_tag)"),
 * is: sum of sumPnl(forProfitTag) across every INACTIVE strategy row
 * (regardless of full-cash status — full-cash-ness only gates the
 * ADJUSTMENT ITEMS sum, per the Mangesh Hirve bug-fix note, not this term).
 */
export async function calcOverviewCashSummary(
  qcode: string,
  activeRow: ClientStrategyConfigRow,
  allStrategyRows: ClientStrategyConfigRow[],
  cashInvestment: number,
  eqPurchaseSold: number,
  opts: Opts = {},
): Promise<OverviewCashSummary> {
  const baseTags = await getBaseTags();
  const fullCashActive = isFullCashStrategy(activeRow.strategy);

  const activeRows = allStrategyRows.filter((r) => r.status === "Active");
  const inactiveRows = allStrategyRows.filter((r) => r.status === "Inactive");
  const inactiveNonFullCashRows = inactiveRows.filter((r) => !isFullCashStrategy(r.strategy));

  const qualifyingRows = [...activeRows, ...inactiveNonFullCashRows];
  const adjustmentItems = (
    await Promise.all(
      qualifyingRows.map((row) => sumAdjustmentItemsForStrategy(qcode, row.strategy, baseTags, opts.asOfDate)),
    )
  ).reduce((sum, v) => sum + v, 0);

  const inactiveRealised = (
    await Promise.all(
      inactiveRows.map((row) => mastersheet.sumPnl(qcode, row.forProfitTag, opts.asOfDate)),
    )
  ).reduce((sum, v) => sum + v, 0);

  const totalRealised = fullCashActive
    ? inactiveRealised
    : adjustmentItems + eqPurchaseSold + inactiveRealised;

  const totalUnrealised = await mastersheet.sumPnl(qcode, activeRow.forProfitTag, opts.asOfDate);

  const totalProfits = totalRealised + totalUnrealised;
  const totalCashGenerated = totalProfits + cashInvestment;

  const activeOpts = { strategyPrefix: `${activeRow.strategy} `, allowUnprefixedFallback: false, asOfDate: opts.asOfDate };
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
