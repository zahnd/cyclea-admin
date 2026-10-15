"use server";

import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/dal";
import { clearParkedAuthorization, isAuthorizationId } from "@/lib/auth/oauth-return";
import { adminDbAsUser } from "@/lib/db/admin-as-user";
import { redirectHost } from "@/lib/mcp/consent";
import { approveClient } from "@/lib/mcp/grants";

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The admin approves an AI client. requireAdmin() demands an authenticator
 * code from the last 12 hours. Our 30-day approval is recorded first, then
 * Supabase issues the authorization code: if the second step fails, the row
 * alone grants nothing usable.
 */
export async function approve(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("authorization_id") ?? "");
  if (!isAuthorizationId(id)) throw new Error("Invalid authorization request.");

  const supabase = await adminDbAsUser();
  // Read again here rather than trusting the form: client, redirect URI.
  const { data: details, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
  if (error || !details) throw new Error(`This sign-in request is no longer valid (${error?.message ?? "no details"}).`);
  if ("redirect_url" in details) {
    await clearParkedAuthorization();
    redirect(details.redirect_url);
  }

  try {
    await approveClient({
      adminId: admin.userId,
      clientId: details.client.id,
      clientName: details.client.name?.trim() || "Unnamed client",
      redirectHost: redirectHost(details.redirect_uri),
      actorLabel: admin.email,
    });
  } catch (cause) {
    console.error(`[mcp] approval record for client ${details.client.id} failed: ${message(cause)}`);
    throw new Error("Could not record the approval. Nothing was granted.");
  }

  const { data: approved, error: approveError } = await supabase.auth.oauth.approveAuthorization(id, {
    skipBrowserRedirect: true,
  });
  if (approveError || !approved) {
    console.error(`[mcp] approveAuthorization failed: ${approveError?.message ?? "no redirect"}`);
    throw new Error("Supabase did not accept the approval. Start the connection from the client again.");
  }
  await clearParkedAuthorization();
  redirect(approved.redirect_url);
}

/** Any signed-in account may decline -- including one that is not an admin. */
export async function deny(formData: FormData): Promise<void> {
  const id = String(formData.get("authorization_id") ?? "");
  if (!isAuthorizationId(id)) throw new Error("Invalid authorization request.");
  const supabase = await adminDbAsUser();
  const { data, error } = await supabase.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true });
  await clearParkedAuthorization();
  if (error || !data) redirect("/admin");
  redirect(data.redirect_url);
}
