import "server-only";

import { adminDb } from "@/lib/db/admin";
import { appDbAsAdminPortal } from "@/lib/db/app";
import type { ContentKind, FeedbackCategory } from "@/lib/feedback/validation";

import { buildNotice, sendNotice, type NoticeItems } from "./email";
import { allSettings } from "./settings";
import type { NotificationKind, NotificationSettings } from "./validation";

// The 5-minute sweep (migration 0011): called by pg_cron through
// /api/notifications/sweep. It finds what each admin has not been told about
// yet, sends at most one email per admin and kind of email (now, or the daily
// digest), and records what it sent -- so a sweep that finds nothing new sends
// nothing, and every item reaches every admin once.

/** How far back a sweep looks; never further than the feature's launch. */
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const DIGEST_HOUR = 8;
const DIGEST_ZONE = "Europe/Zurich";

type Item = {
  kind: NotificationKind;
  id: string;
  /** created_at, or for a content note the time it last changed. ISO. */
  version: string;
} & (
  | { kind: "app_feedback"; category: FeedbackCategory }
  | { kind: "content_feedback"; contentKind: ContentKind; directusId: number; title: string | null }
);

type DeliveryRow = { admin_id: string; kind: NotificationKind; item_id: string; item_version: string; mode: string };

export type SweepResult =
  | { skipped: "locked" }
  | { admins: number; items: number; emails: number; failures: number };

const key = (kind: string, id: string, version: string) => `${kind}:${id}:${Date.parse(version)}`;

/** Today's 08:00 in Zürich, as an instant. */
export function digestTimeToday(now: Date): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: DIGEST_ZONE }).format(now);
  const naive = Date.parse(`${ymd}T${String(DIGEST_HOUR).padStart(2, "0")}:00:00Z`);
  // The zone's offset around that hour ("GMT+02:00"), applied backwards.
  const name = new Intl.DateTimeFormat("en-US", { timeZone: DIGEST_ZONE, timeZoneName: "longOffset" })
    .formatToParts(new Date(naive))
    .find((part) => part.type === "timeZoneName")?.value;
  const match = name?.match(/GMT([+-])(\d{2}):(\d{2})/);
  const offsetMs = match ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) * 60_000 : 0;
  return new Date(naive - offsetMs);
}

async function newItems(since: Date): Promise<Item[]> {
  const app = appDbAsAdminPortal();
  const [feedback, notes] = await Promise.all([
    app.query<{ id: string; created_at: Date; category: FeedbackCategory }>(
      "SELECT id, created_at, category FROM public.app_feedback_admin WHERE created_at > $1",
      [since],
    ),
    // Bare thumbs never notify: only ratings whose note is new or changed.
    app.query<{ id: string; note_changed_at: Date; content_kind: ContentKind; directus_id: string; content_title: string | null }>(
      `SELECT id, note_changed_at, content_kind, directus_id, content_title
       FROM public.content_feedback_admin
       WHERE note IS NOT NULL AND note_changed_at > $1`,
      [since],
    ),
  ]);
  return [
    ...feedback.rows.map((row) => ({
      kind: "app_feedback" as const,
      id: row.id,
      version: row.created_at.toISOString(),
      category: row.category,
    })),
    ...notes.rows.map((row) => ({
      kind: "content_feedback" as const,
      id: row.id,
      version: row.note_changed_at.toISOString(),
      contentKind: row.content_kind,
      directusId: Number(row.directus_id),
      title: row.content_title,
    })),
  ];
}

async function adminEmails(): Promise<{ id: string; email: string }[]> {
  const { data, error } = await adminDb().from("admins").select("user_id");
  if (error) throw new Error(`admins: ${error.message}`);
  // A handful of admins: one lookup each.
  const users = await Promise.all(
    (data as { user_id: string }[]).map(async ({ user_id }) => {
      const { data: user } = await adminDb().auth.admin.getUserById(user_id);
      return user.user?.email ? { id: user_id, email: user.user.email } : null;
    }),
  );
  return users.filter((user) => user !== null);
}

