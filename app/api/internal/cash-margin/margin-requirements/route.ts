import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import { buildMarginRequirements } from "@/lib/cash-margin/margin-requirements";
import type { StrategyOverrides } from "@/lib/cash-margin/config";

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
 * in the POST body (request-scoped only, never persisted). NIFTY_LOT_SIZE /
 * PUT_PROTECTION_AVG_PRICE_PER_QTY are NOT overridable -- deferred, see
 * docs/thresholds-to-table-and-post-override-plan.md.
 *
 * POST /api/internal/cash-margin/margin-requirements
 * body: { qcode: string, overrides?: { [strategy: string]: { longOptPct?, ... } } }
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const qcode: string | undefined = body?.qcode?.trim();
  const overrides: StrategyOverrides | undefined = body?.overrides;
  if (!qcode) {
    return NextResponse.json({ error: "Missing required field: qcode" }, { status: 400 });
  }

  try {
    const result = await buildMarginRequirements(qcode, overrides);
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
