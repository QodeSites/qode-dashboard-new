/**
 * lib/cash-margin/tags.ts
 * Tag resolution + tier/XTS helpers.
 *
 * Ported from managed_accounts_analysis/common_report_utils.py
 * (resolve_zerodha_total_tag, is_xts_mandate, detect_tier).
 *
 * Difference vs Python: here `exposureTagSuffix` comes from
 * client_strategy_configs.exposure_tag_suffix and is ALWAYS a plain suffix
 * ("Zerodha Total Portfolio" or "Total Portfolio Exposure"), never blank and
 * never the full tag. So the account-value tag is always
 * `${strategy} ${exposureTagSuffix}` -- no conditional fallback needed.
 */

export const ZERODHA_TOTAL_SUFFIX = "Zerodha Total Portfolio";
export const XTS_EXPOSURE_SUFFIX = "Total Portfolio Exposure";

export type Tier = "+" | "++";

export function detectTier(strategy: string): Tier {
  return strategy.includes("++") ? "++" : "+";
}

/**
 * The System Tag to read for a strategy's Account Value / Exposure lookup.
 * e.g. ("QYE++", "Zerodha Total Portfolio") -> "QYE++ Zerodha Total Portfolio".
 */
export function resolveAccountValueTag(strategy: string, exposureTagSuffix: string): string {
  return `${strategy} ${exposureTagSuffix}`.trim();
}

/**
 * True for XTS-platform mandates. These run fully on cash with no Zerodha
 * margin account behind them, so the collateral ratios are structurally
 * meaningless (false positives) and the mandate is skipped entirely.
 */
export function isXtsMandate(exposureTagSuffix: string | null | undefined): boolean {
  return (exposureTagSuffix ?? "").trim() === XTS_EXPOSURE_SUFFIX;
}

/**
 * "Prop" (proprietary trading, not a client mandate) is out of scope for
 * this module -- see docs/cash-margin-architecture.md §9. It was never
 * migrated to config_catalog, so resolving its ratios here would either
 * silently return nothing or, worse, fall through to a stale value from
 * the old flat columns. Every cash-margin mandate query excludes it at the
 * DB level via `strategy: { not: PROP_STRATEGY }`, mirroring isXtsMandate's
 * role for XTS.
 */
export const PROP_STRATEGY = "Prop";
