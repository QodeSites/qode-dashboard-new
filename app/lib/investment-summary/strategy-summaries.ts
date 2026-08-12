/**
 * Port of calculations.py's calc_per_strategy_summaries / calc_combined_summaries
 * / calc_investment_summary (doc 02, doc 04 "strategy-summaries.ts") — the
 * assembly layer that composes account-summary.ts, overview-cash.ts,
 * tradebook.ts, and cash-inputs.ts into one strategy's (or the combined
 * "Total Portfolio"'s) full numbers.
 *
 * Per doc 02:
 *  - Active strategies get the FULL set (account summary, overview cash,
 *    cash/holdings investment summary) — calc_per_strategy_summaries runs
 *    with `strategyPrefix = "${strategy} "`, `allowUnprefixedFallback: false`.
 *  - Inactive strategies get ONLY cash/holdings investment summary — "no
 *    Overview Cash / Account Summary (nothing current to reconcile)".
 *  - Combined ("Total Portfolio"): cash summary excludes internal transfers,
 *    holdings summary combined across ALL strategies, account summary uses
 *    UNPREFIXED tags (no strategyPrefix), overview cash summary sums
 *    per-active-strategy fields additively.
 *
 * COMBINED OVERVIEW-CASH NOTE (relates to doc 05 Q11): summing each
 * per-active-strategy `OverviewCashSummary` naively would double-count
 * `inactiveRealised` once per active strategy for clients with 2+
 * simultaneously active strategies (rare but real, e.g. Ashwin Agarwal:
 * QYE+++QAW++ both active). This module sums `adjustmentItems` and
 * `totalUnrealised` additively across active strategies (each strategy's
 * own contribution), but adds `inactiveRealised` exactly ONCE regardless of
 * how many active strategies exist — the only construction that avoids
 * double-counting no matter how doc 05 Q11 is ultimately resolved.
 */
import * as accountSummary from "./account-summary";
import * as overviewCash from "./overview-cash";
import * as tradebook from "./tradebook";
import * as cashInputs from "./cash-inputs";
import type { ClientStrategyConfigRow } from "./types";

export interface AmountInvested {
  holdings: number;
  cash: number;
  total: number;
}

export interface OverviewCashSummaryView {
  rows: Array<{ label: string; amount: number }>;
  adjustments: Array<{ label: string; amount: number }>;
}

export interface AccountSummaryRow {
  particulars: string;
  amount: number;
  percent: number;
}

export interface HoldingsBifurcationRow {
  type: string;
  amount: number;
  percent: number;
}

export interface StrategySummary {
  amountInvested: AmountInvested;
  overviewCashSummary: OverviewCashSummaryView | null;
  cashInvestmentSummary: cashInputs.CashInvestmentSummary;
  holdingsInvestmentSummary: {
    totalHoldingsAdded: number;
    totalHoldingsWithdrawn: number;
    netHoldingBalance: number;
  };
  currentAccountSummary: AccountSummaryRow[];
  holdingsBifurcation: HoldingsBifurcationRow[];
}

interface StrategyContext {
  qcode: string;
  clientName: string;
  row: ClientStrategyConfigRow;
  allStrategyRows: ClientStrategyConfigRow[];
  eqExcludeIds: Set<string>;
  asOfDate?: Date;
}

function toOverviewCashView(summary: overviewCash.OverviewCashSummary): OverviewCashSummaryView {
  return {
    rows: [
      { label: "Total Realised", amount: summary.totalRealised },
      { label: "Total Unrealised", amount: summary.totalUnrealised },
      { label: "Total Profits", amount: summary.totalProfits },
      { label: "Cash Investment", amount: summary.cashInvestment },
      { label: "Total Cash Generated", amount: summary.totalCashGenerated },
      { label: "Current Zerodha Cash", amount: summary.currentZerodhaCash },
      { label: "Check", amount: summary.check },
    ],
    adjustments: [
      { label: "Adjustment Items", amount: summary.adjustmentItems },
      { label: "Equity Purchase & Sold", amount: summary.eqPurchaseSold },
      { label: "Inactive Realised", amount: summary.inactiveRealised },
    ],
  };
}

