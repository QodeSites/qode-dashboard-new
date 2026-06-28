import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { NextResponse } from "next/server";

export async function requireInternal() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.accessType !== "internal") {
    return {
      error: NextResponse.json(
        { error: "Internal access required" },
        { status: 403 },
      ),
      session: null,
    };
  }
  return { error: null, session };
}

export async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.accessType !== "admin") {
    return {
      error: NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      ),
      session: null,
    };
  }
  return { error: null, session };
}

export async function requireDistributor() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.accessType !== "distributor") {
    return {
      error: NextResponse.json(
        { error: "Distributor access required" },
        { status: 403 },
      ),
      session: null,
    };
  }
  return { error: null, session };
}

/**
 * Resolves the effective icode from a session, supporting admin impersonation.
 * - For regular clients: returns session.user.icode
 * - For admins impersonating: returns impersonating.icode (only if accessType is "admin")
 * - Returns null if no valid icode can be resolved
 */
export function getEffectiveIcode(session: any): string | null {
  if (!session?.user) return null;

  // Admin impersonating a client
  if (
    session.user.accessType === "admin" &&
    session.user.impersonating?.icode
  ) {
    return session.user.impersonating.icode;
  }

  // Regular client
  return session.user.icode || null;
}
