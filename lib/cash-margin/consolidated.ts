/**
 * lib/cash-margin/consolidated.ts
 * Combined (multi-strategy) Account Summary + Excess Cash for a single
 * client/qcode running more than one strategy (e.g. QYE+++QAW++).
 *
 * Ported from managed_accounts_analysis/common_report_utils.py's
 * compute_consolidated() and compute_excess_cash() -- reads the NO-PREFIX
 * ("whole client") mastersheet tags, not a sum of the per-strategy legs
 * (computeAccountSummary in mastersheet.ts reads the prefixed tags instead).
 * The two can disagree if a client's no-prefix tags aren't populated exactly
 * as the sum of their legs -- kept as a separate function rather than merged.
 *
 * Does NOT compute Alert Status -- that's alerts.ts's per-metric bands
 * (resolved via config.ts's resolveThresholdConfig), and there is no
 * per-client (as opposed to per-strategy) rollup of it yet.
 */
import type { MastersheetSnapshot } from "./mastersheet";
import { getVal, computeAccountSummary } from "./mastersheet";
import type { Tier } from "./tags";

const CONSOLIDATED_TAGS = {
  zerodhaTotal: "Zerodha Total Portfolio",
  mutualFunds: "Mutual Funds",
  equityStock: "Equity Stock Holdings",
  bondStock: "Bond Stock Holdings",
  liquidcase: "Liquidcase Stock Holdings",
} as const;
const LIQUIDBEES_TAG = "Liquidbees";

// QAW's Gold/Momentum/Low Vol ETF legs live only under strategy-prefixed tags
// (e.g. "QAW++ Gold Stock Holdings") -- ported from qaw_report.py's QAW_SUBS.
// They are NOT part of the no-prefix "Equity Stock Holdings" rollup CONSOLIDATED_TAGS
// reads, so summing them across a client's active strategies is additive
// information only -- never subtracted back out of equityStock/holdings.
const QAW_SUB_TAG_SUFFIXES = {
  gold: "Gold Stock Holdings",
  momentum: "Momentum Stock Holdings",
  lowVol: "Low Vol Stock Holdings",
} as const;

export interface ConsolidatedSummary {
  accountValue: number;
  mutualFunds: number;
  equityStock: number;
  bondStock: number;
  liquidcase: number;
  cash: number;
}

export interface ConsolidatedExcessCash {
  holdingsValue: number;
  /** Percent units (0-100), not a fraction. */
  idealHoldingsPct: number;
  idealAccountValue: number;
  /** Percent units (0-100), not a fraction. */
  idealCashPct: number;
  utilizedCash: number;
  currentCash: number;
  excessCash: number;
}

/** '++' if any active strategy is a ++ tier, else '+'. */
export function detectConsolidatedTier(strategies: string[]): Tier {
  return strategies.some((s) => s.includes("++")) ? "++" : "+";
}

/** Combined Account Summary from the no-prefix mastersheet tags. */
export function computeConsolidated(ms: MastersheetSnapshot): ConsolidatedSummary {
  const accountValue = getVal(ms, CONSOLIDATED_TAGS.zerodhaTotal);
  const mutualFunds = getVal(ms, CONSOLIDATED_TAGS.mutualFunds);
  const equityStock = getVal(ms, CONSOLIDATED_TAGS.equityStock);
  const bondStock = getVal(ms, CONSOLIDATED_TAGS.bondStock);
  const liquidcase = getVal(ms, CONSOLIDATED_TAGS.liquidcase) + getVal(ms, LIQUIDBEES_TAG);
  const cash = accountValue - mutualFunds - equityStock - bondStock - liquidcase;
  return { accountValue, mutualFunds, equityStock, bondStock, liquidcase, cash };
}

/**
 * holdings            = mutualFunds + equityStock + bondStock
 * idealHoldingsPct     = caller-resolved (client_strategy_configs.equity_pct
 *                        ?? strategy_defaults.equity_pct ?? POST-body
 *                        override -- see lib/cash-margin/config.ts's
 *                        resolveRatioConfig(); tier-based hardcode removed,
 *                        see docs/thresholds-to-table-and-post-override-plan.md)
 * idealAccountValue    = holdings / idealHoldingsPct
 * utilizedCash         = idealAccountValue - holdings
 * currentCash          = cash + liquidcase
 * excessCash           = currentCash - utilizedCash
 */
