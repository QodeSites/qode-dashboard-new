import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireInternal } from "@/app/lib/admin-utils";

export async function GET() {
  const { error } = await requireInternal();
  if (error) return error;

  const rows = await prisma.global_config.findMany({
    orderBy: { key: "asc" },
  });
  return NextResponse.json(rows);
}

export async function PUT(req: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  const { key, value, updated_by } = await req.json();
  if (!key) {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }
  if (value === undefined) {
    return NextResponse.json({ error: "value is required" }, { status: 400 });
  }

  const updated = await prisma.global_config.update({
    where: { key },
    data: { value: String(value), updated_by: updated_by ?? null },
  });
  return NextResponse.json(updated);
}
