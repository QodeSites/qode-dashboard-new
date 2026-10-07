// Machine-to-machine variant of /api/bifurcated-portfolio, for qap-backend.
// Auth: shared secret via the "x-api-key" header, compared against the
// QAP_BACKEND_API_KEY env var. Fails closed (503) when the env var is not
// configured. Not session-based on purpose — the caller is a backend
// service, not a browser (mirrors app/api/zoho/aum-snapshot/route.ts).
//
// Reuses the existing engine untouched — no business logic duplicated here.
// The qcode is not validated against a session/icode owner, since the
// caller (qap-backend) already established which user is asking and that
// the qcode belongs to them.
//
// Usage:
//   GET /api/service/bifurcated-portfolio?qcode=QAC00040

import { NextResponse } from "next/server";
import { findByQcode } from "@/app/lib/bifurcated-clients-registry";
import { getEngineForQcode } from "@/app/lib/bifurcated-portfolio-utils";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const expectedKey = process.env.QAP_BACKEND_API_KEY;
  if (!expectedKey) {
    return NextResponse.json(
      { error: "Service endpoint not configured" },
      { status: 503 }
    );
  }

  const providedKey = req.headers.get("x-api-key");
  if (providedKey !== expectedKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const qcode = url.searchParams.get("qcode");
  if (!qcode) {
    return NextResponse.json({ error: "Missing qcode" }, { status: 400 });
  }

  if (!findByQcode(qcode)) {
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }

  const engine = getEngineForQcode(qcode);
  if (!engine) {
    return NextResponse.json(
      { error: "Engine not found for qcode" },
      { status: 500 }
    );
  }

  return engine.handleGET(req);
}
