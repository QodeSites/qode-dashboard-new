import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import { computeCashMarginWithdrawal } from "@/app/lib/internal-utils";

export async function POST(req: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  const body = await req.json();
  if (!body.qcode) {
    return NextResponse.json({ error: "qcode is required" }, { status: 400 });
  }

  try {
    const result = await computeCashMarginWithdrawal({
      qcode: body.qcode,
      strategy: body.strategy,
      source: body.source,
      total_profits: body.total_profits,
      amount: body.amount,
      ratio_type: body.ratio_type,
      equity_pct: body.equity_pct,
      cash_pct: body.cash_pct,
      lc_pct: body.lc_pct,
    });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
