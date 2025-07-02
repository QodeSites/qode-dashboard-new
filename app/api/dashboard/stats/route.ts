import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { getUserQcodes, calculatePortfolioMetrics, formatPortfolioStats } from "@/app/lib/portfolio-utils";

export async function GET() {
  try {
    // Authenticate user
    const session = await getServerSession(authOptions);
    if (!session?.user?.icode) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const icode = session.user.icode;

    // Fetch qcodes
    const qcodes = await getUserQcodes(icode);
    if (qcodes.length === 0) {
      return NextResponse.json({ error: "No accounts found for this user" }, { status: 404 });
    }

    // Calculate metrics
    const metrics = await calculatePortfolioMetrics(qcodes);

    // Format stats
    const stats = formatPortfolioStats(metrics, qcodes.length);

    return NextResponse.json(stats);
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard stats" }, { status: 500 });
  }
}