/**
 * lib/cash-margin/config.ts
 * Shared resolver for the ratio/threshold columns that used to be hardcoded
 * per-file constants (EQUITY_BOOK_PCT, IDEAL_CASH_PCT, QAW_SUB_PCT in
 * system-breakup.ts; the inline 0.7/0.8 in consolidated.ts;
 * MARGIN_HEALTH_THRESHOLDS in thresholds.ts).
 *
 * All of these already exist as columns on client_strategy_configs +
 * strategy_defaults, already seeded, already read by app/lib/internal-utils.ts
 * (Krish's Withdrawal feature) via the same pair.field ?? toNum(def?.field)
 * coalesce -- see docs/thresholds-to-table-and-post-override-plan.md.
 *
 * Resolution order here adds a 3rd layer on top of that same coalesce:
 *   overrides[strategy]?.field ?? clientConfig.field ?? strategyDefault.field
 * `overrides` comes from a POST body and is request-scoped ONLY -- it is
 * never written back to the DB (CLAUDE.md mandates read-only DB access for
 * all dashboard code). It exists purely to preview "what if this
 * threshold/ratio were different" for one response.
 */

export interface StrategyOverride {
  equityPct?: number;
  cashPct?: number;
  lcPct?: number;
  derivativePct?: number;
  goldPct?: number;
  momentumPct?: number;
  lowvolPct?: number;
  cashPctHealthy?: number;
  cashPctWarning?: number;
  cashPctUpside?: number;
  cashCollateralPctHealthy?: number;
  cashCollateralPctWarning?: number;
  nonCashCollateralPctHealthy?: number;
  nonCashCollateralPctWarning?: number;
  /** Margin Requirements' own %-based config (already DB-driven pre-existing
   *  -- these just gain the same override layer as everything else here). */
  longOptPct?: number;
  psarMultiplier?: number;
  psarLeverage?: number;
  drawdownMarginPct?: number;
}

/** Keyed by strategy name (e.g. "QAW++"). Request-scoped only, never persisted. */
export type StrategyOverrides = Record<string, StrategyOverride>;

/**
 * Structural subset of client_strategy_configs / strategy_defaults rows --
 * both tables carry every one of these columns, so a Prisma row selected
 * with the matching `select` satisfies this without a cast.
 */
export interface StrategyConfigFields {
  equity_pct?: unknown;
  cash_pct?: unknown;
  lc_pct?: unknown;
  derivative_pct?: unknown;
  gold_pct?: unknown;
  momentum_pct?: unknown;
  lowvol_pct?: unknown;
  cash_pct_healthy?: unknown;
  cash_pct_warning?: unknown;
  cash_pct_upside?: unknown;
  cash_collateral_pct_healthy?: unknown;
  cash_collateral_pct_warning?: unknown;
  non_cash_collateral_pct_healthy?: unknown;
  non_cash_collateral_pct_warning?: unknown;
}

export interface RatioConfig {
  /** Equity Book target % of Account Value (was EQUITY_BOOK_PCT[tier]). */
  equityPct: number;
  /** Derivative Book's Cash sub-target (was IDEAL_CASH_PCT[tier]). */
  cashPct: number;
  /** Derivative Book's Liquid Case sub-target (was derived: derivPct - IDEAL_CASH_PCT[tier]). */
  lcPct: number;
  /** Derivative Book % of Account Value (was 1 - EQUITY_BOOK_PCT[tier]). */
  derivativePct: number;
  /** QAW Equity Book split (was the hardcoded global QAW_SUB_PCT). Null for non-split strategies. */
  goldPct: number | null;
  momentumPct: number | null;
  lowvolPct: number | null;
}

export interface Band {
  healthy: number;
  warning: number;
  upside?: number;
}

export type MetricKey = "cash_pct" | "cash_collateral_pct" | "non_cash_collateral_pct";

export type ThresholdConfig = Record<MetricKey, Band>;

function toNum(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

/** Resolves the Equity/Derivative Book ratios for one strategy. */
export function resolveRatioConfig(
  strategy: string,
  clientConfig: StrategyConfigFields | undefined,
  strategyDefault: StrategyConfigFields | undefined,
  overrides: StrategyOverrides | undefined,
): RatioConfig {
  const ov = overrides?.[strategy];
  const equityPct =
    ov?.equityPct ?? toNum(clientConfig?.equity_pct) ?? toNum(strategyDefault?.equity_pct) ?? 0;
  const cashPct = ov?.cashPct ?? toNum(clientConfig?.cash_pct) ?? toNum(strategyDefault?.cash_pct) ?? 0;
  const lcPct = ov?.lcPct ?? toNum(clientConfig?.lc_pct) ?? toNum(strategyDefault?.lc_pct) ?? 0;
  const derivativePct =
    ov?.derivativePct ?? toNum(clientConfig?.derivative_pct) ?? toNum(strategyDefault?.derivative_pct) ?? 1 - equityPct;
  const goldPct = ov?.goldPct ?? toNum(clientConfig?.gold_pct) ?? toNum(strategyDefault?.gold_pct);
  const momentumPct = ov?.momentumPct ?? toNum(clientConfig?.momentum_pct) ?? toNum(strategyDefault?.momentum_pct);
  const lowvolPct = ov?.lowvolPct ?? toNum(clientConfig?.lowvol_pct) ?? toNum(strategyDefault?.lowvol_pct);

  return { equityPct, cashPct, lcPct, derivativePct, goldPct, momentumPct, lowvolPct };
}

/**
 * Resolves the tiered Margin Health alert bands for one strategy.
 *
 * DB columns (and override input) are fractions (0-1, e.g. 0.05 = 5%) --
 * the same scale client_strategy_configs/strategy_defaults already use
 * everywhere else, and what app/lib/internal-utils.ts's withdrawal
 * guardrails already read directly. alerts.ts compares bands against
 * percent-scale (0-100) metric values (its own `pct()` helper), so each
 * resolved fraction is scaled by *100 here, once, at the boundary -- the
 * old hardcoded MARGIN_HEALTH_THRESHOLDS constant was percent-scale
 * literals (5.0, not 0.05), so this preserves alerts.ts's existing
 * comparison logic unchanged.
 */
export function resolveThresholdConfig(
  strategy: string,
  clientConfig: StrategyConfigFields | undefined,
  strategyDefault: StrategyConfigFields | undefined,
  overrides: StrategyOverrides | undefined,
): ThresholdConfig {
  const ov = overrides?.[strategy];
  const frac = (v: number | undefined, field: keyof StrategyConfigFields): number | undefined => {
    const resolved = v ?? toNum(clientConfig?.[field]) ?? toNum(strategyDefault?.[field]) ?? undefined;
    return resolved === undefined ? undefined : resolved * 100;
  };

  return {
    cash_pct: {
      healthy: frac(ov?.cashPctHealthy, "cash_pct_healthy") ?? 0,
      warning: frac(ov?.cashPctWarning, "cash_pct_warning") ?? 0,
      upside: frac(ov?.cashPctUpside, "cash_pct_upside"),
    },
    cash_collateral_pct: {
      healthy: frac(ov?.cashCollateralPctHealthy, "cash_collateral_pct_healthy") ?? 0,
      warning: frac(ov?.cashCollateralPctWarning, "cash_collateral_pct_warning") ?? 0,
    },
    non_cash_collateral_pct: {
      healthy: frac(ov?.nonCashCollateralPctHealthy, "non_cash_collateral_pct_healthy") ?? 0,
      warning: frac(ov?.nonCashCollateralPctWarning, "non_cash_collateral_pct_warning") ?? 0,
    },
  };
}
