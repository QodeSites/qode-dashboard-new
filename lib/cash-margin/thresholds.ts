/**
 * lib/cash-margin/thresholds.ts
 * Margin Health severity classifier.
 *
 * Bands used to be a hardcoded tiered constant ported from
 * managed_accounts_analysis/alerts.py (MARGIN_HEALTH_THRESHOLDS). That
 * constant is gone -- bands are now resolved per-strategy by the caller from
 * client_strategy_configs ?? strategy_defaults (+ an optional POST-body
 * override) via lib/cash-margin/config.ts's resolveThresholdConfig(). See
 * docs/thresholds-to-table-and-post-override-plan.md and
 * docs/assumptions-and-changes-from-krish-logic.md §14a.
 */
import type { Band, MetricKey } from "./config";

export type { MetricKey } from "./config";
export type Severity = "HEALTHY" | "ACTION_REQUIRED" | "WARNING" | "UPSIDE" | "UNAVAILABLE";

export const METRIC_ORDER: MetricKey[] = ["cash_pct", "cash_collateral_pct", "non_cash_collateral_pct"];

export const METRIC_LABEL: Record<MetricKey, string> = {
  cash_pct: "Cash %",
  cash_collateral_pct: "Cash Collateral Margin %",
  non_cash_collateral_pct: "Non-Cash Collateral Margin %",
};

/**
 * HEALTHY / ACTION_REQUIRED / WARNING / UPSIDE / UNAVAILABLE.
 * UPSIDE only applies to metrics with an `upside` band (currently cash_pct),
 * checked first since a value can't be both above its cap and below its floor.
 */
export function classifyMarginMetric(pct: number | null, band: Band): Severity {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return "UNAVAILABLE";
  if (band.upside !== undefined && pct > band.upside) return "UPSIDE";
  if (pct >= band.healthy) return "HEALTHY";
  if (pct < band.warning) return "WARNING";
  return "ACTION_REQUIRED";
}

/**
 * Sleeve Drift severity -- symmetric around 0, unlike classifyMarginMetric's
 * one-sided floor check. A sleeve can drift too high OR too low against its
 * target, and both directions are equally a problem (it's a model-portfolio
 * shift, not a minimum-balance guarantee), so this classifies on |diffPct|
 * against a healthy/warning band with no upside concept.
 *
 * `diffPct` is SystemBreakupRow.diffPct (currentPct - targetPct, both
 * already expressed as % of the equity book's own total) -- see
 * system-breakup.ts. No UNAVAILABLE-vs-real-zero ambiguity here beyond what
 * diffPct already carries: null means the leg had no resolvable data.
 */
export function classifySleeveDrift(diffPct: number | null, band: Band): Severity {
  if (diffPct === null || diffPct === undefined || Number.isNaN(diffPct)) return "UNAVAILABLE";
  const abs = Math.abs(diffPct);
  if (abs <= band.healthy) return "HEALTHY";
  if (abs <= band.warning) return "WARNING";
  return "ACTION_REQUIRED";
}
