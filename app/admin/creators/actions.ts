"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin, type Admin } from "@/lib/auth/dal";
import { requireRecentTotp } from "@/lib/auth/step-up";
import { getAppCreator } from "@/lib/creators/data";
import {
  codeError,
  isContractStatus,
  isIsoDate,
  isPayoutMethod,
  isSkribbleUrl,
  isUuid,
  looksLikeIban,
  nameError,
  normalizeCode,
} from "@/lib/creators/validation";
import { adminDb } from "@/lib/db/admin";
import { appDbAsAdminPortal } from "@/lib/db/app";
import { findUserByEmail } from "@/lib/users/data";

// A creator spans two databases, so no change here is one transaction.
// The order is always: the app project first (a code must work the moment it
// is handed out), then the admin project's record or audit entry. If the
// second half fails, the change is real and visible, and the action says the
// record is incomplete rather than pretending it did not happen.

export type FormState = { error?: string; ok?: string; needsCode?: boolean };

/** Every server action calls requireAdmin() itself: a POST does not pass the layout. */
async function actor(): Promise<{ admin: Admin; actor: { p_actor_id: string; p_actor_label: string } }> {
  const admin = await requireAdmin();
  return { admin, actor: { p_actor_id: admin.userId, p_actor_label: admin.email } };
}

async function audit(
  admin: Admin,
  action: string,
  creatorId: string,
  details: Record<string, unknown>,
): Promise<string | null> {
  const { error } = await adminDb().from("audit_log").insert({
    actor_id: admin.userId,
    actor_label: admin.email,
    action,
    target_type: "creator",
    target_id: creatorId,
    details,
  });
  if (!error) return null;
  console.error(`[creators] audit ${action} for ${creatorId} failed: ${error.message}`);
  return "The change was saved, but writing the audit entry failed. Note what you changed and check the server log.";
}

function idFrom(formData: FormData): string {
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) throw new Error("Invalid creator id.");
  return id;
}

function pgCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

// ---------------------------------------------------------------------------

export async function createCreator(_prev: FormState, formData: FormData): Promise<FormState> {
  const { admin, actor: who } = await actor();

  const code = normalizeCode(String(formData.get("code") ?? ""));
  const name = String(formData.get("name") ?? "").trim();
  const invalid = codeError(code) ?? nameError(name);
  if (invalid) return { error: invalid };

  // The id is chosen here, once, and used on both sides.
  const id = randomUUID();
  try {
    await appDbAsAdminPortal().query(
      "INSERT INTO public.creators (id, code, name) VALUES ($1, $2, $3)",
      [id, code, name],
    );
  } catch (error) {
    if (pgCode(error) === "23505") return { error: `The code ${code} is already taken.` };
    console.error(`[creators] app insert failed: ${String(error)}`);
    return { error: "Could not create the creator in the app. Nothing was saved." };
  }

  const { error } = await adminDb().rpc("record_creator", {
    p_id: id,
    p_code: code,
    p_name: name,
    p_adopted: false,
    ...who,
  });
  if (error) {
    // The creator exists in the app and its code works; the detail page shows
    // "No admin record" with an Add record button for exactly this case.
    console.error(`[creators] record_creator for ${id} (${admin.email}) failed: ${error.message}`);
  }

  revalidatePath("/admin/creators");
  redirect(`/admin/creators/${id}`);
}

