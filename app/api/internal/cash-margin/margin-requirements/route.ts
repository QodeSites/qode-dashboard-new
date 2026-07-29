import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import { buildMarginRequirements } from "@/lib/cash-margin/margin-requirements";

/**
 * "MARGIN REQUIREMENTS - Combined / {strategy}" for one client (qcode) --
 * Required (Long Options, PSAR, Put Protection, Drawdown Margin) vs
 * Available (Cash Collateral, Non-Cash Collateral, Cash) and the resulting
 * Excess/Shortfall, per active strategy plus a Combined scope (straight sum
 * of per-strategy Required + already exposure-split Available -- Python has
 * no Combined view for this table, see margin-requirements.ts).
 *
 * GET /api/internal/cash-margin/margin-requirements?qcode=QAC00071
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  const qcode = new URL(request.url).searchParams.get("qcode")?.trim();
  if (!qcode) {
    return NextResponse.json({ error: "Missing required query param: qcode" }, { status: 400 });
  }

  try {
    const result = await buildMarginRequirements(qcode);
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
