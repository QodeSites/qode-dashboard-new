import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

export async function requirePartner() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.accessType !== "partner") {
    return {
      error: NextResponse.json(
        { error: "Partner access required" },
        { status: 403 },
      ),
      session: null,
    };
  }
  return { error: null, session };
}

/**
 * Returns true if the given partner has the client (icode) in their book.
 * The single source of truth for partner→client access; used both by the
 * impersonate endpoint and by getEffectiveIcodeChecked on every data request.
 */
export async function partnerCanAccessIcode(
  partnerId: string | number | undefined | null,
  icode: string,
): Promise<boolean> {
  const pid =
    typeof partnerId === "string" ? parseInt(partnerId, 10) : partnerId;
  if (!pid || Number.isNaN(pid)) return false;
  const row = await prisma.partner_clients.findUnique({
    where: { partner_id_icode: { partner_id: pid, icode } },
    select: { id: true },
  });
  return !!row;
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
  // NOTE: intentionally does NOT honor partner impersonation. This is the
  // fail-closed sync resolver — any endpoint not yet migrated to the async
  // checked resolver will resolve a partner to null (401) rather than leak.
  return session.user.icode || null;
}

/**
 * Async, impersonation-aware icode resolver that ALSO enforces the partner book.
 * Use this in every data endpoint reachable by a partner.
 *  - admin impersonating   -> impersonating.icode (trusted; admin may view anyone)
 *  - partner impersonating  -> impersonating.icode ONLY if it is in their book, else null
 *  - regular client        -> session.user.icode
 *
 * Why this exists: updateSession() sets `impersonating` from the client side and
 * the NextAuth JWT callback cannot hit the DB, so the token's impersonation
 * target is UNTRUSTED for partners and must be re-verified here on every request.
 */
export async function getEffectiveIcodeChecked(
  session: any,
): Promise<string | null> {
  if (!session?.user) return null;

  // Admin impersonating any client (trusted)
  if (
    session.user.accessType === "admin" &&
    session.user.impersonating?.icode
  ) {
    return session.user.impersonating.icode;
  }

  // Partner impersonating a client — only if the client is in their book
  if (
    session.user.accessType === "partner" &&
    session.user.impersonating?.icode
  ) {
    const allowed = await partnerCanAccessIcode(
      session.user.partnerId,
      session.user.impersonating.icode,
    );
    return allowed ? session.user.impersonating.icode : null;
  }

  // Regular client
  return session.user.icode || null;
}

/**
 * Returns all icodes in the given partner's book. Used to scope
 * stats/visibility/excel-export queries to the partner's clients.
 */
export async function getPartnerBookIcodes(partnerId: number): Promise<string[]> {
  const rows = await prisma.partner_clients.findMany({
    where: { partner_id: partnerId },
    select: { icode: true },
  });
  return rows.map((r) => r.icode);
}

export async function checkDashboardVisibility(icode: string, page: string = "dashboard"): Promise<boolean> {
  const row = await prisma.dashboard_visibility.findUnique({
    where: { icode_page: { icode, page } },
    select: { dashboard_visible: true },
  });
  return row ? row.dashboard_visible : true;
}
