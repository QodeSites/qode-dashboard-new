import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    // Authenticate user
    const session = await getServerSession(authOptions);
    if (!session?.user?.icode) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const qcode = searchParams.get("qcode");

    if (!qcode) {
      return NextResponse.json({ error: "qcode parameter is required" }, { status: 400 });
    }

    // Fetch distinct mastersheet tags for this qcode
    const tags = await prisma.master_sheet.findMany({
      where: {
        qcode,
        system_tag: { not: null }
      },
      select: { system_tag: true },
      distinct: ['system_tag'],
      orderBy: { system_tag: 'asc' }
    });

    const tagList = tags
      .map(t => t.system_tag)
      .filter((tag): tag is string => tag !== null);

    return NextResponse.json(tagList);
  } catch (error) {
    console.error("Error fetching tags:", error);
    return NextResponse.json({ error: "Failed to fetch tags" }, { status: 500 });
  }
}