function toAccountSummaryRows(a: accountSummary.AccountSummary): AccountSummaryRow[] {
  return [
    { particulars: "Holdings", amount: a.holdings, percent: a.holdingsPct },
    { particulars: "Liquid Case", amount: a.liquidCase, percent: a.liquidCasePct },
    { particulars: "Cash", amount: a.cash, percent: a.cashPct },
  ];
}

// Standard categories every Holdings Bifurcation table should show, in
// this fixed order, even when a client has zero in that category — the
// removed legacy .xlsx parser (parse-investment-pdf.ts's
// STANDARD_BIFURCATION_TYPES, deleted 2026-08-12) padded these the same
// way; real Python's `combined.groupby("Debt/Equity")` silently drops
// empty categories from the raw breakdown, so this padding has always
// been a display-layer responsibility, not something Python's output
// data itself guarantees. Restored here so a client with e.g. no Debt or
// Hybrid holdings still shows "Debt — 0.00 —" rather than omitting the row.
const STANDARD_BIFURCATION_TYPES = ["Equity", "Debt", "Hybrid"];

function toBifurcationRows(b: accountSummary.HoldingsBifurcation): HoldingsBifurcationRow[] {
  const byType = new Map(b.breakdown.map((entry) => [entry.type, entry]));

  const standardRows: HoldingsBifurcationRow[] = STANDARD_BIFURCATION_TYPES.map((type) => {
    const entry = byType.get(type);
    return { type, amount: entry?.amount ?? 0, percent: entry?.pct ?? 0 };
  });

  // Any category that isn't one of the standard 3 (e.g. "Unclassified")
  // is kept, appended after the standard rows in its original order.
  const extraRows: HoldingsBifurcationRow[] = b.breakdown
    .filter((entry) => !STANDARD_BIFURCATION_TYPES.includes(entry.type))
    .map((entry) => ({ type: entry.type, amount: entry.amount, percent: entry.pct }));

  // report_builder.py appends a "Cash & Liquid Case" row after the
  // Debt/Equity breakdown rows (using data["cash_liquid_case"] /
  // data["cash_liquid_case_pct"], computed separately in
  // account-summary.ts's calcHoldingsBifurcation) — this was previously
  // dropped entirely since only b.breakdown was mapped, which is why the
  // "Cash & Liquid" category never appeared in the API response at all.
  return [
    ...standardRows,
    ...extraRows,
    { type: "Cash & Liquid Case", amount: b.cashLiquidCase, percent: b.cashLiquidCasePct },
  ];
}

/** Full summary for ONE active strategy. */
async function calcActiveStrategySummary(ctx: StrategyContext): Promise<StrategySummary> {
  const opts = { strategyPrefix: `${ctx.row.strategy} `, allowUnprefixedFallback: false, asOfDate: ctx.asOfDate };
  const fullCash = tradebook.isFullCashStrategy(ctx.row.strategy);

  const [cashInv, eqPurchaseSold, holdingsInv, acctSummary] = await Promise.all([
    cashInputs.calcCashInvestmentSummary(ctx.clientName, ctx.row.strategy, false),
    cashInputs.calcEquityPurchaseSold(ctx.clientName, ctx.row.strategy),
    tradebook.calcHoldingsInvestmentSummary(ctx.qcode, ctx.clientName, ctx.row.strategy, fullCash, ctx.eqExcludeIds, ctx.asOfDate),
    accountSummary.calcCurrentAccountSummary(ctx.qcode, opts),
  ]);

  const overview = await overviewCash.calcOverviewCashSummary(
    ctx.qcode,
    ctx.row,
    ctx.allStrategyRows,
    cashInv.netCashBalance,
    eqPurchaseSold,
    { asOfDate: ctx.asOfDate },
  );

  const bifurcation = await accountSummary.calcHoldingsBifurcation(
    ctx.qcode,
    { strategy: ctx.row.strategy, asOfDate: ctx.asOfDate },
    acctSummary,
  );

  return {
    amountInvested: {
      holdings: holdingsInv.netHoldingBalance,
      cash: cashInv.netCashBalance,
      total: holdingsInv.netHoldingBalance + cashInv.netCashBalance,
    },
    overviewCashSummary: toOverviewCashView(overview),
    cashInvestmentSummary: cashInv,
    holdingsInvestmentSummary: holdingsInv,
    currentAccountSummary: toAccountSummaryRows(acctSummary),
    holdingsBifurcation: toBifurcationRows(bifurcation),
  };
}

