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
 * Does NOT compute Alert Status -- that's thresholds.ts's tiered
 * MARGIN_HEALTH_THRESHOLDS, and there is no per-client (as opposed to
 * per-strategy) rollup of it yet.
 */
import type { MastersheetSnapshot } from "./mastersheet";
import { getVal } from "./mastersheet";
import type { Tier } from "./tags";

const CONSOLIDATED_TAGS = {
  zerodhaTotal: "Zerodha Total Portfolio",
  mutualFunds: "Mutual Funds",
  equityStock: "Equity Stock Holdings",
  bondStock: "Bond Stock Holdings",
  liquidcase: "Liquidcase Stock Holdings",
} as const;
const LIQUIDBEES_TAG = "Liquidbees";

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
 * idealHoldingsPct     = override, else 70% (tier '++') / 80% (tier '+')
 * idealAccountValue    = holdings / idealHoldingsPct
 * utilizedCash         = idealAccountValue - holdings
 * currentCash          = cash + liquidcase
 * excessCash           = currentCash - utilizedCash
 */
export function computeConsolidatedExcessCash(
  summary: ConsolidatedSummary,
  tier: Tier,
  idealHoldingsPctOverride?: number,
): ConsolidatedExcessCash {
  const holdings = summary.mutualFunds + summary.equityStock + summary.bondStock;
  const idealHoldingsPct = idealHoldingsPctOverride ?? (tier === "++" ? 0.7 : 0.8);
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
