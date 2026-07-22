/**
 * lib/cash-margin/thresholds.ts
 * Tiered Margin Health thresholds + classifier.
 *
 * Ported verbatim from managed_accounts_analysis/alerts.py
 * (MARGIN_HEALTH_THRESHOLDS, classify_margin_metric).
 *
 * NOTE: the ++ tier Cash Collateral / Non-Cash Collateral numbers are known
 * to disagree with the target alert-framework sheet. These mirror the CURRENT
 * Python values; reconcile separately before treating breaches as canonical.
 */
import type { Tier } from "./tags";

export type MetricKey = "cash_pct" | "cash_collateral_pct" | "non_cash_collateral_pct";
export type Severity = "HEALTHY" | "ACTION_REQUIRED" | "WARNING" | "UPSIDE" | "UNAVAILABLE";

interface Band {
  healthy: number;
  warning: number;
  upside?: number;
}

export const METRIC_ORDER: MetricKey[] = ["cash_pct", "cash_collateral_pct", "non_cash_collateral_pct"];

export const METRIC_LABEL: Record<MetricKey, string> = {
  cash_pct: "Cash %",
  cash_collateral_pct: "Cash Collateral Margin %",
  non_cash_collateral_pct: "Non-Cash Collateral Margin %",
};

export const MARGIN_HEALTH_THRESHOLDS: Record<MetricKey, Record<Tier, Band>> = {
  cash_pct: {
    "+": { healthy: 5.0, warning: 3.5, upside: 12.0 },
    "++": { healthy: 7.0, warning: 5.0, upside: 15.0 },
  },
  cash_collateral_pct: {
    "+": { healthy: 9.0, warning: 6.25 },
    "++": { healthy: 15.0, warning: 12.5 },
  },
  non_cash_collateral_pct: {
    "+": { healthy: 13.0, warning: 10.0 },
    "++": { healthy: 25.0, warning: 17.0 },
  },
};

/**
 * HEALTHY / ACTION_REQUIRED / WARNING / UPSIDE / UNAVAILABLE.
 * UPSIDE only applies to metrics with an `upside` band (currently cash_pct),
 * checked first since a value can't be both above its cap and below its floor.
 */
export function classifyMarginMetric(pct: number | null, tier: Tier, metricKey: MetricKey): Severity {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return "UNAVAILABLE";
  const band = MARGIN_HEALTH_THRESHOLDS[metricKey][tier];
  if (band.upside !== undefined && pct > band.upside) return "UPSIDE";
  if (pct >= band.healthy) return "HEALTHY";
  if (pct < band.warning) return "WARNING";
  return "ACTION_REQUIRED";
}
