import "server-only";

import { adminDb } from "@/lib/db/admin";
import { appDbAsAdminPortal } from "@/lib/db/app";

import type {
  FeedbackCategory,
  FeedbackKind,
  FeedbackSource,
  FeedbackStatus,
  ManualSource,
  Platform,
} from "./validation";

// Feedback about the app comes from two places, joined here:
//
//   * sent from the app (shake, or Settings → Send feedback) -- the app
//     project's app_feedback_admin view (app migration 0066): no user id, no
//     screenshot path. Never copied into this project.
//   * entered by an admin (WhatsApp, in person, email) -- manual_feedback in
//     this project (0008): no identity, only the channel.
//
// What we decided about either is feedback_triage (0008), keyed by kind and
// id; no row means new. Content feedback has its own readers (content.ts);
// triage is shared. The later MCP tools read and write through these
// functions too.

/** The list shows at most this many per source, newest first; the page says so when it is hit. */
export const FEEDBACK_LIST_LIMIT = 1000;

/**
 * The app project, for the screenshot link. The screenshot never reaches this
 * host: it can show cycle data (app migration 0043), so it is opened in the
 * Supabase dashboard, behind a Supabase login.
 */
const APP_PROJECT_REF = "zekaahjqdynuhjmgkpqf";

export type Feedback = {
  kind: FeedbackKind;
  id: string;
  source: FeedbackSource;
  /** Sent from the app: when it arrived. Manual: the day it was said, as midnight UTC. */
  receivedAt: string;
  /** True for manual entries, whose date has no time of day. */
  dateOnly: boolean;
  category: FeedbackCategory;
  /** What the user wrote, or what an admin noted down. Can mention health details. */
  message: string;
  appVersion: string | null;
  platform: string | null;
  osVersion: string | null;
  locale: string | null;
  /** The tab the user was on, e.g. `planner`. Only from the app. */
  screen: string | null;
  hasScreenshot: boolean;
  /** A manual entry's image (0009), shown through /admin/feedback/app/<id>/image. Always false from the app. */
  hasImage: boolean;
  /** Changes when the image is replaced, to tell the browser it is a new one; null without an image. */
  imageVersion: string | null;
  /** Who typed in a manual entry, and when; null for feedback sent from the app. */
  enteredBy: string | null;
  enteredAt: string | null;
  status: FeedbackStatus;
  note: string | null;
  link: string | null;
  /** When and by whom it was last triaged; null while it has never been. */
  triagedAt: string | null;
  triagedBy: string | null;
};

type AppRow = {
  id: string;
  created_at: Date;
  category: FeedbackCategory;
  message: string;
  app_version: string | null;
  platform: string | null;
  os_version: string | null;
  locale: string | null;
  screen: string | null;
  has_screenshot: boolean;
};

type ManualRow = {
  id: string;
  source: ManualSource;
  category: FeedbackCategory;
  message: string;
  received_on: string;
  app_version: string | null;
  platform: Platform | null;
  image_path: string | null;
  created_at: string;
  created_by_label: string;
};

type TriageRow = {
  kind: FeedbackKind;
  feedback_id: string;
  status: FeedbackStatus;
  note: string | null;
  link: string | null;
  updated_at: string;
  updated_by_label: string;
};

const APP_COLUMNS =
  "id, created_at, category, message, app_version, platform, os_version, locale, screen, has_screenshot";
const MANUAL_COLUMNS =
  "id, source, category, message, received_on, app_version, platform, image_path, created_at, created_by_label";
const TRIAGE_COLUMNS = "kind, feedback_id, status, note, link, updated_at, updated_by_label";

function withTriage(triage: TriageRow | undefined) {
  return {
    status: triage?.status ?? ("new" as const),
    note: triage?.note ?? null,
    link: triage?.link ?? null,
    triagedAt: triage?.updated_at ?? null,
    triagedBy: triage?.updated_by_label ?? null,
  };
}

