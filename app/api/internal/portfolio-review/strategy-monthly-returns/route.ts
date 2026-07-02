import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import { computeStrategyMonthlyReturns } from "@/app/lib/internal-utils";

export async function GET() {
  const { error } = await requireInternal();
  if (error) return error;

  const data = await computeStrategyMonthlyReturns();
  return NextResponse.json(data);
}
