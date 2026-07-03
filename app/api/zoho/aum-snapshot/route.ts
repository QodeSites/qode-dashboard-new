// Machine-to-machine endpoint for the Zoho AUM sync cron.
// Returns Current AUM + Invested Amount for every investor icode, computed
// server-side by app/lib/zoho-aum-snapshot.ts (self-contained, read-only).
//
// Auth: shared secret via the "x-api-key" header, compared against the
// AUM_SNAPSHOT_API_KEY env var. Fails closed (503) when the env var is not
// configured. Not session-based on purpose — the caller is a cron, not a
// browser.
//
// Usage:
//   GET /api/zoho/aum-snapshot                 -> all investors
//   GET /api/zoho/aum-snapshot?icode=QUS00125  -> single investor (testing)

import { NextResponse } from "next/server";
import { buildAumSnapshot } from "@/app/lib/zoho-aum-snapshot";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const expectedKey = process.env.AUM_SNAPSHOT_API_KEY;
  if (!expectedKey) {
    return NextResponse.json(
      { error: "AUM snapshot endpoint not configured" },
      { status: 503 }
    );
  }

  const providedKey = req.headers.get("x-api-key");
  if (providedKey !== expectedKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const icode = url.searchParams.get("icode") || undefined;

  try {
    const snapshot = await buildAumSnapshot(icode);
    return NextResponse.json(snapshot);
  } catch (err) {
    console.error("aum-snapshot failed:", err);
    return NextResponse.json(
      { error: "Failed to build AUM snapshot" },
      { status: 500 }
    );
  }
}
