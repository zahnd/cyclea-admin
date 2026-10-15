"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/dal";
import { saveSettings } from "@/lib/notifications/settings";
import {
  isNotificationMode,
  NOTIFICATION_KINDS,
  type NotificationSettings,
} from "@/lib/notifications/validation";

export type FormState = { error?: string; ok?: string };

/** The signed-in admin's own notification settings. Nobody sets another admin's. */
export async function updateNotificationSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();

  const settings = {} as NotificationSettings;
  for (const kind of NOTIFICATION_KINDS) {
    const mode = String(formData.get(kind) ?? "");
    if (!isNotificationMode(mode)) return { error: "Choose a setting from the list for each kind." };
    settings[kind] = mode;
  }

  let changed: boolean;
  try {
    changed = await saveSettings(admin.userId, settings, { id: admin.userId, label: admin.email });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // set_notification_settings (0012): someone must hear about reports.
    if (message.includes("user_report_needs_one_immediate")) {
      return {
        error:
          "At least one admin must get user reports immediately — Apple requires reports to reach a person (guideline 1.2). Another admin has to switch theirs on first.",
      };
    }
    console.error(`[notifications] settings of ${admin.userId} failed: ${message}`);
    return { error: "Could not save. Nothing was changed." };
  }

  revalidatePath("/admin/account/notifications");
  return { ok: changed ? "Saved." : "No change." };
}