/**
 * Reduced summary for ONE inactive strategy — doc 02: "no Overview Cash /
 * Account Summary (nothing current to reconcile)".
 */
async function calcInactiveStrategySummary(ctx: StrategyContext): Promise<StrategySummary> {
  const fullCash = tradebook.isFullCashStrategy(ctx.row.strategy);

  const [cashInv, holdingsInv] = await Promise.all([
    cashInputs.calcCashInvestmentSummary(ctx.clientName, ctx.row.strategy, false),
    tradebook.calcHoldingsInvestmentSummary(ctx.qcode, ctx.clientName, ctx.row.strategy, fullCash, ctx.eqExcludeIds, ctx.asOfDate),
  ]);

  return {
    amountInvested: {
      holdings: holdingsInv.netHoldingBalance,
      cash: cashInv.netCashBalance,
      total: holdingsInv.netHoldingBalance + cashInv.netCashBalance,
    },
    overviewCashSummary: null,
    cashInvestmentSummary: cashInv,
    holdingsInvestmentSummary: holdingsInv,
    currentAccountSummary: [],
    holdingsBifurcation: [],
  };
}

export async function calcPerStrategySummaries(
  qcode: string,
  clientName: string,
  allStrategyRows: ClientStrategyConfigRow[],
  eqExcludeIds: Set<string>,
  asOfDate?: Date,
): Promise<Record<string, StrategySummary>> {
  const result: Record<string, StrategySummary> = {};

  for (const row of allStrategyRows) {
    const ctx: StrategyContext = { qcode, clientName, row, allStrategyRows, eqExcludeIds, asOfDate };
    result[row.strategy] =
      row.status === "Active" ? await calcActiveStrategySummary(ctx) : await calcInactiveStrategySummary(ctx);
  }

  return result;
}

/**
 * Combined "Total Portfolio" summary. Cash summary excludes internal
 * transfers (doc 02); holdings/cash investment summaries are the additive
 * sum across ALL strategies (active + inactive — every strategy stint
 * contributed real holdings/cash movement); account summary uses
 * UNPREFIXED tags (no strategyPrefix); overview cash summary is assembled
 * from scratch (not summed from per-strategy views) to avoid the
 * inactiveRealised double-count described in the file header.
 */
