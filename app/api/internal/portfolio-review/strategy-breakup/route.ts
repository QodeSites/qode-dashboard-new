import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import {
  computeStrategyBreakup,
  resolveRiskFreeRate,
} from "@/app/lib/internal-utils";

export async function POST(req: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  // body is fully optional — an empty/absent body just means "use global_config"
  let body: { risk_free_rate?: number } = {};
  try {
    body = await req.json();
  } catch {
    // no body sent — fine, risk_free_rate is optional
  }

  const rfr = await resolveRiskFreeRate(body.risk_free_rate);
  if (rfr == null) {
    return NextResponse.json(
      { error: "RISK_FREE_RATE is not configured in global_config" },
      { status: 503 },
    );
  }

  const data = await computeStrategyBreakup(rfr);
  return NextResponse.json(data);
}
