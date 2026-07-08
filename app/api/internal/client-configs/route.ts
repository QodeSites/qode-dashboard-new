import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireInternal } from "@/app/lib/admin-utils";

export async function GET(req: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  const params = new URL(req.url).searchParams;
  const qcode = params.get("qcode");
  const activeOnly = params.get("active") === "true";

  const configs = await prisma.client_strategy_configs.findMany({
    where: {
      ...(qcode ? { qcode } : {}),
      ...(activeOnly
        ? {
            OR: [{ effective_to: null }, { effective_to: { gte: new Date() } }],
          }
        : {}),
    },
    orderBy: [{ qcode: "asc" }, { effective_from: "asc" }],
  });
  return NextResponse.json(configs);
}

export async function POST(req: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  const body = await req.json();
  const created = await prisma.client_strategy_configs.create({
    data: {
      ...body,
      effective_from: new Date(body.effective_from),
      effective_to: body.effective_to ? new Date(body.effective_to) : null,
    },
  });
  return NextResponse.json(created, { status: 201 });
}

export async function PATCH(req: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  const { id, ...rest } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { created_at: _c, updated_at: _u, accounts: _a, ...data } = rest;
  const updated = await prisma.client_strategy_configs.update({
    where: { id: parseInt(id) },
    data: {
      ...data,
      ...(data.effective_from
        ? { effective_from: new Date(data.effective_from) }
        : {}),
      ...(data.effective_to !== undefined
        ? {
            effective_to: data.effective_to
              ? new Date(data.effective_to)
              : null,
          }
        : {}),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(req: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await prisma.client_strategy_configs.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ deleted: parseInt(id) });
}
