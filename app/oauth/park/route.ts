import { NextResponse, type NextRequest } from "next/server";

import { isAuthorizationId, PARK_COOKIE } from "@/lib/auth/oauth-return";

// The consent page sends an admin who must sign in (or confirm their
// authenticator) here first: a page cannot set a cookie, this can. It parks
// the authorization id and continues to the sign-in step the page named.

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("authorization_id") ?? "";
  const to = request.nextUrl.searchParams.get("to") === "mfa" ? "/login/mfa" : "/login";
  const response = NextResponse.redirect(new URL(to, request.url));
  if (isAuthorizationId(id)) response.cookies.set(PARK_COOKIE.name, id, PARK_COOKIE.options);
  return response;
}
