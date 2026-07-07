import { NextResponse } from "next/server";
import {
  computeCompare,
  type CompareSelection,
} from "@/app/lib/internal-utils";
import { requireInternal } from "@/app/lib/admin-utils";

export async function POST(req: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  let body: { selections?: CompareSelection[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.selections || body.selections.length === 0) {
    return NextResponse.json(
      { error: "selections is required" },
      { status: 400 },
    );
  }

  const data = await computeCompare(body.selections);
  return NextResponse.json(data);
}
