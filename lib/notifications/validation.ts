// Shared by the settings form and its server action. No server-only import:
// the kinds and modes are not secret, and the form shows them.

/** What an admin can be told about (notification_settings_kind_check, migrations 0011, 0012 and 0014). */
export const NOTIFICATION_KINDS = ["user_report", "support", "app_feedback", "content_feedback"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  user_report: "User reports",
  support: "Support messages",
  app_feedback: "App feedback",
  content_feedback: "Content notes",
};

export const NOTIFICATION_KIND_HINTS: Record<NotificationKind, string> = {
  user_report:
    "Abuse reports from the app, and one reminder for a report still new after 24 hours. At least one admin must get them immediately.",
  support:
    "A user wrote to the team: a new conversation or a follow-up. Set to Immediately, also one reminder for a conversation still waiting 24 hours after the user's last message.",
  app_feedback: "Sent from the app (shake, or Settings → Send feedback). Manual entries never notify.",
  content_feedback: "A rating with a new or changed note. Bare thumbs never notify.",
};

export function isNotificationKind(value: string): value is NotificationKind {
  return (NOTIFICATION_KINDS as readonly string[]).includes(value);
}

/** No row in notification_settings means "immediate". */
export const NOTIFICATION_MODES = ["immediate", "daily", "off"] as const;
export type NotificationMode = (typeof NOTIFICATION_MODES)[number];
export const DEFAULT_NOTIFICATION_MODE: NotificationMode = "immediate";

export const NOTIFICATION_MODE_LABELS: Record<NotificationMode, string> = {
  immediate: "Immediately",
  daily: "Daily at 08:00",
  off: "Off",
};

export function isNotificationMode(value: string): value is NotificationMode {
  return (NOTIFICATION_MODES as readonly string[]).includes(value);
}

export type NotificationSettings = Record<NotificationKind, NotificationMode>;
