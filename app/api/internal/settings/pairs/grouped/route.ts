import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import { fetchClientStrategyPairsGrouped } from "@/app/lib/internal-utils";

export async function GET() {
  const { error } = await requireInternal();
  if (error) return error;

  try {
    const result = await fetchClientStrategyPairsGrouped();
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
