/**
 * Port of calculations.py's calc_per_strategy_summaries / calc_combined_summaries
 * / calc_investment_summary (doc 04 "strategy-summaries.ts") — the assembly
 * layer that composes account-summary.ts, overview-cash.ts, tradebook.ts,
 * and cash-inputs.ts into one strategy's (or the combined "Total
 * Portfolio"'s) full numbers.
 *
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
 * OVERVIEW-CASH SCOPE (confirmed 2026-08-13 against main.py ~line 248-335,
 * calculations.py ~line 546-873 directly, superseding an earlier "client-wide
 * always" reading that only happened to be correct for single-active-strategy
 * clients): Python actually branches on how many strategies are
 * CONCURRENTLY ACTIVE for this client —
 *  - Exactly 1 active strategy (main.py's `not multi_strategy` branch): the
 *    ONE overview-cash call is scoped client-wide — adjustment items summed
 *    over [active strategy] + every inactive NON-full-cash strategy, and
 *    inactiveRealised summed over EVERY inactive row (full-cash or not).
 *  - 2+ active strategies (main.py's multi-strategy branch): EACH active
 *    strategy's own per-strategy sheet is scoped to ONLY that strategy's own
 *    name (no cross-strategy leakage) with inactiveRealised = 0; the
 *    inactive-strategy realised profit is instead added exactly ONCE at the
 *    combined level (calculations.py's calc_combined_summaries, ~line
 *    822-828), on top of the (already correctly narrow-scoped) sum of each
 *    active strategy's own totalRealised.
 * `overviewCashScope()` below picks the right scope per call; overview-cash.ts
 * itself just sums whatever it's given (see its header comment).
 */
import * as accountSummary from "./account-summary";
import * as overviewCash from "./overview-cash";
import * as tradebook from "./tradebook";
import * as cashInputs from "./cash-inputs";
import * as mastersheet from "./mastersheet";
import type { ClientStrategyConfigRow } from "./types";

/**
 * Picks the overview-cash scope for `row` given the client's full strategy
 * history — see this file's header comment for the exact Python semantics.
 */
