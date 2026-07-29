import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import { buildAlertRows } from "@/lib/cash-margin/alerts";
import type { StrategyOverrides } from "@/lib/cash-margin/config";

/**
 * Live Cash & Margin alert table. One row per active non-XTS mandate x metric
 * (Cash %, Cash Collateral %, Non-Cash Collateral %). Reads margin collateral
 * from cm_margin_collateral and the bifurcated_master_sheet_test snapshot per client.
 *
 * Threshold bands come from client_strategy_configs ?? strategy_defaults --
 * optionally overridden per-strategy via `overrides` in the POST body.
 * `overrides` is request-scoped only and is never written back to the DB.
 *
 * POST /api/internal/cash-margin/alerts
 * body: { overrides?: { [strategy: string]: { cashPctHealthy?, ... } } }
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const overrides: StrategyOverrides | undefined = body?.overrides;

  try {
    const rows = await buildAlertRows(overrides);
    return NextResponse.json({ generatedAt: new Date().toISOString(), count: rows.length, rows });
  } catch (e) {
    console.error("[cash-margin/alerts] failed:", e);
    return NextResponse.json(
      { error: "Failed to build alert table", detail: (e as Error).message },
      { status: 500 },
    );
  }
}
