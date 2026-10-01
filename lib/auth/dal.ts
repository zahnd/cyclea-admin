import "server-only";

import type { AMREntry, JwtPayload } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";

import { adminDb } from "@/lib/db/admin";
import { adminDbAsUser } from "@/lib/db/admin-as-user";

// The authorization boundary. The proxy redirects early; this decides.
//
// Call requireAdmin() in every admin layout AND page AND server action. A
// layout does not re-render on client navigation, and a server action is
// reachable by POST without ever rendering the page it belongs to.

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

const isAdmin = cache(async (userId: string): Promise<boolean> => {
  const { data, error } = await adminDb()
    .from("admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  // Fail closed: an error reading the table is not a yes.
  if (error) throw new Error(`admins lookup failed: ${error.message}`);
  return data !== null;
});

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

  if (!(await isAdmin(claims.sub))) {
    // A valid account that is not an admin: end its session rather than leave
    // it half-signed-in. Signup is off, so this should never happen.
    const supabase = await adminDbAsUser();
    await supabase.auth.signOut();
    redirect("/login?denied=1");
  }

  if (!options.allowStaleTotp && !hasFreshTotp(claims)) redirect("/login/mfa");

  return { userId: claims.sub, email: claims.email ?? "" };
}
