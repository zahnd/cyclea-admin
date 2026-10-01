import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/db/proxy-session";

// Session refresh for the routes that use one, plus an early redirect for
// /admin and /portal without a session. NOT the security boundary: every page
// and server action calls requireAdmin() or requireCreator() in
// lib/auth/dal.ts, which is.
export async function proxy(request: NextRequest) {
  const { response, claims } = await updateSession(request);

  const { pathname } = request.nextUrl;
  if (!claims && (pathname.startsWith("/admin") || pathname.startsWith("/portal"))) {
    const redirect = NextResponse.redirect(new URL("/login", request.url));
    // Carry any cookie the refresh cleared, or the stale one comes back.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/portal/:path*", "/login/:path*"],
};
