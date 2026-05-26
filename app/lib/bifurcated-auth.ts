import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getEffectiveIcode } from "./admin-utils";
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
  const effectiveIcode = getEffectiveIcode(session);
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
