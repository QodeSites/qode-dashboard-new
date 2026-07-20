import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/app/lib/admin-utils";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const rows = await prisma.dashboard_visibility.findMany({
    select: { icode: true, dashboard_visible: true },
  });

  const visibilityMap: Record<string, boolean> = {};
  for (const row of rows) {
    visibilityMap[row.icode] = row.dashboard_visible;
  }

  return NextResponse.json({ visibility: visibilityMap });
}

const VISIBILITY_PASSWORD = process.env.DASHBOARD_VISIBILITY_PASSWORD;

export async function POST(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await request.json();
  const { icode, dashboard_visible, password } = body;

  if (!icode || typeof dashboard_visible !== "boolean") {
    return NextResponse.json({ error: "icode and dashboard_visible are required" }, { status: 400 });
  }

  if (!password || password !== VISIBILITY_PASSWORD) {
    return NextResponse.json({ error: "Invalid password" }, { status: 403 });
  }

  await prisma.dashboard_visibility.upsert({
    where: { icode },
    update: { dashboard_visible, updated_at: new Date() },
    create: { icode, dashboard_visible },
  });

  return NextResponse.json({ success: true, icode, dashboard_visible });
}
