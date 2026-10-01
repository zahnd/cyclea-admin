"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/dal";
import { requireRecentTotp } from "@/lib/auth/step-up";
import { findUserByEmail, getAdmin } from "@/lib/admins/data";
import { isUuid } from "@/lib/creators/validation";
import { adminDb } from "@/lib/db/admin";

export type AdminFormState = { error?: string; ok?: string; needsCode?: boolean };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function idFrom(formData: FormData): string {
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) throw new Error("Invalid user id.");
  return id;
}

export async function addAdmin(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 320) return { error: "Enter a valid email address." };

  const step = await requireRecentTotp(formData);
  if (!step.ok) return { needsCode: true, error: step.error };

  let userId: string;
  try {
    const existing = await findUserByEmail(email);
    if (existing) {
      userId = existing.id;
    } else {
      // Confirmed up front: their first sign-in is a code to this address,
      // which proves ownership the same way a confirmation link would.
      const { data, error } = await adminDb().auth.admin.createUser({ email, email_confirm: true });
      if (error) throw error;
      userId = data.user.id;
    }
  } catch (error) {
    console.error(`[admins] add ${email}: ${error instanceof Error ? error.message : String(error)}`);
    return { error: "Could not create the account. Nothing was changed." };
  }

  const { data: granted, error } = await adminDb().rpc("grant_admin", {
    p_user_id: userId,
    p_actor_id: admin.userId,
    p_actor_label: admin.email,
  });
  if (error) {
    console.error(`[admins] grant ${email}: ${error.message}`);
    return { error: "Could not grant admin access." };
  }

  revalidatePath("/admin/admins");
  return granted
    ? { ok: `${email} is now an admin. They sign in at /login with a code, then set up an authenticator.` }
    : { ok: `${email} is already an admin. Nothing changed.` };
}

export async function revokeAdmin(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const id = idFrom(formData);
  if (id === admin.userId) return { error: "You cannot revoke yourself." };

  const step = await requireRecentTotp(formData);
  if (!step.ok) return { needsCode: true, error: step.error };

  const { data: revoked, error } = await adminDb().rpc("revoke_admin", {
    p_user_id: id,
    p_actor_id: admin.userId,
    p_actor_label: admin.email,
  });
  if (error) {
    // The function refuses with a HINT naming which rule stopped it.
    if (error.hint === "last") return { error: "This is the last admin. Add another admin first." };
    if (error.hint === "self") return { error: "You cannot revoke yourself." };
    console.error(`[admins] revoke ${id}: ${error.message}`);
    return { error: "Could not revoke admin access." };
  }

  revalidatePath("/admin/admins");
  if (!revoked) return { ok: "This account was not an admin. Nothing changed." };
  redirect("/admin/admins");
}

export async function resetAuthenticator(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const id = idFrom(formData);
  if (id === admin.userId) {
    return { error: "You cannot reset your own authenticator here. Use scripts/admin.ts reset-mfa." };
  }

  const target = await getAdmin(id);
  if (!target) return { error: "This account is not an admin." };

  const step = await requireRecentTotp(formData);
  if (!step.ok) return { needsCode: true, error: step.error };

  const db = adminDb();
  const { data, error } = await db.auth.admin.mfa.listFactors({ userId: id });
  if (error) {
    console.error(`[admins] list factors ${id}: ${error.message}`);
    return { error: "Could not read the authenticator." };
  }
  const totp = data.factors.filter((f) => f.factor_type === "totp");
  if (totp.length === 0) return { ok: "No authenticator is set up for this admin. Nothing changed." };

  for (const factor of totp) {
    const { error: deleteError } = await db.auth.admin.mfa.deleteFactor({ id: factor.id, userId: id });
    if (deleteError) {
      console.error(`[admins] delete factor ${factor.id}: ${deleteError.message}`);
      return { error: "Could not remove the authenticator." };
    }
  }

  // Auth is an API, not a table: this cannot share a transaction with the
  // deletion, so it is written only after every factor is gone.
  const { error: auditError } = await db.from("audit_log").insert({
    actor_id: admin.userId,
    actor_label: admin.email,
    action: "admin.reset_mfa",
    target_type: "admin",
    target_id: id,
    details: { email: target.email, factors_removed: totp.length },
  });
  if (auditError) {
    console.error(`[admins] audit reset_mfa ${id}: ${auditError.message}`);
    return { error: "The authenticator was removed, but writing the audit entry failed. Check the server log." };
  }

  revalidatePath(`/admin/admins/${id}`);
  return { ok: `Authenticator removed. ${target.email} sets up a new one at their next sign-in.` };
}
