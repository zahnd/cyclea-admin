"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/dal";
import { isIsoDate, isUuid } from "@/lib/creators/validation";
import { saveManualFeedback, setFeedbackTriage } from "@/lib/feedback/data";
import { ImageRejected, removeManualImage, sanitizeImage, setManualImage } from "@/lib/feedback/image";
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
 *
 * An image (optional, one per entry, migration 0009) is checked and
 * re-encoded BEFORE anything is saved, so a bad file refuses the whole save.
 * It is stored after the entry, because its path carries the entry's id; if
 * that step fails the entry stands without it, and the form says so.
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

  const upload = formData.get("image");
  const removeImage = formData.get("remove_image") === "1";
  let image: Buffer | null = null;
  if (upload instanceof File && upload.size > 0) {
    try {
      image = await sanitizeImage(upload);
    } catch (error) {
      if (error instanceof ImageRejected) return { error: error.message };
      console.error(`[feedback] image for manual ${id ?? "(new)"} failed: ${message(error)}`);
      return { error: "The image could not be processed. Nothing was saved." };
    }
  }

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

  const actor = { id: admin.userId, label: admin.email };
  let imageFailed = false;
  try {
    if (image) await setManualImage(savedId, image, actor);
    else if (removeImage && id) await removeManualImage(savedId, actor);
  } catch (error) {
    console.error(`[feedback] image of manual ${savedId} failed: ${message(error)}`);
    imageFailed = true;
  }

  revalidatePath("/admin/feedback/app");
  revalidatePath("/admin", "layout");
  // The entry's page says when its image could not be stored.
  if (!id) redirect(`/admin/feedback/app/${savedId}${imageFailed ? "?image=failed" : ""}`);
  revalidatePath(`/admin/feedback/app/${savedId}`);
  if (imageFailed) {
    return {
      error: image
        ? "The entry was saved, but the image could not be stored. Try adding it again."
        : "The entry was saved, but the image could not be removed. Try again.",
    };
  }
  return { ok: "Saved." };
}
