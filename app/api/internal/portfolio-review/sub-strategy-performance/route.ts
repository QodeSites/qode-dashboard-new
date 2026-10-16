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
  let body: { start_date?: string; end_date?: string; account_type?: string } = {};
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
  if (
    body.account_type !== undefined &&
    body.account_type !== "managed" &&
    body.account_type !== "prop"
  ) {
    return NextResponse.json(
      { error: "account_type must be 'managed' or 'prop'" },
      { status: 400 },
    );
  }

  const data = await computeSubStrategyPerformance(
    end,
    start,
    body.account_type === "prop" ? "prop" : "managed",
  );
  return NextResponse.json(data);
}
