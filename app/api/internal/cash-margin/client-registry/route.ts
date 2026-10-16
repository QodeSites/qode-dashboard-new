import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import { buildClientRegistry } from "@/lib/cash-margin/client-registry";
import { parseCashMarginBody } from "@/lib/cash-margin/request-utils";

/**
 * "Clients / Portfolio Overview" (P1) -- one row per active, non-XTS
 * client-strategy mandate across EVERY client at once, plus a Summary
 * Banner and an Action Queue. See docs/page1-client-portfolio-overview-plan.md.
 *
 * Unlike every other cash-margin route, this one takes no `qcode` -- it's a
 * multi-client registry, not a single-client detail view.
 *
 * `overrides` (equity_pct + the alert threshold bands) is request-scoped
 * only and is never written back to the DB.
 *
 * POST /api/internal/cash-margin/client-registry
 * body: { overrides?: { [strategy: string]: { equityPct?, cashPctHealthy?, ... } }, asOfDate?: string }
 *
 * `asOfDate` (YYYY-MM-DD) pins the mastersheet read in this response to a
 * historical date instead of always-latest (see
 * lib/cash-margin/mastersheet.ts's loadMastersheet). Omit for "latest."
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  const { data, error: parseError } = await parseCashMarginBody(request, { requireQcode: false });
  if (parseError) return parseError;
  const { overrides, asOfDate } = data;

  try {
    const result = await buildClientRegistry(overrides, asOfDate);
    return NextResponse.json({ generatedAt: new Date().toISOString(), ...result });
  } catch (e) {
    console.error("[cash-margin/client-registry] failed:", e);
    return NextResponse.json(
      { error: "Failed to build client registry", detail: (e as Error).message },
      { status: 500 },
    );
  }
}
