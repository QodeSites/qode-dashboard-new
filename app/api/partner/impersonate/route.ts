import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePartner, partnerCanAccessIcode } from "@/app/lib/admin-utils";

export async function POST(request: Request) {
  const { error, session } = await requirePartner();
  if (error) return error;

  const { icode } = await request.json();

  if (!icode) {
    return NextResponse.json({ error: "icode is required" }, { status: 400 });
  }

  // Enforce the partner book: a partner may only impersonate their own clients.
  const allowed = await partnerCanAccessIcode(session!.user.partnerId, icode);
  if (!allowed) {
    return NextResponse.json(
      { error: "Client not in your book" },
      { status: 403 },
    );
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
