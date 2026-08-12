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

function toBifurcationRows(b: accountSummary.HoldingsBifurcation): HoldingsBifurcationRow[] {
  return b.breakdown.map((entry) => ({ type: entry.type, amount: entry.amount, percent: entry.pct }));
}

/** Full summary for ONE active strategy. */
async function calcActiveStrategySummary(ctx: StrategyContext): Promise<StrategySummary> {
  const opts = { strategyPrefix: `${ctx.row.strategy} `, allowUnprefixedFallback: false, asOfDate: ctx.asOfDate };
  const fullCash = tradebook.isFullCashStrategy(ctx.row.strategy);

  const [cashInv, eqPurchaseSold, holdingsInv, acctSummary] = await Promise.all([
    cashInputs.calcCashInvestmentSummary(ctx.clientName, ctx.row.strategy, false),
    cashInputs.calcEquityPurchaseSold(ctx.clientName, ctx.row.strategy),
    tradebook.calcHoldingsInvestmentSummary(ctx.qcode, ctx.row.strategy, fullCash, ctx.eqExcludeIds, ctx.asOfDate),
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
    tradebook.calcHoldingsInvestmentSummary(ctx.qcode, ctx.row.strategy, fullCash, ctx.eqExcludeIds, ctx.asOfDate),
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

  // NOTE: unlike the per-strategy view, the combined "Total Portfolio" view
  // does NOT apply the full-cash-strategy zero rule to holdings — confirmed
  // against real report data (Ashok Jogani HUF, Ashwin Agarwal): the
  // combined Holdings total includes each full-cash strategy's real
  // tradebook activity, only the per-strategy sheet zeroes it out. Passing
  // `fullCash=false` unconditionally here reproduces that.
  let totalHoldingsAdded = 0;
  let totalHoldingsWithdrawn = 0;
  for (const row of allStrategyRows) {
    const h = await tradebook.calcHoldingsInvestmentSummary(qcode, row.strategy, false, eqExcludeIds, asOfDate);
    totalHoldingsAdded += h.totalHoldingsAdded;
    totalHoldingsWithdrawn += h.totalHoldingsWithdrawn;
  }
  const holdingsInv = {
    totalHoldingsAdded,
    totalHoldingsWithdrawn,
    netHoldingBalance: totalHoldingsAdded + totalHoldingsWithdrawn,
  };

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
