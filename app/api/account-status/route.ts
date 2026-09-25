import { NextResponse } from "next/server";
import { authorizeHoldingsRequest } from "@/app/lib/bifurcated-auth";
import { getClosedStrategies } from "@/app/lib/account-status";

export const dynamic = "force-dynamic";

// Closed strategies for one account the caller owns (impersonation-aware).
// Lookup failures already fail open inside getClosedStrategies (empty list).
export async function GET(req: Request) {
  const auth = await authorizeHoldingsRequest(req);
  if (!auth.ok) return auth.response;
  const closed = await getClosedStrategies(auth.qcode);
  return NextResponse.json({ closedStrategies: closed.map((c) => c.strategy) });
}
