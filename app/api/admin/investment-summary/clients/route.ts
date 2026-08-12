import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/admin-utils";
import { getAllClientConfigs } from "@/app/lib/investment-summary/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/investment-summary/clients
 *  Returns the deduplicated client list from Master_Config.csv,
 *  sorted by clientName. Used by the admin download UI.
 */
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const rows = await getAllClientConfigs();

  const seen = new Set<string>();
  const clients: { icode: string; clientName: string }[] = [];
  for (const row of rows.sort((a, b) => a.clientName.localeCompare(b.clientName))) {
    if (!seen.has(row.icode)) {
      seen.add(row.icode);
      clients.push({ icode: row.icode, clientName: row.clientName });
    }
  }

  return NextResponse.json({ clients });
}
