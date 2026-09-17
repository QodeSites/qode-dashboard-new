import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/admin-utils";
import { fetchAdminExportIcodes } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * GET /api/admin/download-all-excels/clients
 *
 * Admin-only. Lightweight, fast endpoint returning the ordered icode list the
 * export covers, so the UI can plan batches before calling /dashboard or /holdings.
 */
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const icodes = await fetchAdminExportIcodes();
    return NextResponse.json({ icodes, total: icodes.length });
  } catch (err) {
    console.error("Admin download-all-excels/clients error:", err);
    return NextResponse.json({ error: "Failed to fetch client list" }, { status: 500 });
  }
}
