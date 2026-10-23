import "server-only";

import { adminDb } from "@/lib/db/admin";
import { appDbAsAdminPortal } from "@/lib/db/app";

import { FEEDBACK_LIST_LIMIT } from "./data";
import { RATING_DOWN, RATING_UP, type ContentKind, type FeedbackStatus } from "./validation";

// Content feedback: a thumb and an optional note on an article, class,
// meditation, recipe or herbal support (app migration 0038), read through the
// app project's content_feedback_admin view (0067): no user id. One row per
// user and item; the user can change it, never delete it, and it goes with
// their account. Never copied into this project -- the Directus mirror is the
// editors' copy, not ours.
//
// Only ratings WITH a note are triaged (feedback_triage, kind 'content',
// 0010): a bare thumb has nothing to act on and counts only in the summary.
// A triaged rating whose note changed afterwards counts as new again.

export type ContentFeedback = {
  id: string;
  contentKind: ContentKind;
  directusId: number;
  /** 1 = thumb down, 5 = thumb up; see ratingLabel(). */
  rating: number;
  /** What the user wrote. Can mention health details. */
  note: string | null;
  /** The item's title when last synced; null until the sync function stamped one. */
  title: string | null;
  createdAt: string;
  /** The last change of thumb or note (and of the sync stamp, seconds later). */
  updatedAt: string;
  noteChangedAt: string | null;
  /** Null for a bare thumb, which is not triaged. */
  status: FeedbackStatus | null;
  /** Triaged before, but the note changed since: shown as new again. */
  noteChangedSinceTriage: boolean;
  triageNote: string | null;
  triageLink: string | null;
  triageFixedIn: string | null;
  triagedAt: string | null;
  triagedBy: string | null;
};

