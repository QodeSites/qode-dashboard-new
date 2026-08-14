import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/app/lib/admin-utils";
import { isPageKey } from "@/app/lib/page-visibility";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const rows = await prisma.dashboard_visibility.findMany({
    select: { icode: true, page: true, dashboard_visible: true },
  });

  // { [icode]: { [page]: visible } }
  const visibilityMap: Record<string, Record<string, boolean>> = {};
  for (const row of rows) {
    visibilityMap[row.icode] ??= {};
    visibilityMap[row.icode][row.page] = row.dashboard_visible;
  }

  return NextResponse.json({ visibility: visibilityMap });
}

const VISIBILITY_PASSWORD = process.env.DASHBOARD_VISIBILITY_PASSWORD;

export async function POST(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await request.json();
  const { icode, icodes, page, dashboard_visible, password } = body;

  // Accepts either a single `icode` (existing per-row toggle) or an
  // `icodes` array (bulk apply from the select-all UI) — same shape
  // otherwise, so one endpoint covers both.
  const targetIcodes: string[] = Array.isArray(icodes)
    ? icodes.filter((i): i is string => typeof i === "string")
    : typeof icode === "string"
      ? [icode]
      : [];

  if (targetIcodes.length === 0 || !page || !isPageKey(page) || typeof dashboard_visible !== "boolean") {
    return NextResponse.json(
      { error: "icode(s), a valid page, and dashboard_visible are required" },
      { status: 400 },
    );
  }

  if (!password || password !== VISIBILITY_PASSWORD) {
    return NextResponse.json({ error: "Invalid password" }, { status: 403 });
  }

  await prisma.$transaction(
    targetIcodes.map((ic) =>
      prisma.dashboard_visibility.upsert({
        where: { icode_page: { icode: ic, page } },
        update: { dashboard_visible, updated_at: new Date() },
        create: { icode: ic, page, dashboard_visible },
      }),
    ),
  );

  return NextResponse.json({ success: true, icodes: targetIcodes, page, dashboard_visible });
}
