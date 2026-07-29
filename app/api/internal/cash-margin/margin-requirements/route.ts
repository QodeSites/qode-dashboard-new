import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import { buildMarginRequirements } from "@/lib/cash-margin/margin-requirements";
import { parseCashMarginBody } from "@/lib/cash-margin/request-utils";

/**
 * "MARGIN REQUIREMENTS - Combined / {strategy}" for one client (qcode) --
 * Required (Long Options, PSAR, Put Protection, Drawdown Margin) vs
 * Available (Cash Collateral, Non-Cash Collateral, Cash) and the resulting
 * Excess/Shortfall, per active strategy plus a Combined scope (straight sum
 * of per-strategy Required + already exposure-split Available -- Python has
 * no Combined view for this table, see margin-requirements.ts).
 *
 * long_opt_pct/psar_multiplier/psar_leverage/drawdown_margin_pct/gold_pct/
 * momentum_pct/lowvol_pct come from client_strategy_configs ??
 * strategy_defaults -- optionally overridden per-strategy via `overrides`
 * in the POST body (request-scoped only, never persisted).
 * NIFTY_LOT_SIZE / PUT_PROTECTION_AVG_PRICE_PER_QTY are NOT overridable --
 * always the hardcoded 65 / 450, matching Python exactly, see
 * docs/thresholds-to-table-and-post-override-plan.md.
 *
 * POST /api/internal/cash-margin/margin-requirements
 * body: { qcode: string, overrides?: { [strategy: string]: { longOptPct?, ... } }, asOfDate?: string, niftyLtp?: number }
 *
 * `asOfDate` (YYYY-MM-DD) is TEMPORARY -- for verifying against frozen
 * managed_accounts_analysis Excels by pinning the mastersheet read to a
 * historical date instead of always-latest. Remove once done (see
 * lib/cash-margin/mastersheet.ts's loadMastersheet).
 *
 * `niftyLtp` stands in for Python's live/manual Nifty ATM figure and drives
 * Put Protection's contractValue (= niftyLtp * NIFTY_LOT_SIZE) -- without
 * it, Put Protection falls back to 0. (Previously this read
 * cm_contract_value.contract_value, but that column turned out to hold a
 * signed delta-like figure, not ATM * lot size -- dropped in favor of
 * niftyLtp, the real Python input it was meant to stand in for.)
 * NIFTY_LOT_SIZE itself is never derived from niftyLtp -- always the
 * hardcoded 65.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  const { data, error: parseError } = await parseCashMarginBody(request, { requireQcode: true });
  if (parseError) return parseError;
  const { overrides, asOfDate, niftyLtpOverride } = data;
  const qcode = data.qcode as string;

  try {
    const result = await buildMarginRequirements(qcode, overrides, asOfDate, niftyLtpOverride);
    if (!result) {
      return NextResponse.json(
        { error: `No active mandate found for qcode "${qcode}"` },
        { status: 404 },
      );
    }
    return NextResponse.json(result);
  } catch (e) {
    console.error("[cash-margin/margin-requirements] failed:", e);
    return NextResponse.json(
      { error: "Failed to build margin requirements", detail: (e as Error).message },
      { status: 500 },
    );
  }
}