function overviewCashScope(
  row: ClientStrategyConfigRow,
  allStrategyRows: ClientStrategyConfigRow[],
): { adjustmentStrategyNames: string[]; inactiveRealisedRows: ClientStrategyConfigRow[] } {
  const activeRows = allStrategyRows.filter((r) => r.status === "Active");
  const inactiveRows = allStrategyRows.filter((r) => r.status === "Inactive");
  const isMultiActive = activeRows.length >= 2;

  if (isMultiActive) {
    return { adjustmentStrategyNames: [row.strategy], inactiveRealisedRows: [] };
  }

  const inactiveNonFullCashRows = inactiveRows.filter((r) => !tradebook.isFullCashStrategy(r.strategy));
  return {
    adjustmentStrategyNames: [row.strategy, ...inactiveNonFullCashRows.map((r) => r.strategy)],
    inactiveRealisedRows: inactiveRows,
  };
}

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
  const fullCash = tradebook.isFullCashStrategy(ctx.row.strategy);
  const isMultiActive = ctx.allStrategyRows.filter((r) => r.status === "Active").length >= 2;

  // Every field below branches the same way, matching main.py's two real
  // shapes (confirmed 2026-08-13 by reading main.py ~248-335 directly):
  //  - Multi-active (2+ concurrently active strategies, main.py's `else`
  //    branch / calc_per_strategy_summaries, calculations.py ~728-744):
  //    strategy-FILTERED cash/holdings, strategy-PREFIXED account summary,
  //    strategy-specific full_cash flag.
  //  - Single-active (main.py's `not multi_strategy` branch, ~287-296): this
  //    one strategy's sheet doubles as the client's only sheet, so
  //    everything is read UNFILTERED/UNPREFIXED — cash_inv has no strategy
  //    filter (only exclude_internal=True), holdings_inv has no strategy
  //    filter and never passes full_cash (so it defaults False even if this
  //    lone active strategy happens to be full-cash — matches
  //    calc_holdings_investment_summary's own default, calculations.py:340),
  //    and account_summary has no strategy_prefix (defaults to "", fully
  //    unprefixed, with allow_unprefixed_fallback defaulting True).
  const [cashInv, eqPurchaseSold, holdingsInv, acctSummary] = await Promise.all([
    isMultiActive
      ? cashInputs.calcCashInvestmentSummary(ctx.clientName, ctx.row.strategy, false)
      : cashInputs.calcCashInvestmentSummary(ctx.clientName, undefined, true),
    isMultiActive
      ? cashInputs.calcEquityPurchaseSold(ctx.clientName, ctx.row.strategy)
      : cashInputs.calcEquityPurchaseSold(ctx.clientName, undefined),
    isMultiActive
      ? tradebook.calcHoldingsInvestmentSummary(ctx.qcode, ctx.clientName, ctx.row.strategy, fullCash, ctx.eqExcludeIds, ctx.asOfDate)
      : tradebook.calcHoldingsInvestmentSummary(ctx.qcode, ctx.clientName, undefined, false, ctx.eqExcludeIds, ctx.asOfDate),
    isMultiActive
      ? accountSummary.calcCurrentAccountSummary(ctx.qcode, {
          strategyPrefix: `${ctx.row.strategy} `,
          allowUnprefixedFallback: false,
          asOfDate: ctx.asOfDate,
        })
      : accountSummary.calcCurrentAccountSummary(ctx.qcode, { asOfDate: ctx.asOfDate }),
  ]);

  const scope = overviewCashScope(ctx.row, ctx.allStrategyRows);
  const overview = await overviewCash.calcOverviewCashSummary(
    ctx.qcode,
    ctx.row,
    scope.adjustmentStrategyNames,
    scope.inactiveRealisedRows,
    isMultiActive,
    cashInv.netCashBalance,
    eqPurchaseSold,
    { asOfDate: ctx.asOfDate },
  );

  // Same branch as above: single-active clients read bifurcation unfiltered
  // (main.py:296, calc_holdings_bifurcation(mf_unrealized, eq_unrealized,
  // account_summary) — no strategy arg), multi-active clients filter by
  // strategy (calculations.py:745).
  const bifurcation = await accountSummary.calcHoldingsBifurcation(
    ctx.qcode,
    isMultiActive ? { strategy: ctx.row.strategy, asOfDate: ctx.asOfDate } : { asOfDate: ctx.asOfDate },
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
  // RESOLVED 2026-08-13 (was previously hardcoded false unconditionally —
  // see git history for that reasoning): the literal Python read
  // `all(is_full_cash_strategy(r) for r in active strategies)` is genuinely
  // only correct for the MULTI-active branch (calc_combined_summaries,
  // calculations.py ~799-803). Ashok Jogani HUF (QAC00110), the client that
  // regressed when this was first tried literally, is a SINGLE-active
  // client (QAW+ inactive -> QAW++ active) — Python's single-active branch
  // (main.py ~288-290) never passes full_cash at all, so it defaults False
  // unconditionally regardless of the active strategy's own type. Applying
  // the multi-active formula to a single-active client was the actual bug,
  // not the formula itself. Now that isMultiActive is threaded through this
  // whole file (see calcActiveStrategySummary), both branches can be
  // correct at once: single-active clients keep the always-false default
  // that matches Ashok Jogani HUF's real report, and genuinely multi-active
  // clients (2+ concurrently active strategies) get the literal
  // all-full-cash formula, matching calc_combined_summaries exactly.
  const isMultiActive = activeRows.length >= 2;
  const allFullCash = isMultiActive && activeRows.every((r) => tradebook.isFullCashStrategy(r.strategy));
  const holdingsInv = await tradebook.calcHoldingsInvestmentSummary(
    qcode,
    clientName,
    undefined,
    allFullCash,
    eqExcludeIds,
    asOfDate,
  );

  // Each active strategy is called with its own OWN-STRATEGY-ONLY overview-
  // cash scope (overviewCashScope — see this file's header comment), exactly
  // matching how Python computes each per-strategy sheet. Their totalRealised
  // values (each already correctly scoped, no cross-strategy leakage) are
  // summed directly; inactive-strategy realised profit is folded in exactly
  // ONCE afterward for multi-active clients (never per-call, which would
  // multiply-count it by the number of active strategies) — matches
  // calc_combined_summaries' separate `inactive_realised` loop
  // (calculations.py ~822-828). For a single-active-strategy client, that
  // inactive-realised profit is already folded into the one overview call's
  // own totalRealised via overviewCashScope's inactiveRealisedRows (matching
  // main.py's `not multi_strategy` branch), so it must NOT be added again.
  const inactiveRows = allStrategyRows.filter((r) => r.status === "Inactive");

  let adjustmentItems = 0;
  let totalUnrealised = 0;
  let sumOfPerStrategyTotalRealised = 0;
  let sumOfPerStrategyZerodhaCash = 0;
  for (const row of activeRows) {
    const scope = overviewCashScope(row, allStrategyRows);
    // Multi-active: each strategy's OWN eq_purchase_sold (Python's
    // per-strategy calc_eq_purchase_sold(misc_df, strategy=strat)).
    // Single-active: the same unfiltered value already fetched above
    // (Python's calc_eq_purchase_sold(misc_df), no strategy filter, for the
    // lone "combined_data" sheet — main.py ~line 297).
    const strategyEqPurchaseSold = isMultiActive
      ? await cashInputs.calcEquityPurchaseSold(clientName, row.strategy)
      : eqPurchaseSold;

    const overview = await overviewCash.calcOverviewCashSummary(
      qcode,
      row,
      scope.adjustmentStrategyNames,
      scope.inactiveRealisedRows,
      isMultiActive,
      0, // cashInvestment folded in once below, not per-strategy here
      strategyEqPurchaseSold,
      { asOfDate },
    );
    totalUnrealised += overview.totalUnrealised;
    sumOfPerStrategyZerodhaCash += overview.currentZerodhaCash;
    sumOfPerStrategyTotalRealised += overview.totalRealised;
    adjustmentItems += overview.adjustmentItems;
  }

  let inactiveRealised = 0;
  if (isMultiActive) {
    inactiveRealised = (
      await Promise.all(inactiveRows.map((row) => mastersheet.sumPnl(qcode, row.forProfitTag, asOfDate)))
    ).reduce((sum, v) => sum + v, 0);
  }

  const totalRealised = sumOfPerStrategyTotalRealised + inactiveRealised;
  const totalProfits = totalRealised + totalUnrealised;
  const totalCashGenerated = totalProfits + cashInv.netCashBalance;

  // Port of calc_combined_summaries' zerodha-cash branch (calculations.py):
  // for an all-non-full-cash (pure QYE) client, use the aggregate unprefixed
  // ztp - esh - mf - bond (= acctSummary.accountValue - acctSummary.holdings,
  // since acctSummary was computed with no strategy prefix above). Any
  // full-cash strategy in the mix (or all full-cash) instead sums each
  // active strategy's OWN current_value_of_cash_in_zerodha — using the raw
  // unprefixed accountValue unconditionally (the previous bug here) over-
  // counts a QYE client's Zerodha Cash by exactly its Equity+MF+Bond
  // holdings, since it skips that subtraction entirely.
  const allNonFullCash = activeRows.length > 0 && activeRows.every((r) => !tradebook.isFullCashStrategy(r.strategy));
  const currentZerodhaCash = allNonFullCash
    ? acctSummary.accountValue - acctSummary.holdings
    : sumOfPerStrategyZerodhaCash;
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
