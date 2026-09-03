import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import {
  computeSubStrategyPerformance,
  parseOptionalDate,
} from "@/app/lib/internal-utils";

export async function POST(req: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  // body is fully optional — an empty/absent body just means "full history"
  let body: { start_date?: string; end_date?: string } = {};
  try {
    body = await req.json();
  } catch {
    // no body sent — fine, both fields are optional
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

  const data = await computeSubStrategyPerformance(end, start);
  return NextResponse.json(data);
}
