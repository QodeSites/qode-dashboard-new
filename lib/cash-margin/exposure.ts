/**
 * lib/cash-margin/exposure.ts
 * Multi-strategy exposure split.
 *
 * Ported from managed_accounts_analysis/reports/margin_report.py
 * (compute_exposure_share). Splits an aggregate (whole-account) Zerodha
 * margin figure across a client's strategies, proportional to each
 * strategy's share of total Exposure.
 */
import type { MastersheetSnapshot } from "./mastersheet";
import { getExposure } from "./mastersheet";
import { resolveAccountValueTag, ZERODHA_TOTAL_SUFFIX } from "./tags";

const BASE_ZERODHA_TOTAL_TAG = ZERODHA_TOTAL_SUFFIX; // no-prefix consolidated tag

/**
 * This strategy's share (0-1) of the client's total Exposure.
 * - Single-strategy clients always get 1.0 (the aggregate margin IS theirs).
 * - If the no-prefix total Exposure tag is missing/zero for a genuinely
 *   multi-strategy client, falls back to an equal split with a warning
 *   (mirrors the Python behaviour -- never silently zero out availability).
 */
export function computeExposureShare(
  ms: MastersheetSnapshot,
  strategy: string,
  exposureTagSuffix: string,
  activeStrategyCount: number,
): number {
  if (activeStrategyCount <= 1) return 1.0;

  const totalExposure = getExposure(ms, BASE_ZERODHA_TOTAL_TAG);
  if (!totalExposure) {
    console.warn(
      `[cash-margin] No total Exposure for "${BASE_ZERODHA_TOTAL_TAG}" (qcode ${ms.qcode}) -- ` +
        `equal split across ${activeStrategyCount} strategies.`,
    );
    return 1.0 / activeStrategyCount;
  }
  const stratExposure = getExposure(ms, resolveAccountValueTag(strategy, exposureTagSuffix));
  return stratExposure / totalExposure;
}
