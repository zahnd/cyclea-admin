import "server-only";

import { adminDb } from "@/lib/db/admin";

// Each admin's support signature (admins.support_name, migration 0014): the
// first name a reply is signed with, shown in the app as "Stefan · Cyclea
// team". Set on Profile; replying waits until it is.

/** The signed-in admin's signature name, or null while unset. */
export async function getSupportName(adminId: string): Promise<string | null> {
  const { data, error } = await adminDb().from("admins").select("support_name").eq("user_id", adminId).maybeSingle();
  if (error) throw new Error(`support name: ${error.message}`);
  return (data as { support_name: string | null } | null)?.support_name ?? null;
}

/**
 * Saves (or, with an empty name, clears) an admin's signature and writes the
 * audit entry, in one transaction (set_admin_support_name, 0014). Returns
 * whether anything changed.
 */
export async function setSupportName(
  adminId: string,
  name: string,
  actor: { id: string; label: string },
): Promise<boolean> {
  const { data, error } = await adminDb().rpc("set_admin_support_name", {
    p_admin_id: adminId,
    p_name: name,
    p_actor_id: actor.id,
    p_actor_label: actor.label,
  });
  if (error) throw new Error(`set_admin_support_name: ${error.message}`);
  return data === true;
}
