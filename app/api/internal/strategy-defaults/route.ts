import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireInternal } from "@/app/lib/admin-utils";

export async function GET() {
  const { error } = await requireInternal();
  if (error) return error;

  const rows = await prisma.strategy_defaults.findMany({
    orderBy: { strategy_name: "asc" },
  });
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  const body = await req.json();
  if (!body.strategy_name) {
    return NextResponse.json(
      { error: "strategy_name is required" },
      { status: 400 },
    );
  }

  const created = await prisma.strategy_defaults.create({ data: body });
  return NextResponse.json(created, { status: 201 });
}

export async function PATCH(req: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  const { strategy_name, ...data } = await req.json();
  if (!strategy_name) {
    return NextResponse.json(
      { error: "strategy_name is required" },
      { status: 400 },
    );
  }

  const { updated_at: _u, ...rest } = data;
  const updated = await prisma.strategy_defaults.update({
    where: { strategy_name },
    data: rest,
  });
  return NextResponse.json(updated);
}

export async function DELETE(req: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  const { strategy_name } = await req.json();
  if (!strategy_name) {
    return NextResponse.json(
      { error: "strategy_name is required" },
      { status: 400 },
    );
  }

  await prisma.strategy_defaults.delete({ where: { strategy_name } });
  return NextResponse.json({ deleted: strategy_name });
}
