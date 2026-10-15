import "server-only";

import { adminDb } from "@/lib/db/admin";
import type { FeedbackActor } from "@/lib/feedback/data";

import {
  DEFAULT_NOTIFICATION_MODE,
  isNotificationKind,
  NOTIFICATION_KINDS,
  type NotificationKind,
  type NotificationMode,
  type NotificationSettings,
} from "./validation";

type SettingsRow = { admin_id: string; kind: string; mode: NotificationMode };

export function defaultSettings(): NotificationSettings {
  return Object.fromEntries(NOTIFICATION_KINDS.map((kind) => [kind, DEFAULT_NOTIFICATION_MODE])) as NotificationSettings;
}

/** Every admin's effective settings, defaults filled in, keyed by admin id. */
export async function allSettings(adminIds: string[]): Promise<Map<string, NotificationSettings>> {
  const { data, error } = await adminDb().from("notification_settings").select("admin_id, kind, mode");
  if (error) throw new Error(`notification settings: ${error.message}`);
  const byAdmin = new Map(adminIds.map((id) => [id, defaultSettings()]));
  for (const row of data as SettingsRow[]) {
    const settings = byAdmin.get(row.admin_id);
    if (settings && isNotificationKind(row.kind)) settings[row.kind as NotificationKind] = row.mode;
  }
  return byAdmin;
}

/** One admin's effective settings. */
export async function getSettings(adminId: string): Promise<NotificationSettings> {
  return (await allSettings([adminId])).get(adminId) ?? defaultSettings();
}

/**
 * Saves an admin's choices and writes the audit entry, in one transaction
 * (set_notification_settings, migration 0011). Returns whether anything changed.
 */
export async function saveSettings(
  adminId: string,
  settings: Partial<NotificationSettings>,
  actor: FeedbackActor,
): Promise<boolean> {
  const { data, error } = await adminDb().rpc("set_notification_settings", {
    p_admin_id: adminId,
    p_settings: settings,
    p_actor_id: actor.id,
    p_actor_label: actor.label,
  });
  if (error) throw new Error(`set_notification_settings: ${error.message}`);
  return data === true;
}
