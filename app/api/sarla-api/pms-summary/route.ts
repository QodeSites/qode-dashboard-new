import { NextRequest, NextResponse } from "next/server";
import { PortfolioApi } from "@/app/lib/sarla-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/sarla-api/pms-summary?qcode=QAC00041
 *
 * Lightweight sibling of /api/sarla-api: that route computes the FULL
 * PortfolioResponse (trailing returns, drawdown/equity curves, monthly +
 * quarterly P&L) for every scheme on the account just so callers can pull
 * one scheme's currentExposure/totalProfit out of it. This route calls
 * PortfolioApi.getPmsSummary() directly — one query, no unused computation —
 * and returns the same response shape (`json["Scheme PMS QAW"].data.*`) so
 * existing callers can just swap the URL, no parsing changes needed.
 */
export async function GET(req: NextRequest) {
  const qcode = new URL(req.url).searchParams.get("qcode") || "QAC00041";

  try {
    const { currentExposure, totalProfit } = await PortfolioApi.getPmsSummary(qcode);
    return NextResponse.json(
      {
        "Scheme PMS QAW": {
          data: {
            currentExposure: currentExposure.toFixed(2),
            totalProfit: totalProfit.toFixed(2),
          },
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("sarla-api/pms-summary error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
