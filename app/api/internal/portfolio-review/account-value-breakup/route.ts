import { NextResponse } from "next/server";
import {
  computeAccountValueBreakup,
  type SplitOverride,
} from "@/app/lib/internal-utils";
import { requireInternal } from "@/app/lib/admin-utils";

export async function POST(req: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  let body: { override?: SplitOverride } = {};
  try {
    body = await req.json();
  } catch {
    // no body sent — fine, override is optional
  }

  try {
    const data = await computeAccountValueBreakup(body.override);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid override" },
      { status: 400 },
    );
  }
}
