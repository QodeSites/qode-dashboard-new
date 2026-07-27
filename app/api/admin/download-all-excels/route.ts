import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/app/lib/admin-utils";
import { buildExcelZipForClients } from "@/app/lib/excel-export-utils";

/**
 * GET /api/admin/download-all-excels
 * GET /api/admin/download-all-excels?icode=QUS0007   ← single client
 *
 * Admin-only. Returns a .zip containing one folder per client and one
 * .xlsx per strategy inside each folder.
 */
export async function GET(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const icodeFilter = searchParams.get("icode");

  try {
    // Fetch clients
    const where: Record<string, unknown> = { pooled_account_users: { some: {} } };
    if (icodeFilter) where.icode = icodeFilter;

    const clients = await prisma.clients.findMany({
      where,
      select: {
        icode: true,
        user_name: true,
        pooled_account_users: {
          select: {
            accounts: {
              select: {
                qcode: true,
                account_name: true,
                account_type: true,
                broker: true,
              },
            },
          },
        },
      },
      orderBy: { user_name: "asc" },
    });

    const formattedClients = clients.map((client) => ({
      icode: client.icode,
      user_name: client.user_name,
      accounts: client.pooled_account_users.map((pau) => pau.accounts),
    }));

    const { zipBuffer, totalFiles, errors } = await buildExcelZipForClients(formattedClients);

    if (totalFiles === 0) {
      return NextResponse.json(
        { error: "No Excel files could be generated", errors },
        { status: 500 }
      );
    }

    const label = icodeFilter ?? "all_clients";
    const date  = new Date().toISOString().slice(0, 10);

    return new Response(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="portfolio_excels_${label}_${date}.zip"`,
        "X-Files-Generated": String(totalFiles),
      },
    });
  } catch (err) {
    console.error("Admin download-all-excels error:", err);
    return NextResponse.json({ error: "Failed to generate portfolio Excels" }, { status: 500 });
  }
}
