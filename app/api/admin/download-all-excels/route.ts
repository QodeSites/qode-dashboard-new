import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/admin-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * GET /api/admin/download-all-excels
 *
 * The combined endpoint was split to avoid reverse-proxy timeouts on large
 * client fleets. The UI now hits /dashboard and /holdings sequentially.
 * This route just reports where to go — kept so old links don't 404 silently.
 */
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  return NextResponse.json({
    message: "Split into two endpoints for performance. Call each separately.",
    endpoints: [
      "/api/admin/download-all-excels/dashboard",
      "/api/admin/download-all-excels/holdings",
    ],
  });
}
