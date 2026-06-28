import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";
import { BLOCKED_ICODES } from "@/lib/blocked-icodes";

const SESSION_COOKIES = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  const { pathname } = req.nextUrl;

  // Guard internal routes
  if (
    pathname.startsWith("/internal") ||
    pathname.startsWith("/api/internal")
  ) {
    if (token?.accessType !== "internal") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    return NextResponse.next();
  }

  const icode = token?.icode as string | undefined;

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

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
