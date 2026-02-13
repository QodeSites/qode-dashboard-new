import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/app/lib/admin-utils";

export async function POST(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { icode } = await request.json();

  if (!icode) {
    return NextResponse.json({ error: "icode is required" }, { status: 400 });
  }

  // Look up the client (READ-ONLY)
  const client = await prisma.clients.findFirst({
    where: { icode },
    select: {
      icode: true,
      user_name: true,
      email: true,
    },
  });

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  return NextResponse.json({
    icode: client.icode,
    name: client.user_name,
    email: client.email,
  });
}