export async function renameCreator(_prev: FormState, formData: FormData): Promise<FormState> {
  const { admin } = await actor();
  const id = idFrom(formData);
  const name = String(formData.get("name") ?? "").trim();
  const invalid = nameError(name);
  if (invalid) return { error: invalid };

  const client = await appDbAsAdminPortal().connect();
  let previous: { name: string; code: string } | undefined;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ name: string; code: string }>(
      "SELECT name, code FROM public.creators WHERE id = $1 FOR UPDATE",
      [id],
    );
    previous = rows[0];
    if (previous && previous.name !== name) {
      await client.query("UPDATE public.creators SET name = $2 WHERE id = $1", [id, name]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`[creators] rename ${id} failed: ${String(error)}`);
    return { error: "Could not rename the creator. Nothing was changed." };
  } finally {
    client.release();
  }

  if (!previous) return { error: "This creator no longer exists in the app." };
  if (previous.name === name) return { ok: "No change." };

  const auditError = await audit(admin, "creator.rename", id, {
    code: previous.code,
    from: previous.name,
    to: name,
  });
  revalidatePath(`/admin/creators/${id}`);
  return auditError ? { error: auditError } : { ok: "Renamed." };
}

export async function setCreatorActive(_prev: FormState, formData: FormData): Promise<FormState> {
  const { admin } = await actor();
  const id = idFrom(formData);
  const active = formData.get("active") === "true";

  let code: string | undefined;
  try {
    // `active IS DISTINCT FROM` makes a repeated click a no-op, and a no-op
    // writes no audit entry.
    const { rows } = await appDbAsAdminPortal().query<{ code: string }>(
      "UPDATE public.creators SET active = $2 WHERE id = $1 AND active IS DISTINCT FROM $2 RETURNING code",
      [id, active],
    );
    code = rows[0]?.code;
  } catch (error) {
    console.error(`[creators] set active ${id} failed: ${String(error)}`);
    return { error: "Could not change the status. Nothing was changed." };
  }
  if (!code) return { ok: "No change." };

  const auditError = await audit(admin, active ? "creator.activate" : "creator.deactivate", id, { code });
  revalidatePath(`/admin/creators/${id}`);
  revalidatePath("/admin/creators");
  return auditError
    ? { error: auditError }
    : { ok: active ? "Active: new users can claim the code." : "Inactive: the code no longer accepts new claims." };
}

export async function adoptCreator(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor: who } = await actor();
  const id = idFrom(formData);

  const creator = await getAppCreator(id);
  if (!creator) return { error: "This creator does not exist in the app." };

  const { error } = await adminDb().rpc("record_creator", {
    p_id: id,
    p_code: creator.code,
    p_name: creator.name,
    p_adopted: true,
    ...who,
  });
  if (error) {
    console.error(`[creators] adopt ${id} failed: ${error.message}`);
    return { error: "Could not add the record." };
  }
  revalidatePath(`/admin/creators/${id}`);
  revalidatePath("/admin/creators");
  return { ok: "Record added." };
}

export async function updateCreatorRecord(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor: who } = await actor();
  const id = idFrom(formData);

  const method = String(formData.get("payout_method") ?? "").trim();
  const payee = String(formData.get("payee_reference") ?? "").trim();
  const note = String(formData.get("internal_note") ?? "").trim();

  if (method && !isPayoutMethod(method)) return { error: "Choose a payout method from the list." };
  if (payee.length > 100) return { error: "The payee reference is limited to 100 characters." };
  if (payee && looksLikeIban(payee)) {
    return { error: "That looks like an IBAN. Store the Wise recipient id or the bank's payee reference instead — never account details." };
  }
  if (note.length > 5000) return { error: "The note is limited to 5000 characters." };

  const { data: changed, error } = await adminDb().rpc("update_creator_record", {
    p_id: id,
    p_payout_method: method,
    p_payee_reference: payee,
    p_internal_note: note,
    ...who,
  });
  if (error) {
    console.error(`[creators] update record ${id} failed: ${error.message}`);
    return { error: "Could not save the record. Nothing was changed." };
  }
  revalidatePath(`/admin/creators/${id}`);
  return { ok: changed ? "Saved." : "No change." };
}

/**
 * The contract's state and its Skribble link (migration 0007). Business
 * fields like the record, so no step-up. Only the dates the state needs are
 * sent: a date left in a hidden input must not fail the database's CHECK.
 */
