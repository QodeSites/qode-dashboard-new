import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePartner,
  getPartnerBookIcodes,
  partnerCanAccessIcode,
} from "@/app/lib/admin-utils";

export async function GET() {
  const { error, session } = await requirePartner();
  if (error) return error;

  const partnerId = parseInt(session!.user.partnerId ?? "", 10);
  if (!partnerId || Number.isNaN(partnerId)) {
    return NextResponse.json({ visibility: {} });
  }

  const bookIcodes = await getPartnerBookIcodes(partnerId);
  if (bookIcodes.length === 0) {
    return NextResponse.json({ visibility: {} });
  }

  const rows = await prisma.dashboard_visibility.findMany({
    where: { icode: { in: bookIcodes } },
    select: { icode: true, dashboard_visible: true },
  });

  const visibilityMap: Record<string, boolean> = {};
  for (const row of rows) {
    visibilityMap[row.icode] = row.dashboard_visible;
  }

  return NextResponse.json({ visibility: visibilityMap });
}

export async function POST(request: Request) {
  const { error, session } = await requirePartner();
  if (error) return error;

  const partnerId = parseInt(session!.user.partnerId ?? "", 10);
  if (!partnerId || Number.isNaN(partnerId)) {
    return NextResponse.json({ error: "Partner not resolved" }, { status: 403 });
  }

  const body = await request.json();
  const { icode, dashboard_visible } = body;

  if (!icode || typeof dashboard_visible !== "boolean") {
    return NextResponse.json(
      { error: "icode and dashboard_visible are required" },
      { status: 400 }
    );
  }

  const allowed = await partnerCanAccessIcode(partnerId, icode);
  if (!allowed) {
    return NextResponse.json(
      { error: "Client is not in your book" },
      { status: 403 }
    );
  }

  await prisma.dashboard_visibility.upsert({
    where: { icode },
    update: { dashboard_visible, updated_at: new Date() },
    create: { icode, dashboard_visible },
  });

  return NextResponse.json({ success: true, icode, dashboard_visible });
}
