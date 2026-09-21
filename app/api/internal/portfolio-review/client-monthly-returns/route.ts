import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import { computeClientMonthlyReturns } from "@/app/lib/internal-utils";

export async function POST(req: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  let body: { account_type?: string } = {};
  try {
    body = await req.json();
  } catch {
    // no body sent — fine, account_type is optional
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

  const data = await computeClientMonthlyReturns(
    body.account_type === "prop" ? "prop" : "managed",
  );
  return NextResponse.json(data);
}
