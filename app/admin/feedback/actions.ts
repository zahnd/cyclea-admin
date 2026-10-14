"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/dal";
import { isUuid } from "@/lib/creators/validation";
import { getContentFeedback } from "@/lib/feedback/content";
import { setFeedbackTriage } from "@/lib/feedback/data";
import { isFeedbackKind, isFeedbackStatus, isHttpsUrl, LINK_MAX, NOTE_MAX } from "@/lib/feedback/validation";

export type FormState = { error?: string; ok?: string };

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Status, note and link of one item, of any kind. No step-up code: this is
 * not a role or account action, and requireAdmin() already demands an
 * authenticator check from the last 12 hours.
 */
export async function updateTriage(_prev: FormState, formData: FormData): Promise<FormState> {
  // Every server action checks for itself: a POST does not pass the layout.
  const admin = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const kind = String(formData.get("kind") ?? "");
  if (!isUuid(id) || !isFeedbackKind(kind)) throw new Error("Invalid feedback reference.");

  const status = String(formData.get("status") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const link = String(formData.get("link") ?? "").trim();

  if (!isFeedbackStatus(status)) return { error: "Choose a status from the list." };
  if (note.length > NOTE_MAX) return { error: `Keep the note under ${NOTE_MAX} characters.` };
  if (link && !isHttpsUrl(link)) {
    return { error: `The link must start with https:// and be at most ${LINK_MAX} characters.` };
  }

  // A bare thumb is not triaged. The user may have removed their note since
  // the page was loaded.
  if (kind === "content") {
    let rating;
    try {
      rating = await getContentFeedback(id);
    } catch (error) {
      console.error(`[feedback] triage content ${id}: could not read the rating: ${message(error)}`);
      return { error: "Could not save. Nothing was changed." };
    }
    if (!rating) return { error: "This rating no longer exists." };
    if (rating.note === null) return { error: "Only ratings with a note are triaged, and this one has none now." };
  }

  let changed: boolean;
  try {
    changed = await setFeedbackTriage({ kind, feedbackId: id, status, note, link }, { id: admin.userId, label: admin.email });
  } catch (error) {
    console.error(`[feedback] triage ${kind} ${id} failed: ${message(error)}`);
    return { error: "Could not save. Nothing was changed." };
  }

  if (kind === "content") {
    revalidatePath(`/admin/feedback/content/${id}`);
    revalidatePath("/admin/feedback/content", "layout");
  } else {
    revalidatePath(`/admin/feedback/app/${id}`);
    revalidatePath("/admin/feedback/app");
  }
  // The layout's New count, on every admin page.
  revalidatePath("/admin", "layout");
  return { ok: changed ? "Saved." : "No change." };
}
