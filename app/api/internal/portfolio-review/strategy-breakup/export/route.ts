import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import {
  computeStrategyBreakup,
  resolveRiskFreeRate,
} from "@/app/lib/internal-utils";
import { buildStrategyBreakupWorkbook } from "@/app/lib/excel-utils";

export async function POST(req: Request) {
  const { error } = await requireInternal();
  if (error) return error;

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

  const rows = await computeStrategyBreakup(rfr);
  const buffer = await buildStrategyBreakupWorkbook(rows).xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="strategy-wise-client-breakup.xlsx"',
    },
  });
}
