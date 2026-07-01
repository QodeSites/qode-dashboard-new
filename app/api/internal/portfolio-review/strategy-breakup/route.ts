import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireInternal } from "@/app/lib/admin-utils";
import { computeStrategyBreakup } from "@/app/lib/internal-utils";

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

  // Resolve risk-free rate: payload → global_config (no hardcoded fallback)
  let rfr = body.risk_free_rate ?? null;
  if (rfr == null) {
    const cfg = await prisma.global_config.findUnique({
      where: { key: "RISK_FREE_RATE" },
    });
    if (!cfg) {
      return NextResponse.json(
        { error: "RISK_FREE_RATE is not configured in global_config" },
        { status: 503 },
      );
    }
    rfr = parseFloat(cfg.value);
  }

  const data = await computeStrategyBreakup(rfr);
  return NextResponse.json(data);
}
