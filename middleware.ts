import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";
import { BLOCKED_ICODES } from "@/lib/blocked-icodes";

const SESSION_COOKIES = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

// Add paths here to gate them behind dashboard visibility check
const VISIBILITY_GATED_PATHS = [
  "/dashboard",
  "/holding-summary",
  "/personal-details",
  "/quarterly-fees",
];

export async function middleware(req: NextRequest) {
  // Behind a reverse proxy the internal connection is plain http, so derive
  // the real protocol/host from the forwarded headers (falls back to nextUrl).
  const proto =
    req.headers.get("x-forwarded-proto") ??
    req.nextUrl.protocol.replace(":", "");
  const host = req.headers.get("host") ?? req.nextUrl.host;

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    // On https the cookie is `__Secure-next-auth.session-token`; without this
    // getToken looks for the wrong cookie name behind an SSL-terminating proxy.
    secureCookie: proto === "https",
  });
  const icode = token?.icode as string | undefined;
  const accessType = token?.accessType as string | undefined;

  // Existing blocked-icodes logic
  if (icode && BLOCKED_ICODES.has(icode)) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    const res = NextResponse.redirect(url);
    for (const name of SESSION_COOKIES) {
      res.cookies.delete(name);
    }
    return res;
  }

  // Dashboard visibility check — only for client users on gated paths
  const pathname = req.nextUrl.pathname;
  const isGatedPath = VISIBILITY_GATED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  const isClient = accessType === "client";

  if (isGatedPath && isClient && icode) {
    try {
      const res = await fetch(
        `${proto}://${host}/api/dashboard-visibility/check?icode=${icode}`,
        {
          // Forward the session cookie so the check runs in an authenticated
          // context, and avoid following redirects (e.g. http→https) silently.
          headers: { cookie: req.headers.get("cookie") ?? "" },
          redirect: "manual",
        },
      );
      if (res.ok) {
        const data = await res.json();
        if (data.dashboard_visible === false) {
          const url = req.nextUrl.clone();
          url.pathname = "/maintenance";
          url.search = "";
          return NextResponse.redirect(url);
        }
      }
    } catch {
      // If the check fails, allow access (fail open)
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/auth|api/dashboard-visibility|_next/static|_next/image|favicon.ico).*)",
  ],
};
