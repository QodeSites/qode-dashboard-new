import { NextResponse } from "next/server";
import { requireDistributor } from "@/app/lib/admin-utils";
import {
  getQyeStats,
  getQawStats,
  type DistributorStrategy,
} from "@/app/lib/distributor-utils";

export async function GET(request: Request) {
  const { error } = await requireDistributor();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const strategyParam = searchParams.get("strategy");

  if (strategyParam !== "qye" && strategyParam !== "qaw") {
    return NextResponse.json(
      { error: "Invalid or missing strategy. Expected 'qye' or 'qaw'." },
      { status: 400 }
    );
  }

  const strategy: DistributorStrategy = strategyParam;

  try {
    const response =
      strategy === "qye" ? await getQyeStats() : await getQawStats();
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // QAW++ branch currently throws "not yet implemented" — surface that to
    // the client cleanly so the view page can display a coming-soon state
    // instead of a generic 500.
    if (message.includes("not yet implemented")) {
      return NextResponse.json(
        { error: message, code: "NOT_IMPLEMENTED" },
        { status: 501 }
      );
    }
    console.error(`Distributor portfolio error (strategy=${strategy}):`, err);
    return NextResponse.json(
      { error: "Failed to fetch distributor portfolio data" },
      { status: 500 }
    );
  }
}