function toNotice(items: Item[]): NoticeItems {
  const notice: NoticeItems = { appFeedback: [], contentNotes: [] };
  for (const item of items) {
    if (item.kind === "app_feedback") notice.appFeedback.push({ category: item.category });
    else notice.contentNotes.push({ contentKind: item.contentKind, directusId: item.directusId, title: item.title });
  }
  return notice;
}

async function record(adminId: string, items: Item[], mode: "immediate" | "daily", digest: boolean): Promise<void> {
  const { error } = await adminDb().rpc("record_notification_deliveries", {
    p_rows: items.map((item) => ({
      admin_id: adminId,
      kind: item.kind,
      item_id: item.id,
      item_version: item.version,
      mode,
    })),
    p_digest_admin_id: digest ? adminId : null,
  });
  if (error) throw new Error(`record_notification_deliveries: ${error.message}`);
}

export async function runSweep(now: Date = new Date()): Promise<SweepResult> {
  const { data: launched, error: claimError } = await adminDb().rpc("claim_notification_sweep");
  if (claimError) throw new Error(`claim_notification_sweep: ${claimError.message}`);
  if (!launched) return { skipped: "locked" };

  try {
    const since = new Date(Math.max(Date.parse(launched as string), now.getTime() - LOOKBACK_MS));
    const [items, admins, deliveries, digests] = await Promise.all([
      newItems(since),
      adminEmails(),
      adminDb()
        .from("notification_deliveries")
        .select("admin_id, kind, item_id, item_version, mode")
        .gte("item_version", since.toISOString()),
      adminDb().from("notification_digests").select("admin_id, last_sent_at"),
    ]);
    if (deliveries.error) throw new Error(`notification deliveries: ${deliveries.error.message}`);
    if (digests.error) throw new Error(`notification digests: ${digests.error.message}`);
    const settings = await allSettings(admins.map((admin) => admin.id));

    // What each admin was already told, in any mode but a reminder.
    const told = new Map<string, Set<string>>();
    for (const row of deliveries.data as DeliveryRow[]) {
      if (row.mode === "reminder") continue;
      if (!told.has(row.admin_id)) told.set(row.admin_id, new Set());
      told.get(row.admin_id)!.add(key(row.kind, row.item_id, row.item_version));
    }
    const lastDigest = new Map(
      (digests.data as { admin_id: string; last_sent_at: string }[]).map((row) => [row.admin_id, Date.parse(row.last_sent_at)]),
    );
    const digestAt = digestTimeToday(now).getTime();

    let emails = 0;
    let failures = 0;
    for (const admin of admins) {
      const modes: NotificationSettings = settings.get(admin.id)!;
      const known = told.get(admin.id) ?? new Set<string>();
      const untold = items.filter((item) => !known.has(key(item.kind, item.id, item.version)));

      // Each admin on their own: one failing address must not hold up the rest.
      try {
        const immediate = untold.filter((item) => modes[item.kind] === "immediate");
        if (immediate.length > 0) {
          // Recorded only after Postmark accepted it: a failed send is retried
          // by the next sweep.
          await sendNotice(admin.email, buildNotice(toNotice(immediate), false));
          await record(admin.id, immediate, "immediate", false);
          emails += 1;
        }

        // The digest is due once a day, from 08:00 Zürich on. Due but empty:
        // only the time is recorded, so it is not reconsidered every 5 minutes.
        const wantsDigest = Object.values(modes).includes("daily");
        const last = lastDigest.get(admin.id) ?? Date.parse(launched as string);
        if (wantsDigest && now.getTime() >= digestAt && last < digestAt) {
          const daily = untold.filter((item) => modes[item.kind] === "daily");
          if (daily.length > 0) {
            await sendNotice(admin.email, buildNotice(toNotice(daily), true));
            emails += 1;
          }
          await record(admin.id, daily, "daily", true);
        }
      } catch (error) {
        failures += 1;
        // The address stays out of the log; the admin id identifies them.
        console.error(`[notifications] admin ${admin.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { admins: admins.length, items: items.length, emails, failures };
  } finally {
    const { error } = await adminDb().rpc("release_notification_sweep");
    if (error) console.error(`[notifications] release failed: ${error.message}`);
  }
}
