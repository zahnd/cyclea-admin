import "server-only";

import type { AMREntry, JwtPayload } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";

import { adminDb } from "@/lib/db/admin";
import { adminDbAsUser } from "@/lib/db/admin-as-user";

// The authorization boundary. The proxy redirects early; this decides.
//
// Call requireAdmin() (or requireCreator() in /portal) in every layout AND page
// AND server action. A layout does not re-render on client navigation, and a
// server action is reachable by POST without ever rendering the page it
// belongs to.

/** How long a verified authenticator code is trusted before it is asked again. */
export const TOTP_FRESH_FOR_SECONDS = 12 * 60 * 60;

export type Admin = { userId: string; email: string };

/** Verified claims for this request, or null. Never trusts the cookie as sent. */
export const getClaims = cache(async (): Promise<JwtPayload | null> => {
  const supabase = await adminDbAsUser();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;
  return data.claims;
});

/** Unix seconds of the newest authenticator verification in this session. */
export function lastTotpAt(claims: JwtPayload): number | null {
  if (!Array.isArray(claims.amr)) return null;
  const stamps = (claims.amr as (AMREntry | string)[])
    .filter(
      (entry): entry is AMREntry =>
        typeof entry === "object" &&
        (entry.method === "totp" || entry.method === "mfa/totp"),
    )
    .map((entry) => entry.timestamp);
  return stamps.length > 0 ? Math.max(...stamps) : null;
}

/** True when this session has passed an authenticator check recently enough. */
export function hasFreshTotp(claims: JwtPayload): boolean {
  const at = lastTotpAt(claims);
  return (
    claims.aal === "aal2" &&
    at !== null &&
    Date.now() / 1000 - at < TOTP_FRESH_FOR_SECONDS
  );
}

/**
 * What an account may do, read per request from the role tables: admin
 * (public.admins) or creator (public.creator_logins, migration 0006). The
 * database guarantees never both.
 */
export type Role = { kind: "admin" } | { kind: "creator"; creatorId: string } | { kind: "none" };

export const getRole = cache(async (userId: string): Promise<Role> => {
  const db = adminDb();
  const [admin, creator] = await Promise.all([
    db.from("admins").select("user_id").eq("user_id", userId).maybeSingle(),
    db.from("creator_logins").select("creator_id").eq("user_id", userId).maybeSingle(),
  ]);
  // Fail closed: an error reading either table is not a yes.
  if (admin.error) throw new Error(`admins lookup failed: ${admin.error.message}`);
  if (creator.error) throw new Error(`creator_logins lookup failed: ${creator.error.message}`);
  if (admin.data) return { kind: "admin" };
  if (creator.data) return { kind: "creator", creatorId: (creator.data as { creator_id: string }).creator_id };
  return { kind: "none" };
});

/** End the session of an account with no role, and send it to sign-in. */
async function denyNoRole(): Promise<never> {
  // Signup is off, so such an account was revoked, unlinked, or never given a
  // role. Ending its session beats leaving it half-signed-in.
  const supabase = await adminDbAsUser();
  await supabase.auth.signOut();
  redirect("/login?denied=1");
}

/**
 * The signed-in admin, or a redirect. With `allowStaleTotp`, an admin whose
 * authenticator check is missing or older than 12 hours is let through -- for
 * the MFA page itself, which is where that is fixed.
 */
export async function requireAdmin(
  options: { allowStaleTotp?: boolean } = {},
): Promise<Admin> {
  const claims = await getClaims();
  if (!claims?.sub) redirect("/login");

  const role = await getRole(claims.sub);
  // A creator who wanders into /admin belongs in the portal, still signed in.
  if (role.kind === "creator") redirect("/portal");
  if (role.kind !== "admin") await denyNoRole();

  if (!options.allowStaleTotp && !hasFreshTotp(claims)) redirect("/login/mfa");

  return { userId: claims.sub, email: claims.email ?? "" };
}

export type Creator = { userId: string; email: string; creatorId: string };

/**
 * The signed-in creator, or a redirect. An email code is enough for creators
 * (decided 2026-10-01): no authenticator, so no aal2 or freshness check. The
 * creator id comes from creator_logins -- never from the request -- so a
 * creator can only ever see their own data.
 */
export async function requireCreator(): Promise<Creator> {
  const claims = await getClaims();
  if (!claims?.sub) redirect("/login");

  const role = await getRole(claims.sub);
  if (role.kind === "admin") redirect("/admin");
  if (role.kind !== "creator") return denyNoRole();

  return { userId: claims.sub, email: claims.email ?? "", creatorId: role.creatorId };
}
