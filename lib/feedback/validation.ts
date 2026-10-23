// Shared by the triage form and its server action. No server-only import: the
// rules are not secret, and the form shows them.

/**
 * Where a feedback item is stored, which is what a triage row points into
 * (feedback_triage.kind, migrations 0008 and 0010): 'app' = sent from the app
 * (app project), 'manual' = entered here by an admin, 'content' = a rating of
 * CMS content (app project, content_feedback).
 */
export const FEEDBACK_KINDS = ["app", "manual", "content"] as const;
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

/**
 * "iOS 26.6" -- the platform's label where it is a known one, plus the OS
 * version if any. iOS reports it as "Version 26.6 (Build 23G71)"; `short`
 * keeps only the version number, for a list column.
 */
export function deviceLabel(
  platform: string | null,
  osVersion: string | null,
  { short = false }: { short?: boolean } = {},
): string | null {
  const name = platform && isPlatform(platform.toLowerCase()) ? PLATFORM_LABELS[platform.toLowerCase() as Platform] : platform;
  const version = short && osVersion ? (osVersion.match(/\d+(?:\.\d+)*/)?.[0] ?? osVersion) : osVersion;
  return [name, version].filter(Boolean).join(" ") || null;
}

/**
 * Triage states (migrations 0008, 0015). No triage row means "new".
 * "verification_pending": a fix shipped that we could not test ourselves,
 * waiting for the user or the data to confirm it.
 */
export const FEEDBACK_STATUSES = ["new", "in_progress", "verification_pending", "done", "wont_fix"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "New",
  in_progress: "In progress",
  verification_pending: "Verification pending",
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

/**
 * An image on a manual entry (migration 0009): what the form accepts before
 * the server re-encodes it. The bucket's own limit is the same 5 MB, and
 * next.config.ts lets a server action body be a little larger than this.
 */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

export function isHttpsUrl(value: string): boolean {
  return value.length <= LINK_MAX && /^https:\/\/\S+$/.test(value);
}

/**
 * What a content rating is about (content_feedback_kind_check, app migration
 * 0038). Journal prompts have no detail page, so no rating.
 */
export const CONTENT_KINDS = ["article", "yoga_class", "meditation", "recipe", "herbal_support"] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

export const CONTENT_KIND_LABELS: Record<ContentKind, string> = {
  article: "Article",
  yoga_class: "Yoga class",
  meditation: "Meditation",
  recipe: "Recipe",
  herbal_support: "Herbal support",
};

export function isContentKind(value: string): value is ContentKind {
  return (CONTENT_KINDS as readonly string[]).includes(value);
}

/**
 * The Directus collection per kind -- the same map as KINDS in the app's
 * content_feedback_sync, where the plural is irregular on purpose. A wrong
 * entry only breaks the "Open in Directus" link.
 */
const DIRECTUS_COLLECTIONS: Record<ContentKind, string> = {
  article: "articles",
  yoga_class: "yoga_classes",
  meditation: "meditations",
  recipe: "recipes",
  herbal_support: "herbal_support",
};

/** The item in the Directus editor; opening it needs a Directus login. */
export function directusItemUrl(kind: ContentKind, directusId: number): string {
  return `https://cyclea.directus.app/admin/content/${DIRECTUS_COLLECTIONS[kind]}/${directusId}`;
}

/** The title as it was when rated, or "Article #4" when the sync had none. */
export function contentLabel(kind: ContentKind, directusId: number, title: string | null): string {
  return title ?? `${CONTENT_KIND_LABELS[kind]} #${directusId}`;
}

/**
 * Ratings are stored 1-5 (app migration 0038): the app writes 1 (thumb down)
 * or 5 (thumb up); the range is open for a later star rating.
 */
export const RATING_DOWN = 1;
export const RATING_UP = 5;

export function ratingLabel(rating: number): string {
  if (rating === RATING_UP) return "Thumbs up";
  if (rating === RATING_DOWN) return "Thumbs down";
  return `Rating ${rating}`;
}
