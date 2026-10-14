// Shared by the triage form and its server action. No server-only import: the
// rules are not secret, and the form shows them.

/**
 * Where a feedback item is stored, which is what a triage row points into
 * (feedback_triage.kind, migration 0008): 'app' = sent from the app (app
 * project), 'manual' = entered here by an admin. Content feedback adds its
 * own kind with its own task.
 */
export const FEEDBACK_KINDS = ["app", "manual"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export function isFeedbackKind(value: string): value is FeedbackKind {
  return (FEEDBACK_KINDS as readonly string[]).includes(value);
}

/**
 * The channel it came through. 'in_app' is everything sent from the app; the
 * rest are manual entries (manual_feedback_source_check). Never who.
 */
export const FEEDBACK_SOURCES = ["in_app", "whatsapp", "in_person", "email", "other"] as const;
export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];
export const MANUAL_SOURCES = ["whatsapp", "in_person", "email", "other"] as const;
export type ManualSource = (typeof MANUAL_SOURCES)[number];

export const FEEDBACK_SOURCE_LABELS: Record<FeedbackSource, string> = {
  in_app: "In app",
  whatsapp: "WhatsApp",
  in_person: "In person",
  email: "Email",
  other: "Other",
};

export function isManualSource(value: string): value is ManualSource {
  return (MANUAL_SOURCES as readonly string[]).includes(value);
}

/** Platforms a manual entry can name (manual_feedback_platform_check). */
export const PLATFORMS = ["ios", "android"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  ios: "iOS",
  android: "Android",
};

export function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

/** "iOS 18.1" -- the platform's label where it is a known one, plus the OS version if any. */
export function deviceLabel(platform: string | null, osVersion: string | null): string | null {
  const name = platform && isPlatform(platform.toLowerCase()) ? PLATFORM_LABELS[platform.toLowerCase() as Platform] : platform;
  return [name, osVersion].filter(Boolean).join(" ") || null;
}

/** Triage states (migration 0008). No triage row means "new". */
export const FEEDBACK_STATUSES = ["new", "in_progress", "done", "wont_fix"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "New",
  in_progress: "In progress",
  done: "Done",
  wont_fix: "Won't fix",
};

export function isFeedbackStatus(value: string): value is FeedbackStatus {
  return (FEEDBACK_STATUSES as readonly string[]).includes(value);
}

/** What the user picked in the app (app_feedback_category_ck, app migration 0043). */
export const FEEDBACK_CATEGORIES = ["bug", "idea", "other"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: "Bug",
  idea: "Idea",
  other: "Other",
};

export function isFeedbackCategory(value: string): value is FeedbackCategory {
  return (FEEDBACK_CATEGORIES as readonly string[]).includes(value);
}

/** Mirror the CHECKs in migration 0008, so the forms can say why before saving. */
export const NOTE_MAX = 2000;
export const LINK_MAX = 500;
export const MESSAGE_MAX = 4000;
export const APP_VERSION_MAX = 64;

export function isHttpsUrl(value: string): boolean {
  return value.length <= LINK_MAX && /^https:\/\/\S+$/.test(value);
}
