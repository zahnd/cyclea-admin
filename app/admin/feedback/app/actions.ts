"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/dal";
import { isIsoDate, isUuid } from "@/lib/creators/validation";
import { saveManualFeedback, setFeedbackTriage } from "@/lib/feedback/data";
import {
  APP_VERSION_MAX,
  isFeedbackCategory,
  isFeedbackKind,
  isFeedbackStatus,
  isHttpsUrl,
  isManualSource,
  isPlatform,
  LINK_MAX,
  MESSAGE_MAX,
  NOTE_MAX,
} from "@/lib/feedback/validation";

export type FormState = { error?: string; ok?: string };

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Status, note and link of one item. No step-up code: this is not a role or
 * account action, and requireAdmin() already demands an authenticator check
 * from the last 12 hours.
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

  let changed: boolean;
  try {
    changed = await setFeedbackTriage({ kind, feedbackId: id, status, note, link }, { id: admin.userId, label: admin.email });
  } catch (error) {
    console.error(`[feedback] triage ${kind} ${id} failed: ${message(error)}`);
    return { error: "Could not save. Nothing was changed." };
  }

  revalidatePath(`/admin/feedback/app/${id}`);
  revalidatePath("/admin/feedback/app");
  // The layout's New count, on every admin page.
  revalidatePath("/admin", "layout");
  return { ok: changed ? "Saved." : "No change." };
}

/**
 * Creates (no id) or edits a manual entry: feedback that reached us outside
 * the app. A new entry opens its own page, where it can be triaged.
 */
export async function saveManual(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();

  const rawId = String(formData.get("id") ?? "");
  if (rawId && !isUuid(rawId)) throw new Error("Invalid feedback id.");
  const id = rawId || null;

  const source = String(formData.get("source") ?? "");
  const category = String(formData.get("category") ?? "");
  const text = String(formData.get("message") ?? "").trim();
  const receivedOn = String(formData.get("received_on") ?? "").trim();
  const appVersion = String(formData.get("app_version") ?? "").trim();
  const platform = String(formData.get("platform") ?? "");

  if (!isManualSource(source)) return { error: "Choose where the feedback came from." };
  if (!isFeedbackCategory(category)) return { error: "Choose a category." };
  if (!text) return { error: "Write down what was said." };
  if (text.length > MESSAGE_MAX) return { error: `Keep it under ${MESSAGE_MAX} characters.` };
  if (!isIsoDate(receivedOn)) return { error: "Enter the day it was said." };
  if (appVersion.length > APP_VERSION_MAX) return { error: `Keep the app version under ${APP_VERSION_MAX} characters.` };
  if (platform && !isPlatform(platform)) return { error: "Choose a platform from the list." };
  const knownPlatform = platform && isPlatform(platform) ? platform : null;

  let savedId: string;
  try {
    savedId = await saveManualFeedback(
      { id, source, category, message: text, receivedOn, appVersion, platform: knownPlatform },
      { id: admin.userId, label: admin.email },
    );
  } catch (error) {
    console.error(`[feedback] save manual ${id ?? "(new)"} failed: ${message(error)}`);
    return { error: "Could not save. Nothing was changed." };
  }

  revalidatePath("/admin/feedback/app");
  revalidatePath("/admin", "layout");
  if (!id) redirect(`/admin/feedback/app/${savedId}`);
  revalidatePath(`/admin/feedback/app/${savedId}`);
  return { ok: "Saved." };
}
