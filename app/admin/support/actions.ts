"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/dal";
import { isUuid } from "@/lib/creators/validation";
import { auditSupport, getThread, setThreadStatus, teamReply } from "@/lib/support/data";
import { getSupportName } from "@/lib/support/signature";
import { replyError, SUPPORT_RAISED_MESSAGES, supportRaised } from "@/lib/support/validation";

// Replies and status changes go to the APP project, through the two functions
// granted to admin_portal (cyclea-app 0069); the audit entry goes HERE
// afterwards. Two databases, no shared transaction: the order is the app
// first, so a failed audit entry is reported rather than hiding a change that
// happened. Neither the reply nor the user's names ever reach the audit log.

/** `sent`: the app took the reply, so the form can clear (even when the audit entry failed). */
export type FormState = { error?: string; ok?: string; sent?: boolean };

function idFrom(formData: FormData): string {
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) throw new Error("Invalid thread id.");
  return id;
}

/** Postgres' message only: never the parameters, which hold the reply. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function revalidate(id: string) {
  revalidatePath(`/admin/support/${id}`);
  revalidatePath("/admin/support");
  // The layout's waiting count, on every admin page.
  revalidatePath("/admin", "layout");
}

export async function sendReply(_prev: FormState, formData: FormData): Promise<FormState> {
  // Every server action checks for itself: a POST does not pass the layout.
  const admin = await requireAdmin();
  const id = idFrom(formData);
  const body = String(formData.get("body") ?? "").trim();
  const invalid = replyError(body);
  if (invalid) return { error: invalid };

  let teamName: string | null;
  try {
    teamName = await getSupportName(admin.userId);
  } catch (error) {
    console.error(`[support] reply ${id}: could not read the signature: ${describe(error)}`);
    return { error: "Could not send. Nothing was sent." };
  }
  if (!teamName) return { error: "Set your signature name on Profile first; replies are signed with it." };

  try {
    await teamReply(id, body, teamName);
  } catch (error) {
    const raised = supportRaised(error);
    if (raised) return { error: SUPPORT_RAISED_MESSAGES[raised] };
    console.error(`[support] reply ${id} failed: ${describe(error)}`);
    return { error: "Could not send. Nothing was sent." };
  }

  const auditError = await auditSupport(admin, "support.reply", id);
  revalidate(id);
  return auditError
    ? { error: `Sent. ${auditError}`, sent: true }
    : { ok: "Sent. The user sees it in the app.", sent: true };
}

export async function changeStatus(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const id = idFrom(formData);
  const to = String(formData.get("status") ?? "");
  if (to !== "open" && to !== "closed") return { error: "Unknown status." };

  // Read first: a repeated click is a no-op and writes no audit entry.
  let thread;
  try {
    thread = await getThread(id);
  } catch (error) {
    console.error(`[support] status ${id}: could not read the thread: ${describe(error)}`);
    return { error: "Could not change the status. Nothing was changed." };
  }
  if (!thread) return { error: "This conversation no longer exists." };
  if (to === "closed" && thread.status === "closed") return { ok: "Already closed." };
  if (to === "open" && thread.status !== "closed") return { ok: "Already open." };

  try {
    await setThreadStatus(id, to);
  } catch (error) {
    const raised = supportRaised(error);
    if (raised) return { error: SUPPORT_RAISED_MESSAGES[raised] };
    console.error(`[support] status ${id} -> ${to} failed: ${describe(error)}`);
    return { error: "Could not change the status. Nothing was changed." };
  }

  const auditError = await auditSupport(admin, to === "closed" ? "support.close" : "support.reopen", id);
  revalidate(id);
  if (auditError) return { error: auditError };
  return {
    ok: to === "closed" ? "Closed. The user can start a new conversation." : "Reopened: waiting for us again.",
  };
}
