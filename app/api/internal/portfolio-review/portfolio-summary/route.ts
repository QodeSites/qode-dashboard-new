import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import { computePortfolioSummary } from "@/app/lib/internal-utils";

export async function GET() {
  const { error } = await requireInternal();
  if (error) return error;

  const data = await computePortfolioSummary();
  return NextResponse.json(data);
}
