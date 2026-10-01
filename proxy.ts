import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/db/proxy-session";

// Session refresh for the routes that use one, plus an early redirect for
// /admin without a session. NOT the security boundary: every admin page and
// server action calls requireAdmin() in lib/auth/dal.ts, which is.
export async function proxy(request: NextRequest) {
  const { response, claims } = await updateSession(request);

  if (!claims && request.nextUrl.pathname.startsWith("/admin")) {
    const redirect = NextResponse.redirect(new URL("/login", request.url));
    // Carry any cookie the refresh cleared, or the stale one comes back.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/login/:path*"],
};
