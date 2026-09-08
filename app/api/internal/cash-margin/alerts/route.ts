import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import { buildAlertRows } from "@/lib/cash-margin/alerts";
import { parseCashMarginBody } from "@/lib/cash-margin/request-utils";

/**
 * Live Cash & Margin alert table. One row per active non-XTS mandate x metric
 * (Cash %, Cash Collateral %, Non-Cash Collateral %). Reads margin collateral
 * from cm_margin_collateral and the bifurcated_master_sheet_test snapshot per client.
 *
 * Threshold bands come from client_strategy_configs ?? strategy_defaults --
 * optionally overridden per-strategy via `overrides` in the POST body.
 * `overrides` is request-scoped only and is never written back to the DB.
 *
 * HEALTHY rows are filtered out here before responding -- this endpoint only
 * surfaces rows that need attention (WARNING/ACTION_REQUIRED/UPSIDE/UNAVAILABLE).
 * `buildAlertRows()` itself still returns every row including HEALTHY --
 * `lib/cash-margin/client-registry.ts` calls it directly (not through this
 * route) and needs the full set to correctly compute "worst-of" per client;
 * filtering inside buildAlertRows() would silently turn a genuinely healthy
 * client into a false UNAVAILABLE there. Only this route's response is scoped
 * down to non-healthy rows.
 *
 * POST /api/internal/cash-margin/alerts
 * body: { overrides?: { [strategy: string]: { cashPctHealthy?, ... } }, asOfDate?: string }
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
    const allRows = await buildAlertRows(overrides, asOfDate);
    const rows = allRows.filter((r) => r.severity !== "HEALTHY");
    return NextResponse.json({ generatedAt: new Date().toISOString(), count: rows.length, rows });
  } catch (e) {
    console.error("[cash-margin/alerts] failed:", e);
    return NextResponse.json(
      { error: "Failed to build alert table", detail: (e as Error).message },
      { status: 500 },
    );
  }
}
