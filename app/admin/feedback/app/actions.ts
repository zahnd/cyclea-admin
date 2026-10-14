"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/dal";
import { isIsoDate, isUuid } from "@/lib/creators/validation";
import { saveManualFeedback } from "@/lib/feedback/data";
import { ImageRejected, removeManualImage, sanitizeImage, setManualImage } from "@/lib/feedback/image";
import {
  APP_VERSION_MAX,
  isFeedbackCategory,
  isManualSource,
  isPlatform,
  MESSAGE_MAX,
} from "@/lib/feedback/validation";

import type { FormState } from "../actions";

// The form state is shared with the triage form (../actions.ts).
export type { FormState };

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
