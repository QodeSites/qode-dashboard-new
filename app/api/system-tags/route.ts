import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getUserQcodes } from "@/app/lib/portfolio-utils";
import { getEffectiveIcode } from "@/app/lib/admin-utils";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const icode = getEffectiveIcode(session);
    if (!icode) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const qcode = searchParams.get("qcode");

    if (!qcode) {
      return NextResponse.json({ error: "qcode parameter is required" }, { status: 400 });
    }

    // Validate user has access to this qcode
    const userQcodes = await getUserQcodes(icode);
    const hasAccess = userQcodes.some((acc) => acc.qcode === qcode);
    if (!hasAccess) {
      return NextResponse.json({ error: "Unauthorized access to this account" }, { status: 403 });
    }

    // Fetch distinct system tags for this qcode (read-only query)
    const records = await prisma.master_sheet.findMany({
      where: { qcode },
      select: { system_tag: true },
      distinct: ["system_tag"],
    });

    const tags = records
      .map((r) => r.system_tag)
      .filter((tag): tag is string => tag !== null && tag !== undefined && tag.trim() !== "")
      .sort();

    return NextResponse.json({ tags });
  } catch (error) {
    console.error("Error fetching system tags:", error);
    return NextResponse.json({ error: "Failed to fetch system tags" }, { status: 500 });
  }
}