function fromApp(row: AppRow, triage: TriageRow | undefined): Feedback {
  return {
    kind: "app",
    id: row.id,
    source: "in_app",
    receivedAt: row.created_at.toISOString(),
    dateOnly: false,
    category: row.category,
    message: row.message,
    appVersion: row.app_version,
    platform: row.platform,
    osVersion: row.os_version,
    locale: row.locale,
    screen: row.screen,
    hasScreenshot: row.has_screenshot,
    hasImage: false,
    imageVersion: null,
    enteredBy: null,
    enteredAt: null,
    ...withTriage(triage),
  };
}

function fromManual(row: ManualRow, triage: TriageRow | undefined): Feedback {
  return {
    kind: "manual",
    id: row.id,
    source: row.source,
    receivedAt: `${row.received_on}T00:00:00.000Z`,
    dateOnly: true,
    category: row.category,
    message: row.message,
    appVersion: row.app_version,
    platform: row.platform,
    osVersion: null,
    locale: null,
    screen: null,
    hasScreenshot: false,
    hasImage: row.image_path !== null,
    // The object's random name, never the entry id again.
    imageVersion: row.image_path?.split("/")[1]?.replace(/\.webp$/, "") ?? null,
    enteredBy: row.created_by_label,
    enteredAt: row.created_at,
    ...withTriage(triage),
  };
}

const triageKey = (kind: FeedbackKind, id: string) => `${kind}:${id}`;

