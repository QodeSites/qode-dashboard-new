import { NextResponse } from "next/server";
import { requireDistributor } from "@/app/lib/admin-utils";
import {
  getQyeStats,
  getQawStats,
  getQyePlusStats,
  type DistributorStrategy,
} from "@/app/lib/distributor-utils";

const VALID_STRATEGIES = new Set<string>(["qye", "qaw", "qyeplus"]);

export async function GET(request: Request) {
  const { error } = await requireDistributor();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const strategyParam = searchParams.get("strategy");

  if (!strategyParam || !VALID_STRATEGIES.has(strategyParam)) {
    return NextResponse.json(
      { error: "Invalid or missing strategy. Expected 'qye', 'qaw', or 'qyeplus'." },
      { status: 400 }
    );
  }

  const strategy = strategyParam as DistributorStrategy;

  try {
    const handlers: Record<DistributorStrategy, () => ReturnType<typeof getQyeStats>> = {
      qye: getQyeStats,
      qaw: getQawStats,
      qyeplus: getQyePlusStats,
    };
    const response = await handlers[strategy]();
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
