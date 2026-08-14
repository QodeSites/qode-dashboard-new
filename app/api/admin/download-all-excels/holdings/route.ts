import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/admin-utils";
import { buildHoldingsZipForClients } from "@/app/lib/excel-export-utils";
import { fetchAdminExportClients } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * GET /api/admin/download-all-excels/holdings
 * GET /api/admin/download-all-excels/holdings?icode=QUS0007   ← single client
 *
 * Admin-only. Returns a .zip with only the "holdings" Excels.
 */
export async function GET(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const icodeFilter = searchParams.get("icode");

  try {
    const clients = await fetchAdminExportClients(icodeFilter);
    const { zipBuffer, totalFiles, errors } = await buildHoldingsZipForClients(clients);

    if (totalFiles === 0) {
      return NextResponse.json(
        { error: "No holdings Excels could be generated", errors },
        { status: 500 }
      );
    }

    const label = icodeFilter ?? "all_clients";
    const date  = new Date().toISOString().slice(0, 10);

    return new Response(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="holdings_excels_${label}_${date}.zip"`,
        "X-Files-Generated": String(totalFiles),
      },
    });
  } catch (err) {
    console.error("Admin download-all-excels/holdings error:", err);
    return NextResponse.json({ error: "Failed to generate holdings Excels" }, { status: 500 });
  }
}
