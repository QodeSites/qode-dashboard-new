import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { 
  getPropQcodes, 
  getUniquePropSystemTags, 
  calculatePropPortfolioMetrics,
  SystemTag,
  PropStats
} from "./prop-utils";

// Function to extract inception date and data as of date from equityCurve
function getEquityCurveDates(equityCurve: { date: string; value: number }[]): {
  inceptionDate: string | null;
  dataAsOfDate: string | null;
} {
  if (!equityCurve || equityCurve.length === 0) {
    return {
      inceptionDate: null,
      dataAsOfDate: null,
    };
  }

  const sortedEquityCurve = equityCurve.sort((a, b) => a.date.localeCompare(b.date));
  const inceptionDate = sortedEquityCurve[0].date;
  const dataAsOfDate = sortedEquityCurve[sortedEquityCurve.length - 1].date;

  return {
    inceptionDate,
    dataAsOfDate,
  };
}

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
    const depositTag = searchParams.get("depositTag");
    const navTag = searchParams.get("navTag");
    const cashflowTag = searchParams.get("cashflowTag"); // New parameter
    const tagsOnly = searchParams.get("tagsOnly") === "true";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    // Fetch prop account qcodes
    const qcodes = await getPropQcodes(icode);

    if (qcodes.length === 0) {
      return NextResponse.json({ error: "No prop accounts found for this user" }, { status: 404 });
    }

    const qcodeList = qcodes.map(q => q.qcode);

    // If tagsOnly flag is set, return only available tags
    if (tagsOnly) {
      const systemTags = await getUniquePropSystemTags(qcodeList);
      
      return NextResponse.json({
        tags: systemTags,
        metadata: {
          icode,
          accountCount: qcodes.length,
          totalTags: systemTags.length,
        },
      });
    }

    // Both depositTag and navTag are required for fetching portfolio data
    if (!depositTag || !navTag) {
      return NextResponse.json({ 
        error: "Both depositTag and navTag are required for prop accounts",
        requiresTags: true,
        message: "Please provide both depositTag and navTag parameters, or use tagsOnly=true to fetch available tags"
      }, { status: 400 });
    }

    // Combine tags in the required format: "depositTag|navTag|cashflowTag"
    const combinedTags = cashflowTag 
      ? `${depositTag}|${navTag}|${cashflowTag}`
      : `${depositTag}|${navTag}`;

    // Calculate metrics with the combined tags
    const metrics = await calculatePropPortfolioMetrics(qcodes, combinedTags);
    
    if (!metrics) {
      return NextResponse.json({ error: "Failed to calculate prop portfolio metrics" }, { status: 500 });
    }

    // Get inception and data as of dates
    const { inceptionDate, dataAsOfDate } = getEquityCurveDates(metrics.equityCurve);

    // Apply date range filter (optional)
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      metrics.equityCurve = metrics.equityCurve.filter((point) => {
        const pointDate = new Date(point.date);
        return pointDate >= start && pointDate <= end;
      });
      
      metrics.drawdownCurve = metrics.drawdownCurve.filter((point) => {
        const pointDate = new Date(point.date);
        return pointDate >= start && pointDate <= end;
      });
      
      metrics.cashFlows = metrics.cashFlows.filter((tx) => {
        const txDate = new Date(tx.date);
        return txDate >= start && txDate <= end;
      });
    }

    // Add metadata
    const response = {
      data: metrics,
      metadata: {
        icode,
        accountCount: qcodes.length,
        lastUpdated: new Date().toISOString(),
        filtersApplied: { 
          depositTag, 
          navTag,
          cashflowTag: cashflowTag || null,
          startDate, 
          endDate 
        },
        inceptionDate,
        dataAsOfDate,
        strategyName: metrics.strategyName,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching prop portfolio data:", error);
    
    // Check if it's a tag parsing error
    if (error instanceof Error && error.message.includes("tags")) {
      return NextResponse.json({ 
        error: error.message,
        requiresTags: true 
      }, { status: 400 });
    }
    
    return NextResponse.json({ error: "Failed to fetch prop portfolio data" }, { status: 500 });
  }
}