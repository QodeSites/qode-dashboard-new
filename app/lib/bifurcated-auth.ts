import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getEffectiveIcodeChecked } from "./admin-utils";
import { prisma } from "@/lib/prisma";
import {
  findByQcode,
  type BifurcatedClientEntry,
} from "./bifurcated-clients-registry";

export type AuthResult =
  | { ok: true; client: BifurcatedClientEntry }
  | { ok: false; response: NextResponse };

// Shared auth+routing for the parameterized bifurcated routes. Reads the
// session's effective icode (supports admin impersonation), reads ?qcode= from
// the URL, validates that the icode owns the qcode per the registry.
export async function authorizeBifurcatedRequest(
  req: Request
): Promise<AuthResult> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const effectiveIcode = await getEffectiveIcodeChecked(session);
  if (!effectiveIcode) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const url = new URL(req.url);
  const qcode = url.searchParams.get("qcode");
  if (!qcode) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Missing qcode" }, { status: 400 }),
    };
  }
  const client = findByQcode(qcode);
  if (!client) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Unknown client" },
        { status: 404 }
      ),
    };
  }
  if (client.icode !== effectiveIcode) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, client };
}

export type HoldingsAuthResult =
  | { ok: true; qcode: string }
  | { ok: false; response: NextResponse };

// Authorizes a holdings request by ACCOUNT OWNERSHIP rather than the
// bifurcated registry, so it works for ALL managed clients (registry clients
// also have pooled_account_users rows). Reads the session's effective icode
// (impersonation-aware) and ?qcode=, then verifies the icode has an access
// row for that qcode in pooled_account_users. The holdings query only needs
// the qcode, so no registry config is returned. READ-ONLY.
export async function authorizeHoldingsRequest(
  req: Request
): Promise<HoldingsAuthResult> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const effectiveIcode = await getEffectiveIcodeChecked(session);
  if (!effectiveIcode) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const url = new URL(req.url);
  const qcode = url.searchParams.get("qcode");
  if (!qcode) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Missing qcode" }, { status: 400 }),
    };
  }
  const access = await prisma.pooled_account_users.findFirst({
    where: { icode: effectiveIcode, qcode },
    select: { id: true },
  });
  if (!access) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, qcode };
}
