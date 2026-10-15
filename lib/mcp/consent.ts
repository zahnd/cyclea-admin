import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { activeGrant } from "./grants";

/**
 * Supabase remembers a consent until it is revoked, and then skips the
 * consent page: getAuthorizationDetails answers with a redirect straight
 * away. Our approval lasts 30 days. So before showing the page, withdraw
 * Supabase's consent for every client this admin has no ACTIVE approval for
 * (expired, revoked, or never recorded) -- the client then has to come
 * through our page, which renews the approval, or stays refused.
 *
 * Runs with the admin's own session: grants are user-scoped.
 */
export async function alignSupabaseConsents(supabase: SupabaseClient, adminId: string): Promise<void> {
  const { data: grants, error } = await supabase.auth.oauth.listGrants();
  if (error) throw new Error(`oauth listGrants: ${error.message}`);
  for (const grant of grants ?? []) {
    if (await activeGrant(adminId, grant.client.id)) continue;
    const { error: revokeError } = await supabase.auth.oauth.revokeGrant({ clientId: grant.client.id });
    if (revokeError) throw new Error(`oauth revokeGrant: ${revokeError.message}`);
  }
}

/** The redirect URI's host, which a client cannot fake the way it can its name. */
export function redirectHost(redirectUri: string): string {
  try {
    return new URL(redirectUri).host || redirectUri;
  } catch {
    return redirectUri;
  }
}
