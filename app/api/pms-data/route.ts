import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getPmsData } from "@/app/lib/pms-utils";

export async function GET(request: Request) {
  try {
    // Authenticate user
    const session = await getServerSession(authOptions);
    if (!session?.user?.icode) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const icode = session.user.icode;

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const qcode = searchParams.get("qcode");
    const viewType = searchParams.get("view_type") || "individual";
    const period = searchParams.get("period");
    const dataAsOf = searchParams.get("data_as_of");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");


    // Fetch PMS data
    const pmsData = await getPmsData(
      icode,
      qcode,
      viewType,
      period,
      dataAsOf,
      startDate,
      endDate
    );

    if (pmsData.equityCurve.length === 0) {
      console.log(`No PMS data found: equityCurve is empty for icode=${icode}, qcode=${qcode || 'none'}`);
      return NextResponse.json({ error: "No PMS data found for this user" }, { status: 404 });
    }

    return NextResponse.json(pmsData);
  } catch (error: any) {
    console.error("Error fetching PMS data:", {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
    return NextResponse.json(
      {
        error: "Failed to fetch PMS data",
        message: error.message || "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}