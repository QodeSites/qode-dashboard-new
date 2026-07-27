import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import {
  computeStrategyBreakup,
  parseOptionalDate,
  resolveRiskFreeRate,
} from "@/app/lib/internal-utils";

export async function POST(req: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  // body is fully optional — an empty/absent body just means "use global_config"
  let body: {
    risk_free_rate?: number;
    start_date?: string;
    end_date?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    // no body sent — fine, every field is optional
  }

  const rfr = await resolveRiskFreeRate(body.risk_free_rate);
  if (rfr == null) {
    return NextResponse.json(
      { error: "RISK_FREE_RATE is not configured in global_config" },
      { status: 503 },
    );
  }

  const end = parseOptionalDate(body.end_date);
  if (end === null) {
    return NextResponse.json({ error: "end_date is invalid" }, { status: 400 });
  }
  const start = parseOptionalDate(body.start_date);
  if (start === null) {
    return NextResponse.json(
      { error: "start_date is invalid" },
      { status: 400 },
    );
  }

  const data = await computeStrategyBreakup(rfr, end, start);
  return NextResponse.json(data);
}