export function computeConsolidatedExcessCash(
  summary: ConsolidatedSummary,
  idealHoldingsPct: number,
): ConsolidatedExcessCash {
  const holdings = summary.mutualFunds + summary.equityStock + summary.bondStock;
  const idealCashPct = 1 - idealHoldingsPct;
  const idealAccountValue = idealHoldingsPct ? holdings / idealHoldingsPct : 0;
  const utilizedCash = idealAccountValue - holdings;
  const currentCash = summary.cash + summary.liquidcase;
  const excessCash = currentCash - utilizedCash;

  return {
    holdingsValue: holdings,
    idealHoldingsPct: idealHoldingsPct * 100,
    idealAccountValue,
    idealCashPct: idealCashPct * 100,
    utilizedCash,
    currentCash,
    excessCash,
  };
}

export type CombinedCashStatus = "HEALTHY" | "ACTION_REQUIRED" | "WARNING" | "CRITICAL";

/**
 * Combined (whole-client) Cash % health -- ported verbatim from
 * SMA_Dashboard_v12.xlsx's P2 sheet, cell 8K:
 *   IF(cashPct>=0.17,"Healthy", IF(>=0.15,"Action Required", IF(>=0.13,"Warning","Critical")))
 * A DIFFERENT concept from thresholds.ts's classifyMarginMetric -- that one
 * runs per-strategy (Cash %/CC %/NCC %, DB-driven bands via
 * resolveThresholdConfig), this one runs once per CLIENT on the combined
 * Cash+Liquidcase % of combined Account Value, with its own flat,
 * hardcoded 17%/15%/13% bands (not present in strategy_defaults or
 * client_strategy_configs -- this exact bands-and-tiers set exists only in
 * the source workbook). See docs/assumptions-and-changes-from-krish-logic.md
 * §19.2 for the full writeup, including two things ported AS-IS, unresolved:
 *  - the tier ORDER looks backwards ("Action Required" fires above
 *    "Warning" as cash% drops, opposite of thresholds.ts's own ordering)
 *  - "Critical" is a tier with no equivalent anywhere else in this codebase
 * Neither was "fixed" here -- this reproduces the sheet's own formula
 * exactly, on the theory that a faithful port is more useful than a
 * silently "corrected" guess. Revisit if Akash confirms the sheet's
 * ordering is itself a labeling bug.
 */
const COMBINED_CASH_STATUS_BANDS = { healthy: 0.17, actionRequired: 0.15, warning: 0.13 } as const;

/** @param cashPct - fraction (0-1) of combined Account Value, e.g. currentCash / accountValue -- NOT percent-scale. */
export function classifyCombinedCashStatus(cashPct: number): CombinedCashStatus {
  if (cashPct >= COMBINED_CASH_STATUS_BANDS.healthy) return "HEALTHY";
  if (cashPct >= COMBINED_CASH_STATUS_BANDS.actionRequired) return "ACTION_REQUIRED";
  if (cashPct >= COMBINED_CASH_STATUS_BANDS.warning) return "WARNING";
  return "CRITICAL";
}

export interface AccountSummaryLine {
  label: string;
  value: number;
  /** Percent units (0-100), always of Account Value. */
  pct: number;
}

export interface AccountSummaryCombined {
  accountValue: number;
  mutualFunds: number;
  equityStock: number;
  gold: number;
  lowVol: number;
  momentum: number;
  bondStock: number;
  liquidcase: number;
  cash: number;
  /** MF + Equity Stock Holdings + Bond Stock Holdings. Gold/Low Vol/Momentum
   * are an informational sub-breakdown only (of QAW's equity leg) and are
   * never added into this total -- ported from ma-portfolio-review's
   * dual_account_sheet.py Table 6 ("Overall Combined Summary"), which
   * explicitly subtracts them back out. */
  holdings: number;
  cashPlusLiquidcase: number;
  rows: AccountSummaryLine[];
}

/**
 * Shared row-builder for the "ACCOUNT SUMMARY" table -- same 11 rows whether
 * the scope is Combined (no-prefix rollup) or a single strategy (prefixed
 * tags). Pure -- no DB access. `%` is always of THIS scope's own Account
 * Value, including for gold/lowVol/momentum (confirmed against the pasted
 * target table, not the QAW-equity-book denominator the plan doc's reference
 * sheet uses for those three rows).
 */