/** Everything about the app, from both sources, newest first. */
export async function listAppFeedback(): Promise<Feedback[]> {
  // Triage rows are read whole and matched in memory. Rows whose feedback was
  // deleted with its account just never match. Like every select through
  // PostgREST, the admin-side reads stop at 1000 rows -- far beyond anything
  // entered or triaged so far.
  const [app, manual, triage] = await Promise.all([
    appDbAsAdminPortal().query<AppRow>(
      `SELECT ${APP_COLUMNS} FROM public.app_feedback_admin ORDER BY created_at DESC LIMIT $1`,
      [FEEDBACK_LIST_LIMIT],
    ),
    adminDb()
      .from("manual_feedback")
      .select(MANUAL_COLUMNS)
      .eq("about", "app")
      .order("received_on", { ascending: false })
      .limit(FEEDBACK_LIST_LIMIT),
    adminDb().from("feedback_triage").select(TRIAGE_COLUMNS),
  ]);
  if (manual.error) throw new Error(`manual feedback: ${manual.error.message}`);
  if (triage.error) throw new Error(`feedback triage: ${triage.error.message}`);
  const byKey = new Map((triage.data as TriageRow[]).map((row) => [triageKey(row.kind, row.feedback_id), row]));
  return [
    ...app.rows.map((row) => fromApp(row, byKey.get(triageKey("app", row.id)))),
    ...(manual.data as ManualRow[]).map((row) => fromManual(row, byKey.get(triageKey("manual", row.id)))),
  ].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

/**
 * One item about the app, from whichever source holds it, or null when it is
 * gone (feedback from the app is deleted with its account).
 */
export async function getAppFeedback(id: string): Promise<Feedback | null> {
  const [app, manual, triage] = await Promise.all([
    appDbAsAdminPortal().query<AppRow>(`SELECT ${APP_COLUMNS} FROM public.app_feedback_admin WHERE id = $1`, [id]),
    adminDb().from("manual_feedback").select(MANUAL_COLUMNS).eq("id", id).eq("about", "app").maybeSingle(),
    adminDb().from("feedback_triage").select(TRIAGE_COLUMNS).eq("feedback_id", id),
  ]);
  if (manual.error) throw new Error(`manual feedback: ${manual.error.message}`);
  if (triage.error) throw new Error(`feedback triage: ${triage.error.message}`);
  const rows = triage.data as TriageRow[];
  if (app.rows[0]) return fromApp(app.rows[0], rows.find((row) => row.kind === "app"));
  if (manual.data) return fromManual(manual.data as ManualRow, rows.find((row) => row.kind === "manual"));
  return null;
}

/** The ids of all feedback about the app that still exists -- without the messages. */
export async function listAppFeedbackIds(): Promise<{ kind: FeedbackKind; id: string }[]> {
  const [app, manual] = await Promise.all([
    appDbAsAdminPortal().query<{ id: string }>("SELECT id FROM public.app_feedback_admin"),
    adminDb().from("manual_feedback").select("id").eq("about", "app"),
  ]);
  if (manual.error) throw new Error(`manual feedback: ${manual.error.message}`);
  return [
    ...app.rows.map((row) => ({ kind: "app" as const, id: row.id })),
    ...(manual.data as { id: string }[]).map((row) => ({ kind: "manual" as const, id: row.id })),
  ];
}

/** How many items about the app nobody has triaged yet (no row, or set back to new). */
export async function countNewAppFeedback(): Promise<number> {
  const [items, triaged] = await Promise.all([
    listAppFeedbackIds(),
    adminDb().from("feedback_triage").select("kind, feedback_id").neq("status", "new"),
  ]);
  if (triaged.error) throw new Error(`feedback triage: ${triaged.error.message}`);
  const done = new Set(
    (triaged.data as { kind: FeedbackKind; feedback_id: string }[]).map((row) => triageKey(row.kind, row.feedback_id)),
  );
  return items.filter((item) => !done.has(triageKey(item.kind, item.id))).length;
}

/** Who is acting: an admin, or later an agent acting for one (audit_log's rules). */
export type FeedbackActor = { id: string | null; label: string };

export type ManualInput = {
  /** Null to create. */
  id: string | null;
  source: ManualSource;
  category: FeedbackCategory;
  message: string;
  receivedOn: string;
  appVersion: string;
  platform: Platform | null;
};

/**
 * Creates or edits a manual entry and writes the audit entry, in one
 * transaction (save_manual_feedback, migration 0008). Returns its id.
 * Callers validate first; the database refuses what slips through.
 */
export async function saveManualFeedback(input: ManualInput, actor: FeedbackActor): Promise<string> {
  const { data, error } = await adminDb().rpc("save_manual_feedback", {
    p_id: input.id,
    p_source: input.source,
    p_category: input.category,
    p_message: input.message,
    p_received_on: input.receivedOn,
    p_app_version: input.appVersion,
    p_platform: input.platform,
    p_actor_id: actor.id,
    p_actor_label: actor.label,
  });
  if (error) throw new Error(`save_manual_feedback: ${error.message}`);
  return data as string;
}

export type TriageInput = {
  kind: FeedbackKind;
  feedbackId: string;
  status: FeedbackStatus;
  note: string;
  link: string;
};

/**
 * Saves status, note and link and writes the audit entry, in one transaction
 * (set_feedback_triage, migration 0008). Returns whether anything changed.
 * Callers validate first; the database refuses what slips through.
 */
export async function setFeedbackTriage(input: TriageInput, actor: FeedbackActor): Promise<boolean> {
  const { data, error } = await adminDb().rpc("set_feedback_triage", {
    p_kind: input.kind,
    p_feedback_id: input.feedbackId,
    p_status: input.status,
    p_note: input.note,
    p_link: input.link,
    p_actor_id: actor.id,
    p_actor_label: actor.label,
  });
  if (error) throw new Error(`set_feedback_triage: ${error.message}`);
  return data === true;
}

/**
 * The screenshot in the Supabase dashboard's storage browser. Screenshots are
 * stored as `<id>.png` (app migration 0043). The `?preview=` format is
 * undocumented Studio behaviour, as in the app's former Slack message; if it
 * changes, the link opens the bucket instead.
 */
export function screenshotDashboardUrl(id: string): string {
  return `https://supabase.com/dashboard/project/${APP_PROJECT_REF}/storage/buckets/app-feedback?preview=${encodeURIComponent(`${id}.png`)}`;
}
