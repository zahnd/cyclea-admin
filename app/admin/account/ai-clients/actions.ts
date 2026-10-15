"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/dal";
import { isUuid } from "@/lib/creators/validation";
import { adminDbAsUser } from "@/lib/db/admin-as-user";
import { revokeClient } from "@/lib/mcp/grants";

export type FormState = { error?: string; ok?: string };

/**
 * Withdraws an AI client's access: our approval (the endpoint refuses it at
 * once) and Supabase's grant (its sessions and refresh tokens die too).
 */
export async function revoke(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const clientId = String(formData.get("client_id") ?? "");
  if (!isUuid(clientId)) throw new Error("Invalid client id.");

  try {
    await revokeClient(admin.userId, clientId, admin.email);
  } catch (error) {
    console.error(`[mcp] revoke ${clientId} failed: ${error instanceof Error ? error.message : String(error)}`);
    return { error: "Could not revoke. Try again." };
  }

  // Our row already refuses the client; this also ends its Supabase sessions.
  const supabase = await adminDbAsUser();
  const { error } = await supabase.auth.oauth.revokeGrant({ clientId });
  if (error) console.error(`[mcp] Supabase revokeGrant ${clientId}: ${error.message}`);

  revalidatePath("/admin/account/ai-clients");
  return { ok: "Revoked." };
}
