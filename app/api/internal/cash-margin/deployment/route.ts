import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import { computeDeploy } from "@/app/lib/internal-utils";

export async function POST(req: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  const body = await req.json();
  if (!body.strategy) {
    return NextResponse.json(
      { error: "strategy is required" },
      { status: 400 },
    );
  }

  try {
    const result = await computeDeploy({
      strategy: body.strategy,
      ratio_type: body.ratio_type,
      account_value: body.account_value,
      reference_qcode: body.reference_qcode,
      input_mode: body.input_mode,
      value: body.value,
      equity_pct: body.equity_pct,
      cash_pct: body.cash_pct,
      lc_pct: body.lc_pct,
    });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