type ContentRow = {
  id: string;
  content_kind: ContentKind;
  // bigint arrives from pg as a string.
  directus_id: string;
  rating: number;
  note: string | null;
  content_title: string | null;
  note_changed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type TriageRow = {
  feedback_id: string;
  status: FeedbackStatus;
  note: string | null;
  link: string | null;
  fixed_in: string | null;
  updated_at: string;
  updated_by_label: string;
};

const CONTENT_COLUMNS =
  "id, content_kind, directus_id, rating, note, content_title, note_changed_at, created_at, updated_at";
const TRIAGE_COLUMNS = "feedback_id, status, note, link, fixed_in, updated_at, updated_by_label";

function fromRow(row: ContentRow, triage: TriageRow | undefined): ContentFeedback {
  const noteChangedAt = row.note_changed_at?.toISOString() ?? null;
  // Compared as instants: one side comes from pg, the other from PostgREST.
  const noteChangedSinceTriage =
    row.note !== null &&
    triage !== undefined &&
    noteChangedAt !== null &&
    Date.parse(noteChangedAt) > Date.parse(triage.updated_at);

  let status: FeedbackStatus | null = null;
  if (row.note !== null) status = !triage || noteChangedSinceTriage ? "new" : triage.status;

  return {
    id: row.id,
    contentKind: row.content_kind,
    directusId: Number(row.directus_id),
    rating: row.rating,
    note: row.note,
    title: row.content_title,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    noteChangedAt,
    status,
    noteChangedSinceTriage,
    triageNote: triage?.note ?? null,
    triageLink: triage?.link ?? null,
    triageFixedIn: triage?.fixed_in ?? null,
    triagedAt: triage?.updated_at ?? null,
    triagedBy: triage?.updated_by_label ?? null,
  };
}

/** Every rating, last changed first, with its triage. */
export async function listContentFeedback(): Promise<ContentFeedback[]> {
  const [content, triage] = await Promise.all([
    appDbAsAdminPortal().query<ContentRow>(
      `SELECT ${CONTENT_COLUMNS} FROM public.content_feedback_admin ORDER BY updated_at DESC LIMIT $1`,
      [FEEDBACK_LIST_LIMIT],
    ),
    adminDb().from("feedback_triage").select(TRIAGE_COLUMNS).eq("kind", "content"),
  ]);
  if (triage.error) throw new Error(`feedback triage: ${triage.error.message}`);
  const byId = new Map((triage.data as TriageRow[]).map((row) => [row.feedback_id, row]));
  return content.rows.map((row) => fromRow(row, byId.get(row.id)));
}

/** One rating, or null when it is gone (deleted with its account). */
export async function getContentFeedback(id: string): Promise<ContentFeedback | null> {
  const [content, triage] = await Promise.all([
    appDbAsAdminPortal().query<ContentRow>(
      `SELECT ${CONTENT_COLUMNS} FROM public.content_feedback_admin WHERE id = $1`,
      [id],
    ),
    adminDb().from("feedback_triage").select(TRIAGE_COLUMNS).eq("kind", "content").eq("feedback_id", id).maybeSingle(),
  ]);
  if (triage.error) throw new Error(`feedback triage: ${triage.error.message}`);
  const row = content.rows[0];
  return row ? fromRow(row, (triage.data as TriageRow | null) ?? undefined) : null;
}

/** The ids of all ratings that still exist -- without the notes. */
export async function listContentFeedbackIds(): Promise<string[]> {
  const result = await appDbAsAdminPortal().query<{ id: string }>("SELECT id FROM public.content_feedback_admin");
  return result.rows.map((row) => row.id);
}

/** Ratings with a note that need a look: never triaged, set back to new, or note changed since. */
export async function countNewContentFeedback(): Promise<number> {
  return (await listContentFeedback()).filter((item) => item.status === "new").length;
}

export type ContentItemSummary = {
  /** `<kind>:<directus id>` -- the item's identity; titles are only labels. */
  key: string;
  contentKind: ContentKind;
  directusId: number;
  /** Every title its ratings were synced under, newest first. Empty when none was. */
  titles: string[];
  up: number;
  down: number;
  /** Ratings that are neither thumb (a later star rating); 0 today. */
  other: number;
  notes: number;
  /** Ratings with a note that count as new. */
  newNotes: number;
  lastRatedAt: string;
};

/**
 * One line per content item, grouped by (kind, Directus id) -- Directus ids
 * are per collection, and a renamed item must stay one item.
 */
export function summarizeByContent(ratings: ContentFeedback[]): ContentItemSummary[] {
  const byKey = new Map<string, ContentItemSummary & { titleSeen: Map<string, string> }>();
  for (const rating of ratings) {
    const key = `${rating.contentKind}:${rating.directusId}`;
    let item = byKey.get(key);
    if (!item) {
      item = {
        key,
        contentKind: rating.contentKind,
        directusId: rating.directusId,
        titles: [],
        up: 0,
        down: 0,
        other: 0,
        notes: 0,
        newNotes: 0,
        lastRatedAt: rating.updatedAt,
        titleSeen: new Map(),
      };
      byKey.set(key, item);
    }
    if (rating.rating === RATING_UP) item.up += 1;
    else if (rating.rating === RATING_DOWN) item.down += 1;
    else item.other += 1;
    if (rating.note !== null) item.notes += 1;
    if (rating.status === "new") item.newNotes += 1;
    if (rating.updatedAt > item.lastRatedAt) item.lastRatedAt = rating.updatedAt;
    if (rating.title !== null) {
      // The latest time each title was seen, to order them newest first.
      const seen = item.titleSeen.get(rating.title);
      if (!seen || rating.updatedAt > seen) item.titleSeen.set(rating.title, rating.updatedAt);
    }
  }
  return [...byKey.values()]
    .map(({ titleSeen, ...item }) => ({
      ...item,
      titles: [...titleSeen.entries()].sort((a, b) => b[1].localeCompare(a[1])).map(([title]) => title),
    }))
    .sort((a, b) => b.lastRatedAt.localeCompare(a.lastRatedAt));
}
