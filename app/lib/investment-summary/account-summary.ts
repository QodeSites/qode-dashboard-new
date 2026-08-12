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
  asOfDate?: Date;
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
 * Port of calc_holdings_bifurcation(mf_unrealized, eq_unrealized, account_summary, strategy).
 *
 * Doc 02 explicitly says the exclusion here is `Sub Category == liquidcase`
 * only — NOT liquidbees — unlike holdings.ts's own equity-holdings exclusion
 * list (which drops both). Read literally: liquidbees is presumably meant
 * to show up as its own "Unclassified"/whatever-debt_equity-says line item
 * in this breakdown rather than being dropped, so this function does its
 * own liquidcase-only filter on top of what holdings.ts already returned
 * (holdings.ts's equity query already dropped liquidcase+liquidbees rows
 * for equity; mf holdings were never filtered, so liquidbees MF rows, if
 * any, flow through here untouched, matching the doc's narrower exclusion).
 */
export async function calcHoldingsBifurcation(
  qcode: string,
  opts: { strategy?: string; asOfDate?: Date } = {},
  accountSummary: AccountSummary,
): Promise<HoldingsBifurcation> {
  const [eqHoldings, mfHoldings] = await Promise.all([
    holdings.getCurrentEquityHoldings(qcode, opts.strategy, opts.asOfDate),
    holdings.getCurrentMfHoldings(qcode, opts.strategy, opts.asOfDate),
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

  const breakdown: HoldingsBreakdownEntry[] = Array.from(groups.entries()).map(([type, amount]) => ({
    type,
    amount,
    pct: holdingsTotal === 0 ? 0 : (amount / holdingsTotal) * 100,
  }));

  // Per the migration-plan task spec, percentages in this function's return
  // value are relative to holdingsTotal (not accountValue) — matching the
  // breakdown entries' pct above.
  const cashLiquidCase = accountSummary.liquidCase;
  const cashLiquidCasePct = holdingsTotal === 0 ? 0 : (cashLiquidCase / holdingsTotal) * 100;

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
