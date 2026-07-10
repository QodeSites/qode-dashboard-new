import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePartner,
  getPartnerBookIcodes,
  partnerCanAccessIcode,
} from "@/app/lib/admin-utils";
import { buildExcelZipForClients } from "@/app/lib/excel-export-utils";

/**
 * GET /api/partner/download-all-excels
 * GET /api/partner/download-all-excels?icode=QUS0007   ← single client (must be in book)
 *
 * Partner-only. Returns a .zip containing one .xlsx per strategy per client,
 * restricted to the authenticated partner's book (partner_clients).
 */
export async function GET(request: Request) {
  const { error, session } = await requirePartner();
  if (error) return error;

  const partnerId = parseInt(session!.user.partnerId ?? "", 10);
  if (!partnerId || Number.isNaN(partnerId)) {
    return NextResponse.json({ error: "Partner not resolved" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const icodeFilter = searchParams.get("icode");

  if (icodeFilter) {
    const allowed = await partnerCanAccessIcode(partnerId, icodeFilter);
    if (!allowed) {
      return NextResponse.json(
        { error: "Client is not in your book" },
        { status: 403 }
      );
    }
  }

  try {
    const bookIcodes = icodeFilter
      ? [icodeFilter]
      : await getPartnerBookIcodes(partnerId);

    if (bookIcodes.length === 0) {
      return NextResponse.json(
        { error: "No clients in your book" },
        { status: 404 }
      );
    }

    const clients = await prisma.clients.findMany({
      where: { icode: { in: bookIcodes }, pooled_account_users: { some: {} } },
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

    const label = icodeFilter ?? "partner_book";
    const date  = new Date().toISOString().slice(0, 10);

    return new Response(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="portfolio_excels_${label}_${date}.zip"`,
        "X-Files-Generated": String(totalFiles),
      },
    });
  } catch (err) {
    console.error("Partner download-all-excels error:", err);
    return NextResponse.json({ error: "Failed to generate portfolio Excels" }, { status: 500 });
  }
}