export async function updateCreatorContract(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor: who } = await actor();
  const id = idFrom(formData);

  const status = String(formData.get("contract_status") ?? "");
  const signedOn = String(formData.get("contract_signed_on") ?? "").trim();
  const endedOn = String(formData.get("contract_ended_on") ?? "").trim();
  const url = String(formData.get("contract_url") ?? "").trim();

  if (!isContractStatus(status)) return { error: "Choose a contract state from the list." };
  const needsSigned = status === "signed" || status === "ended";
  const needsEnded = status === "ended";
  if (needsSigned && !isIsoDate(signedOn)) return { error: "Enter the date the contract was signed." };
  if (needsEnded && !isIsoDate(endedOn)) return { error: "Enter the date the contract ended." };
  if (needsEnded && endedOn < signedOn) return { error: "The contract cannot end before it was signed." };
  if (url && !isSkribbleUrl(url)) {
    return { error: "Paste the contract's Skribble link (https://my.skribble.com/…). Never a file share — the contract stays in Skribble." };
  }

  const { data: changed, error } = await adminDb().rpc("update_creator_contract", {
    p_id: id,
    p_status: status,
    p_signed_on: needsSigned ? signedOn : null,
    p_ended_on: needsEnded ? endedOn : null,
    p_url: url,
    ...who,
  });
  if (error) {
    console.error(`[creators] update contract ${id} failed: ${error.message}`);
    return { error: "Could not save the contract. Nothing was changed." };
  }
  revalidatePath(`/admin/creators/${id}`);
  revalidatePath("/admin/creators");
  return { ok: changed ? "Saved." : "No change." };
}

// ---------------------------------------------------------------------------
// Portal access (migration 0006). Granting or ending someone's sign-in is an
// account action, so both need the step-up code like the ones in Users.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function inviteCreatorLogin(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor: who } = await actor();
  const id = idFrom(formData);
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
      // Confirmed up front: their first sign-in is a code to this address.
      const { data, error } = await adminDb().auth.admin.createUser({ email, email_confirm: true });
      if (error) throw error;
      userId = data.user.id;
    }
  } catch (error) {
    console.error(`[creators] invite ${email}: ${error instanceof Error ? error.message : String(error)}`);
    return { error: "Could not create the account. Nothing was changed." };
  }

  const { data: linked, error } = await adminDb().rpc("link_creator_login", {
    p_user_id: userId,
    p_creator_id: id,
    ...who,
  });
  if (error) {
    // link_creator_login (0006) names the rule that stopped it in a HINT.
    const reasons: Record<string, string> = {
      admin: "This address belongs to an admin. Admins and creators need separate accounts.",
      linked: "This address already signs in as another creator.",
      taken: "This creator already has a portal login. Remove it first.",
      no_record: "Add the business record first.",
    };
    if (error.hint && reasons[error.hint]) return { error: reasons[error.hint] };
    console.error(`[creators] link ${id}: ${error.message}`);
    return { error: "Could not give portal access." };
  }

  revalidatePath(`/admin/creators/${id}`);
  return {
    ok: linked
      ? `${email} can now sign in at admin.cyclea.app/portal with a code. Let them know: no email is sent.`
      : "Already linked. Nothing changed.",
  };
}

export async function removeCreatorLogin(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor: who } = await actor();
  const id = idFrom(formData);

  const step = await requireRecentTotp(formData);
  if (!step.ok) return { needsCode: true, error: step.error };

  const { data: removed, error } = await adminDb().rpc("unlink_creator_login", { p_creator_id: id, ...who });
  if (error) {
    console.error(`[creators] unlink ${id}: ${error.message}`);
    return { error: "Could not remove portal access." };
  }
  revalidatePath(`/admin/creators/${id}`);
  return {
    ok: removed
      ? "Portal access removed. The account remains, with no access; delete it in Users if it is not needed."
      : "No portal login. Nothing changed.",
  };
}
