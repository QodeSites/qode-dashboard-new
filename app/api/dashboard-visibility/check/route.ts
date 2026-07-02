import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const icode = searchParams.get("icode");

  if (!icode) {
    return NextResponse.json({ dashboard_visible: true });
  }

  const row = await prisma.dashboard_visibility.findUnique({
    where: { icode },
    select: { dashboard_visible: true },
  });

  return NextResponse.json({ dashboard_visible: row ? row.dashboard_visible : true });
}
