/**
 * Port of calculations.py's calc_current_account_summary /
 * calc_holdings_bifurcation (doc 02, doc 04 "account-summary.ts").
 *
 * Pure composition over tags.ts/mastersheet.ts/holdings.ts — no direct
 * Prisma access here, per CLAUDE.md DB safety rules and the module's own
 * read-only-composition design.
 */
import * as tags from "./tags";
import * as holdings from "./holdings";
import { getBaseTags } from "./config";
import type { HoldingRow } from "./types";

export interface AccountSummary {
  holdings: number;
  liquidCase: number;
  cash: number;
  accountValue: number;
  holdingsPct: number;
  liquidCasePct: number;
  cashPct: number;
}

export interface HoldingsBreakdownEntry {
  type: string;
  amount: number;
  pct: number;
}

export interface HoldingsBifurcation {
  breakdown: HoldingsBreakdownEntry[];
  holdingsTotal: number;
  cashLiquidCase: number;
  cashLiquidCasePct: number;
  accountValue: number;
  /** Actual (bifurcation total - accountSummary.holdings) diff — doc 02 says Python only logs a warning if |diff| > 1, it doesn't throw. Exposed here so callers can decide (log, surface in validation.ts, etc.) rather than this module doing a side-effecting console.log. */
  reconDiff: number;
}

interface ResolveOpts {
  strategyPrefix?: string;
  allowUnprefixedFallback?: boolean;
}

/**
 * Port of calc_current_account_summary(ms, tags, strategy_prefix, allow_unprefixed_fallback).
 *
 * Doc 02 is terse about which tag is "account value" — read literally,
 * `account_value` is the latest resolved value of the zerodha_total_portfolio
 * base tag (config.ts's getBaseTags().zerodhaTotalPortfolio) for this
 * qcode/strategy_prefix, via tags.getLatestPortfolioValue. That's the
 * conservative reading: it's the one tag calc_current_account_summary's
 * formula (`cash = account_value - holdings - liquid_total`) treats as the
 * ground-truth total, and it matches the "Zerodha Total Portfolio" system
 * tag's role everywhere else in this codebase (CLAUDE.md's own "System
 * Tags" section calls it the NAV/total-portfolio tag).
 */
export async function calcCurrentAccountSummary(
  qcode: string,
  opts: ResolveOpts = {},
): Promise<AccountSummary> {
  const baseTags = await getBaseTags();

  const [equity, mf, bond, liquidcase, liquidbees, accountValue] = await Promise.all([
    tags.getLatestPortfolioValue(qcode, baseTags.equityStockHoldings, opts),
    tags.getLatestPortfolioValue(qcode, baseTags.mutualFunds, opts),
    tags.getLatestPortfolioValue(qcode, baseTags.bondStockHoldings, opts),
    tags.getLatestPortfolioValue(qcode, baseTags.liquidcaseStockHoldings, opts),
    tags.getLatestPortfolioValue(qcode, baseTags.liquidbees, opts),
    tags.getLatestPortfolioValue(qcode, baseTags.zerodhaTotalPortfolio, opts),
  ]);

  const holdingsTotal = equity + mf + bond;
  const liquidTotal = liquidcase + liquidbees;
  const cash = accountValue - holdingsTotal - liquidTotal;

  const pct = (part: number) => (accountValue === 0 ? 0 : (part / accountValue) * 100);

  return {
    holdings: holdingsTotal,
    liquidCase: liquidTotal,
    cash,
    accountValue,
    holdingsPct: pct(holdingsTotal),
    liquidCasePct: pct(liquidTotal),
    cashPct: pct(cash),
  };
}

/**
 * Port of calc_holdings_bifurcation(mf_unrealized, eq_unrealized, account_summary, strategy)
 * (calculations.py:468-539).
 *
 * The exclusion here is `Sub Category == liquidcase` ONLY — NOT liquidbees.
 * Confirmed 2026-08-14 against literal source: Python's calc_holdings_bifurcation
 * receives the SAME eq_unrealized/mf_unrealized objects as calc_eq_holdings
 * (main.py), which filters a local copy and leaves the original (passed
 * here) untouched — so real Liquidbees equity rows DO flow into this
 * breakdown and land under their own Debt/Equity category (or
 * "Unclassified"). Only "Current Equity Holdings" (calc_eq_holdings itself,
 * getCurrentEquityHoldings's default) excludes Liquidbees. That's why this
 * function calls getCurrentEquityHoldings with excludeLiquidbees=false —
 * this liquidcase-only filter below is the sole exclusion Python applies
 * at this stage.
 */
export async function calcHoldingsBifurcation(
  qcode: string,
  opts: { strategy?: string } = {},
  accountSummary: AccountSummary,
): Promise<HoldingsBifurcation> {
  const [eqHoldings, mfHoldings] = await Promise.all([
    // excludeLiquidbees=false: matches Python exactly — see holdings.ts's
    // getCurrentEquityHoldings doc comment. This function's own liquidcase-
    // only filter below (line ~115) is the sole exclusion here, same as
    // calc_holdings_bifurcation's own filter in calculations.py:491.
    holdings.getCurrentEquityHoldings(qcode, opts.strategy, false),
    holdings.getCurrentMfHoldings(qcode, opts.strategy),
  ]);

  const combined: HoldingRow[] = [...eqHoldings, ...mfHoldings].filter(
    (r) => (r.subCategory ?? "").toLowerCase() !== "liquidcase",
  );

  const groups = new Map<string, number>();
  for (const row of combined) {
    const key = row.debtEquity?.trim() || "Unclassified";
    groups.set(key, (groups.get(key) ?? 0) + (row.valueAsOfToday ?? 0));
  }

  const holdingsTotal = Array.from(groups.values()).reduce((sum, v) => sum + v, 0);

  // Percentages are of account_value, matching the real Python source
  // (calculations.py's calc_holdings_bifurcation: `pct(val) = val /
  // account_value * 100`, applied to both the breakdown rows and
  // cash_liquid_case below) — NOT of holdingsTotal, which an earlier,
  // pre-real-source reading of this module incorrectly assumed.
  const accountValue = accountSummary.accountValue;
  const pct = (v: number) => (accountValue === 0 ? 0 : (v / accountValue) * 100);

  const breakdown: HoldingsBreakdownEntry[] = Array.from(groups.entries()).map(([type, amount]) => ({
    type,
    amount,
    pct: pct(amount),
  }));

  // cash (short-fall/excess) + liquid-case funds, combined — matches
  // Python's `cash_liquid = account_summary['cash'] + account_summary['liquid_case']`.
  // Appended as its own "Cash & Liquid Case" row by report_builder.py in
  // the real pipeline (not part of `breakdown`) — see toBifurcationRows()
  // in strategy-summaries.ts for the TS equivalent of that append step.
  const cashLiquidCase = accountSummary.cash + accountSummary.liquidCase;
  const cashLiquidCasePct = pct(cashLiquidCase);

  const reconDiff = holdingsTotal - accountSummary.holdings;

  return {
    breakdown,
    holdingsTotal,
    cashLiquidCase,
    cashLiquidCasePct,
    accountValue: accountSummary.accountValue,
    reconDiff,
  };
}