function buildAccountSummaryRows(
  summary: ConsolidatedSummary,
  gold: number,
  lowVol: number,
  momentum: number,
): AccountSummaryCombined {
  const holdings = summary.mutualFunds + summary.equityStock + summary.bondStock;
  const cashPlusLiquidcase = summary.cash + summary.liquidcase;
  const av = summary.accountValue;
  const pct = (part: number) => (av ? (part / av) * 100 : 0);

  const rows: AccountSummaryLine[] = [
    { label: "Account Value", value: av, pct: 100 },
    { label: "Mutual Funds", value: summary.mutualFunds, pct: pct(summary.mutualFunds) },
    { label: "Equity Stock Holdings", value: summary.equityStock, pct: pct(summary.equityStock) },
    { label: "Gold", value: gold, pct: pct(gold) },
    { label: "Low Vol", value: lowVol, pct: pct(lowVol) },
    { label: "Momentum", value: momentum, pct: pct(momentum) },
    { label: "Bond Stock Holdings", value: summary.bondStock, pct: pct(summary.bondStock) },
    { label: "Liquidcase", value: summary.liquidcase, pct: pct(summary.liquidcase) },
    { label: "Cash", value: summary.cash, pct: pct(summary.cash) },
    { label: "Holdings (MF+EQ+Bond)", value: holdings, pct: pct(holdings) },
    { label: "Cash + Liquidcase", value: cashPlusLiquidcase, pct: pct(cashPlusLiquidcase) },
  ];

  return {
    accountValue: av,
    mutualFunds: summary.mutualFunds,
    equityStock: summary.equityStock,
    gold,
    lowVol,
    momentum,
    bondStock: summary.bondStock,
    liquidcase: summary.liquidcase,
    cash: summary.cash,
    holdings,
    cashPlusLiquidcase,
    rows,
  };
}

function sumQawSubTags(
  ms: MastersheetSnapshot,
  strategies: string[],
): { gold: number; momentum: number; lowVol: number } {
  let gold = 0;
  let momentum = 0;
  let lowVol = 0;
  for (const strategy of strategies) {
    gold += getVal(ms, `${strategy} ${QAW_SUB_TAG_SUFFIXES.gold}`);
    momentum += getVal(ms, `${strategy} ${QAW_SUB_TAG_SUFFIXES.momentum}`);
    lowVol += getVal(ms, `${strategy} ${QAW_SUB_TAG_SUFFIXES.lowVol}`);
  }
  return { gold, momentum, lowVol };
}

/**
 * "ACCOUNT SUMMARY - Combined" -- one client's whole-account breakdown across
 * all of its active strategies. accountValue/mutualFunds/equityStock/
 * bondStock/liquidcase/cash come from the no-prefix rollup (computeConsolidated),
 * matching what excess_cash_report.py's compute_consolidated() actually reads
 * (not a sum of the per-strategy legs). Gold/Low Vol/Momentum are summed
 * separately across each active strategy's prefixed tags
 * (QAW_SUB_TAG_SUFFIXES), since they don't exist in the no-prefix rollup.
 */
export function computeAccountSummaryCombined(
  ms: MastersheetSnapshot,
  activeStrategies: string[],
): AccountSummaryCombined {
  const summary = computeConsolidated(ms);
  const { gold, momentum, lowVol } = sumQawSubTags(ms, activeStrategies);
  return buildAccountSummaryRows(summary, gold, lowVol, momentum);
}

/**
 * "ACCOUNT SUMMARY" for a single active strategy (e.g. QYE++ or QAW++) --
 * prefixed tags throughout (mastersheet.ts's computeAccountSummary), plus
 * that same strategy's own Gold/Low Vol/Momentum legs (₹0 for non-QAW
 * strategies, since those tags simply won't exist for them).
 */
export function computeAccountSummaryForStrategy(
  ms: MastersheetSnapshot,
  strategy: string,
  exposureTagSuffix: string,
): AccountSummaryCombined {
  const summary = computeAccountSummary(ms, strategy, exposureTagSuffix);
  const { gold, momentum, lowVol } = sumQawSubTags(ms, [strategy]);
  return buildAccountSummaryRows(summary, gold, lowVol, momentum);
}
