import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/admin-utils";
import { buildAlertRows } from "@/lib/cash-margin/alerts";

// Live Cash & Margin alert table. One row per active non-XTS mandate x metric
// (Cash %, Cash Collateral %, Non-Cash Collateral %). Fetches Zerodha margin
// live and reads the bifurcated_master_sheet_test snapshot per client.
export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const rows = await buildAlertRows();
    return NextResponse.json({ generatedAt: new Date().toISOString(), count: rows.length, rows });
  } catch (e) {
    console.error("[cash-margin/alerts] failed:", e);
    return NextResponse.json(
      { error: "Failed to build alert table", detail: (e as Error).message },
      { status: 500 },
    );
  }
}
