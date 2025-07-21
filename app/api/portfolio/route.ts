import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getUserQcodes, calculatePortfolioMetrics, formatPortfolioStats } from "@/app/lib/portfolio-utils";

// Interface for Stats (updated to include strategyName)
interface Stats {
  amountDeposited: string;
  currentExposure: string;
  return: string;
  totalProfit: string;
  trailingReturns: {
    fiveDays: string;
    tenDays: string;
    fifteenDays: string;
    oneMonth: string;
    threeMonths: string;
    sixMonths: string;
    oneYear: string;
    twoYears: string;
    fiveYears: string;
    sinceInception: string;
    MDD: string;
    currentDD: string;
  };
  drawdown: string;
  equityCurve: { date: string; value: number }[];
  drawdownCurve: { date: string; value: number }[];
  quarterlyPnl: {
    [year: string]: {
      percent: { q1: string; q2: string; q3: string; q4: string; total: string };
      cash: { q1: string; q2: string; q3: string; q4: string; total: string };
      yearCash: string;
    };
  };
  monthlyPnl: {
    [year: string]: {
      months: { [month: string]: { percent: string; cash: string; capitalInOut: string } };
      totalPercent: number;
      totalCash: number;
      totalCapitalInOut: number;
    };
  };
  cashFlows: { date: string; amount: number }[];
  strategyName: string; // Added strategyName
}

// Function to extract inception date and data as of date from equityCurve
function getEquityCurveDates(equityCurve: { date: string; value: number }[]): {
  inceptionDate: string | null;
  dataAsOfDate: string | null;
} {
  // Check if equityCurve is empty
  if (!equityCurve || equityCurve.length === 0) {
    return {
      inceptionDate: null,
      dataAsOfDate: null,
    };
  }

  // Sort equityCurve by date to ensure correct order
  const sortedEquityCurve = equityCurve.sort((a, b) => a.date.localeCompare(b.date));

  // Inception date is the date of the first entry
  const inceptionDate = sortedEquityCurve[0].date;

  // Data as of date is the date of the last entry
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
    const accountType = searchParams.get("accountType");
    const broker = searchParams.get("broker");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    // Fetch qcodes with filters
    let qcodes = await getUserQcodes(icode);
    if (accountType) {
      qcodes = qcodes.filter(account => account.account_type === accountType);
    }
    if (broker) {
      qcodes = qcodes.filter(account => account.broker === broker);
    }

    if (qcodes.length === 0) {
      return NextResponse.json({ error: "No accounts found for this user" }, { status: 404 });
    }

    // Calculate metrics
    const metrics = await calculatePortfolioMetrics(qcodes);
    if (!metrics) {
      return NextResponse.json({ error: "Failed to calculate portfolio metrics" }, { status: 500 });
    }

    // Get inception and data as of dates before applying date filters
    const { inceptionDate, dataAsOfDate } = getEquityCurveDates(metrics.equityCurve);

    // Apply date range filter (optional)
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      metrics.equityCurve = metrics.equityCurve.filter((point: { date: string }) => {
        const pointDate = new Date(point.date);
        return pointDate >= start && pointDate <= end;
      });
      metrics.drawdownCurve = metrics.drawdownCurve.filter((point: { date: string }) => {
        const pointDate = new Date(point.date);
        return pointDate >= start && pointDate <= end;
      });
      metrics.cashFlows = metrics.cashFlows.filter((tx: { date: string }) => {
        const txDate = new Date(tx.date);
        return txDate >= start && txDate <= end;
      });
    }

    // Format stats
    const stats = formatPortfolioStats(metrics);

    // Add metadata
    const response = {
      data: stats,
      metadata: {
        icode,
        accountCount: qcodes.length,
        lastUpdated: new Date().toISOString(),
        filtersApplied: { accountType, broker, startDate, endDate },
        inceptionDate, // Add inception date
        dataAsOfDate,  // Add data as of date
        strategyName: metrics.strategyName || "Unknown Strategy", // Include strategyName from metrics
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching portfolio data:", error);
    return NextResponse.json({ error: "Failed to fetch portfolio data" }, { status: 500 });
  }
}