export async function calcCombinedSummary(
  qcode: string,
  clientName: string,
  allStrategyRows: ClientStrategyConfigRow[],
  eqExcludeIds: Set<string>,
  asOfDate?: Date,
): Promise<StrategySummary> {
  const activeRows = allStrategyRows.filter((r) => r.status === "Active");

  const [cashInv, eqPurchaseSold, acctSummary] = await Promise.all([
    cashInputs.calcCashInvestmentSummary(clientName, undefined, true),
    cashInputs.calcEquityPurchaseSold(clientName, undefined),
    accountSummary.calcCurrentAccountSummary(qcode, { asOfDate }),
  ]);

  // Structural fix (2026-08-12, doc 05 Q14): ONE unfiltered call
  // (`strategy=undefined`), not a sum of per-strategy calls — matches
  // calc_combined_summaries's real Python shape (a single
  // calc_holdings_investment_summary(..., strategy=None, ...) call) and
  // fixes a genuine bug: the previous per-row-loop-and-sum silently
  // dropped rows whose strategy tag doesn't match ANY config row (e.g.
  // Sarla's pre-strategy-tagging blank-strategy historical MF rows).
  //
  // `fullCash` is INTENTIONALLY hardcoded false here, NOT
  // `all(is_full_cash_strategy(r) for r in active strategies)` like the
  // real Python source reads literally. Tried the literal reading first —
  // it regressed Ashok Jogani HUF (QAC00110, active strategy QAW++, a
  // full-cash name) from an exact real-report match (₹33,096,851.11) to
  // zero. That real report's non-zero holdings prove the CURRENTLY-LIVE
  // pipeline does not zero a combined view whose only active strategy
  // happens to be full-cash — the doc 04 Phase 2 bug #2 fix (2026-08-11,
  // also confirmed against this same client) already established this via
  // real data before this session ever read the Python source directly.
  // Real output takes precedence over a literal source-code reading when
  // they conflict — the source may reflect a newer pipeline version than
  // the report was generated with (same staleness pattern found for
  // Sarla's report this same session). Revisit if a FRESH Ashok Jogani HUF
  // report ever shows zero holdings — that would mean the literal
  // full_cash reading is actually correct and this hardcode is wrong.
  const holdingsInv = await tradebook.calcHoldingsInvestmentSummary(
    qcode,
    clientName,
    undefined,
    false,
    eqExcludeIds,
    asOfDate,
  );

  // IMPORTANT: overviewCash.calcOverviewCashSummary's `adjustmentItems` and
  // `inactiveRealised` fields are already CLIENT-WIDE sums (they depend only
  // on `allStrategyRows`, not on which single `activeRow` was passed in —
  // see overview-cash.ts's `qualifyingRows`/`inactiveRows` construction).
  // Calling it once per active strategy and summing those two fields again
  // here would multiply-count them by the number of active strategies. Only
  // `totalUnrealised` (uses `activeRow.forProfitTag`) is genuinely
  // strategy-specific and safe to sum additively. So: take
  // adjustmentItems/inactiveRealised from the first call only, sum
  // totalUnrealised across every active strategy's own call.
  let adjustmentItems = 0;
  let totalUnrealised = 0;
  let inactiveRealised = 0;
  for (let i = 0; i < activeRows.length; i++) {
    const overview = await overviewCash.calcOverviewCashSummary(
      qcode,
      activeRows[i],
      allStrategyRows,
      0, // cashInvestment folded in once below, not per-strategy here
      0, // eqPurchaseSold folded in once below, not per-strategy here
      { asOfDate },
    );
    totalUnrealised += overview.totalUnrealised;
    if (i === 0) {
      adjustmentItems = overview.adjustmentItems;
      inactiveRealised = overview.inactiveRealised;
    }
  }

  const totalRealised = adjustmentItems + eqPurchaseSold + inactiveRealised;
  const totalProfits = totalRealised + totalUnrealised;
  const totalCashGenerated = totalProfits + cashInv.netCashBalance;
  const currentZerodhaCash = acctSummary.accountValue;
  const check = currentZerodhaCash - totalCashGenerated;

  const combinedOverview: overviewCash.OverviewCashSummary = {
    adjustmentItems,
    eqPurchaseSold,
    inactiveRealised,
    totalRealised,
    totalUnrealised,
    totalProfits,
    cashInvestment: cashInv.netCashBalance,
    totalCashGenerated,
    currentZerodhaCash,
    check,
  };

  const bifurcation = await accountSummary.calcHoldingsBifurcation(qcode, { asOfDate }, acctSummary);

  return {
    amountInvested: {
      holdings: holdingsInv.netHoldingBalance,
      cash: cashInv.netCashBalance,
      total: holdingsInv.netHoldingBalance + cashInv.netCashBalance,
    },
    overviewCashSummary: toOverviewCashView(combinedOverview),
    cashInvestmentSummary: cashInv,
    holdingsInvestmentSummary: holdingsInv,
    currentAccountSummary: toAccountSummaryRows(acctSummary),
    holdingsBifurcation: toBifurcationRows(bifurcation),
  };
}

/** Trivial port of calc_investment_summary (doc 02): {holdings, cash, total}. */
export function calcInvestmentSummary(netHoldingBalance: number, netCashBalance: number): AmountInvested {
  return {
    holdings: netHoldingBalance,
    cash: netCashBalance,
    total: netHoldingBalance + netCashBalance,
  };
}
