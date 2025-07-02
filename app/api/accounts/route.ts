import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Authenticate user
    const session = await getServerSession(authOptions);
    if (!session?.user?.icode) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const icode = session.user.icode;

    // Fetch accounts where the user has access
    const accounts = await prisma.accounts.findMany({
      where: {
        OR: [
          { pooled_account_users: { some: { icode } } },
          { pooled_account_allocations: { some: { icode } } },
        ],
      },
      select: {
        qcode: true,
        account_name: true,
        account_type: true,
        broker: true,
      },
    });

    if (accounts.length === 0) {
      return NextResponse.json({ error: "No accounts found for this user" }, { status: 404 });
    }

    return NextResponse.json(accounts);
  } catch (error) {
    console.error("Error fetching accounts:", error);
    return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 });
  }
}