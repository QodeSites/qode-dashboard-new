import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/admin-utils";
import { buildDashboardZipForClients } from "@/app/lib/excel-export-utils";
import { fetchAdminExportClients } from "../_shared";

// Long-running admin export. Node runtime (Prisma), no static optimization,
// no fetch caching. On self-hosted Node there's no built-in function timeout —
// the 504 you may see comes from the reverse proxy in front (nginx/caddy);
// raise proxy_read_timeout/proxy_send_timeout there for this location.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * GET /api/admin/download-all-excels/dashboard
 * GET /api/admin/download-all-excels/dashboard?icode=QUS0007   ← single client
 *
 * Admin-only. Returns a .zip with only the "dashboard" portfolio Excels.
 */
export async function GET(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const icodeFilter = searchParams.get("icode");

  try {
    const clients = await fetchAdminExportClients(icodeFilter);
    const { zipBuffer, totalFiles, errors } = await buildDashboardZipForClients(clients);

    if (totalFiles === 0) {
      return NextResponse.json(
        { error: "No dashboard Excels could be generated", errors },
        { status: 500 }
      );
    }

    const label = icodeFilter ?? "all_clients";
    const date  = new Date().toISOString().slice(0, 10);

    return new Response(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="dashboard_excels_${label}_${date}.zip"`,
        "X-Files-Generated": String(totalFiles),
      },
    });
  } catch (err) {
    console.error("Admin download-all-excels/dashboard error:", err);
    return NextResponse.json({ error: "Failed to generate dashboard Excels" }, { status: 500 });
  }
}
