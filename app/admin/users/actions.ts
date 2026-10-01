"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/dal";
import { requireRecentTotp } from "@/lib/auth/step-up";
import { isUuid } from "@/lib/creators/validation";
import { adminDb } from "@/lib/db/admin";
import { findUserByEmail, getUser } from "@/lib/users/data";

// Every action here changes who can do what, so each one runs requireAdmin()
// and then the step-up check (a TOTP code from the last five minutes).

export type UserFormState = { error?: string; ok?: string; needsCode?: boolean };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function idFrom(formData: FormData): string {
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) throw new Error("Invalid user id.");
  return id;
}

async function grant(userId: string, actorId: string, actorLabel: string): Promise<boolean | string> {
  const { data, error } = await adminDb().rpc("grant_admin", {
    p_user_id: userId,
    p_actor_id: actorId,
    p_actor_label: actorLabel,
  });
  if (error) {
    console.error(`[users] grant ${userId}: ${error.message}`);
    return "Could not grant admin access.";
  }
  return Boolean(data);
}

export async function addAdmin(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
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
    console.error(`[users] add ${email}: ${error instanceof Error ? error.message : String(error)}`);
    return { error: "Could not create the account. Nothing was changed." };
  }

  const result = await grant(userId, admin.userId, admin.email);
  if (typeof result === "string") return { error: result };
  revalidatePath("/admin/users");
  redirect(`/admin/users/${userId}`);
}

/** Admin access for an existing account without a role -- the re-grant path. */
export async function grantAdmin(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const admin = await requireAdmin();
  const id = idFrom(formData);

  const step = await requireRecentTotp(formData);
  if (!step.ok) return { needsCode: true, error: step.error };

  const result = await grant(id, admin.userId, admin.email);
  if (typeof result === "string") return { error: result };
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${id}`);
  return { ok: result ? "Admin access granted." : "Already an admin. Nothing changed." };
}

export async function revokeAdmin(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
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
    // revoke_admin (0004) refuses with a HINT naming the rule that stopped it.
    if (error.hint === "last") return { error: "This is the last admin. Add another admin first." };
    if (error.hint === "self") return { error: "You cannot revoke yourself." };
    console.error(`[users] revoke ${id}: ${error.message}`);
    return { error: "Could not revoke admin access." };
  }

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${id}`);
  return { ok: revoked ? "Admin access revoked. The account remains, with no access." : "Not an admin. Nothing changed." };
}

export async function resetAuthenticator(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const admin = await requireAdmin();
  const id = idFrom(formData);
  if (id === admin.userId) {
    return { error: "You cannot reset your own authenticator here. Use scripts/admin.ts reset-mfa." };
  }

  const target = await getUser(id);
  if (!target) return { error: "This account no longer exists." };

  const step = await requireRecentTotp(formData);
  if (!step.ok) return { needsCode: true, error: step.error };

  const db = adminDb();
  const { data, error } = await db.auth.admin.mfa.listFactors({ userId: id });
  if (error) {
    console.error(`[users] list factors ${id}: ${error.message}`);
    return { error: "Could not read the authenticator." };
  }
  const totp = data.factors.filter((f) => f.factor_type === "totp");
  if (totp.length === 0) return { ok: "No authenticator is set up. Nothing changed." };

  for (const factor of totp) {
    const { error: deleteError } = await db.auth.admin.mfa.deleteFactor({ id: factor.id, userId: id });
    if (deleteError) {
      console.error(`[users] delete factor ${factor.id}: ${deleteError.message}`);
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
    console.error(`[users] audit reset_mfa ${id}: ${auditError.message}`);
    return { error: "The authenticator was removed, but writing the audit entry failed. Check the server log." };
  }

  revalidatePath(`/admin/users/${id}`);
  return { ok: `Authenticator removed. ${target.email} sets up a new one at their next sign-in.` };
}

export async function deleteAccount(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const admin = await requireAdmin();
  const id = idFrom(formData);
  if (id === admin.userId) return { error: "You cannot delete yourself." };

  const step = await requireRecentTotp(formData);
  if (!step.ok) return { needsCode: true, error: step.error };

  const { data: deleted, error } = await adminDb().rpc("delete_account", {
    p_user_id: id,
    p_actor_id: admin.userId,
    p_actor_label: admin.email,
  });
  if (error) {
    // delete_account (0005) refuses with a HINT naming the rule that stopped it.
    if (error.hint === "admin") return { error: "This account is an admin. Revoke admin access first." };
    if (error.hint === "self") return { error: "You cannot delete yourself." };
    console.error(`[users] delete ${id}: ${error.message}`);
    return { error: "Could not delete the account." };
  }

  revalidatePath("/admin/users");
  if (!deleted) return { ok: "This account no longer exists." };
  redirect("/admin/users");
}
