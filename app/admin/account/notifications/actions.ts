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
    console.error(`[notifications] settings of ${admin.userId} failed: ${error instanceof Error ? error.message : String(error)}`);
    return { error: "Could not save. Nothing was changed." };
  }

  revalidatePath("/admin/account/notifications");
  return { ok: changed ? "Saved." : "No change." };
}
