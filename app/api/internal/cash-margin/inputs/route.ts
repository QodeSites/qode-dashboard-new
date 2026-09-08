import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import { buildInputsPanel } from "@/lib/cash-margin/inputs";
import { parseCashMarginBody } from "@/lib/cash-margin/request-utils";

/**
 * "Inputs" panel (§2f) for one client (qcode) -- the per-tier config
 * reference table (QYE+/QYE++/QAW+/QAW++, same for every client), this
 * client's resolved config per active strategy + Combined, and an isolated
 * Put Protection Calculation block (live Nifty LTP, exposure per lot, lots
 * required). See docs/cash-margin-client-dashboard-plan.md §2f.
 *
 * The Put Protection Calculation block is intentionally isolated from
 * `/api/internal/cash-margin/margin-requirements` -- it fetches its own
 * live NIFTY LTP (lib/cash-margin/nifty-ltp.ts) rather than taking a
 * caller-supplied `niftyLtp`, and its NIFTY_LOT_SIZE/avg-price constants are
 * a deliberate separate copy, not shared with margin-requirements.ts. It
 * never feeds margin math and is never fed by it.
 *
 * POST /api/internal/cash-margin/inputs
 * body: { qcode: string, overrides?: { [strategy: string]: { longOptPct?, ... } }, asOfDate?: string, globalOverrides?: { niftyLotSize?: number, avgPricePerQty?: number } }
 *
 * `asOfDate` (YYYY-MM-DD) pins the mastersheet read in this response to a
 * historical date instead of always-latest (see
 * lib/cash-margin/mastersheet.ts's loadMastersheet). Omit for "latest."
 *
 * `globalOverrides` is a session-scoped override for the two global_config
 * constants (niftyLotSize/avgPricePerQty) this panel's tierReference and
 * Put Protection Calculation block read -- request-scoped only, never
 * persisted. The response's `globalConfig` field always reflects the
 * currently-effective values.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  const { data, error: parseError } = await parseCashMarginBody(request, { requireQcode: true });
  if (parseError) return parseError;
  const { overrides, asOfDate, globalOverrides } = data;
  const qcode = data.qcode as string;

  try {
    const result = await buildInputsPanel(qcode, overrides, asOfDate, globalOverrides);
    if (!result) {
      return NextResponse.json(
        { error: `No active mandate found for qcode "${qcode}"` },
        { status: 404 },
      );
    }
    return NextResponse.json(result);
  } catch (e) {
    console.error("[cash-margin/inputs] failed:", e);
    return NextResponse.json(
      { error: "Failed to build inputs panel", detail: (e as Error).message },
      { status: 500 },
    );
  }
}
