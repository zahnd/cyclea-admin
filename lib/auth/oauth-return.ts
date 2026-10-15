import "server-only";

import { cookies } from "next/headers";

// An MCP client's sign-in can start before the admin is signed in, or with an
// authenticator code older than 12 hours. The consent page then parks the
// pending authorization here (through /oauth/park, since a page cannot set a
// cookie), sends the admin through /login and /login/mfa, and the MFA step
// brings them back. The cookie holds an authorization id -- never a URL -- so
// it can only ever lead back to /oauth/consent. It lives 10 minutes and is
// cleared when the admin approves or denies.

const COOKIE = "oauth_return";
export const PARK_MAX_AGE_SECONDS = 10 * 60;

/** Supabase's authorization ids are opaque; accept a conservative shape. */
export function isAuthorizationId(value: string): boolean {
  return /^[A-Za-z0-9_-]{8,128}$/.test(value);
}

export function consentPath(authorizationId: string): string {
  return `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
}

export const PARK_COOKIE = {
  name: COOKIE,
  options: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: PARK_MAX_AGE_SECONDS },
};

/** Where the MFA step should continue: the parked consent page, or null. Reads only. */
export async function parkedConsentPath(): Promise<string | null> {
  const value = (await cookies()).get(COOKIE)?.value;
  return value && isAuthorizationId(value) ? consentPath(value) : null;
}

/** In a server action or route handler only. */
export async function clearParkedAuthorization(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
