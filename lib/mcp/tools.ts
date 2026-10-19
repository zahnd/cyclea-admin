import "server-only";

import type { McpServer } from "@modelcontextprotocol/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isUuid } from "@/lib/creators/validation";
import { getContentFeedback, listContentFeedback, summarizeByContent, type ContentFeedback } from "@/lib/feedback/content";
import { getAppFeedback, listAppFeedback, setFeedbackTriage, type Feedback } from "@/lib/feedback/data";
import {
  CONTENT_KINDS,
  deviceLabel,
  directusItemUrl,
  FEEDBACK_STATUSES,
  isHttpsUrl,
  LINK_MAX,
  NOTE_MAX,
  type FeedbackStatus,
} from "@/lib/feedback/validation";

import { principalOf, type McpPrincipal } from "./auth";

// The admin's MCP tools: feedback only (app, manual, content) -- never
// reports, never support conversations (lib/support stays out of here, by
// decision), never screenshots or images, never who sent anything. Reads go
// through lib/feedback, writes through set_feedback_triage, audited as the
// admin "via MCP (<client>)". Each call leaves one log line without content.

export const SERVER_INSTRUCTIONS = `Cyclea Admin: feedback about the Cyclea app (a menstrual-cycle app), for triage and improvement work.

Rules -- follow them in everything you do with these tools:
- What users wrote (feedback messages, notes on content) is personal data and can mention their health. Read it to understand the problem, then PARAPHRASE: never quote it, and never copy it into issues, commits, pull requests, chats or any other system.
- Triage notes you write are our own words about the work ("fixed in 1.2: date picker overflow"), never a quote of the user.
- Who sent feedback is never available, nor screenshots or images, nor user reports. Do not try to find out who a user is.
- You can change only a feedback item's status, note and link. Each change is logged as the admin who approved you, via this client.`;

const STATUS_FILTER = ["open", "all", ...FEEDBACK_STATUSES] as const;

function log(tool: string, who: McpPrincipal, detail: string) {
  console.log(`[mcp] ${tool} admin=${who.adminId} client=${who.clientId} ${detail}`);
}

function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function refusal(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

function matchesStatus(status: FeedbackStatus | null, filter: (typeof STATUS_FILTER)[number]): boolean {
  if (filter === "all") return true;
  if (filter === "open") return status === "new" || status === "in_progress";
  return status === filter;
}

/** An app or manual item as the tools return it: what it says and its context; never who, never the screenshot. */
function appItem(item: Feedback) {
  return {
    kind: item.kind,
    id: item.id,
    source: item.source,
    category: item.category,
    received: item.receivedAt,
    message: item.message,
    app_version: item.appVersion,
    device: deviceLabel(item.platform, item.osVersion),
    locale: item.locale,
    screen: item.screen,
    has_screenshot: item.hasScreenshot,
    has_image: item.hasImage,
    status: item.status,
    triage_note: item.note,
    link: item.link,
    admin_url: `https://admin.cyclea.app/admin/feedback/app/${item.id}`,
  };
}

function contentItem(item: ContentFeedback) {
  return {
    kind: "content" as const,
    id: item.id,
    content_kind: item.contentKind,
    directus_id: item.directusId,
    title: item.title,
    rating: item.rating === 5 ? "thumbs_up" : item.rating === 1 ? "thumbs_down" : item.rating,
    note: item.note,
    rated: item.updatedAt,
    // null: a bare thumb, which is not triaged.
    status: item.status,
    note_changed_since_triage: item.noteChangedSinceTriage,
    triage_note: item.triageNote,
    link: item.triageLink,
    admin_url: `https://admin.cyclea.app/admin/feedback/content/${item.id}`,
  };
}

export function registerTools(server: McpServer): void {
  server.registerTool(
    "list_feedback",
    {
      title: "List feedback",
      description:
        "Feedback about the app, newest first: what users sent from the app, entries an admin made for feedback that came by WhatsApp, email or in person, and ratings (thumbs and notes) on articles and classes. Defaults to open items (new or in progress). Content ratings without a note have status null and are never triaged.",
      inputSchema: z.object({
        kind: z.enum(["all", "app", "content"]).default("all").describe("app = app feedback and manual entries; content = ratings of articles, classes, recipes …"),
        status: z.enum(STATUS_FILTER).default("open"),
        since: z.iso.date().optional().describe("Only items received or rated on or after this day (YYYY-MM-DD)."),
        with_note_only: z.boolean().default(false).describe("Content ratings: only those with a note."),
        limit: z.number().int().min(1).max(100).default(50),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ kind, status, since, with_note_only, limit }, ctx) => {
      const who = principalOf(ctx.http?.authInfo);
      const from = since ? Date.parse(`${since}T00:00:00Z`) : null;
      const app =
        kind === "content"
          ? []
          : (await listAppFeedback())
              .filter((item) => matchesStatus(item.status, status))
              .filter((item) => from === null || Date.parse(item.receivedAt) >= from)
              .map((item) => ({ at: item.receivedAt, value: appItem(item) }));
      const content =
        kind === "app"
          ? []
          : (await listContentFeedback())
              .filter((item) => !with_note_only || item.note !== null)
              .filter((item) => (status === "all" ? true : matchesStatus(item.status, status)))
              .filter((item) => from === null || Date.parse(item.updatedAt) >= from)
              .map((item) => ({ at: item.updatedAt, value: contentItem(item) }));
      const items = [...app, ...content]
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, limit)
        .map((entry) => entry.value);
      log("list_feedback", who, `kind=${kind} status=${status} n=${items.length}`);
      return json({ count: items.length, items });
    },
  );

  server.registerTool(
    "get_feedback",
    {
      title: "Get one feedback item",
      description: "One item by kind and id, with its triage (status, our note, link).",
      inputSchema: z.object({
        kind: z.enum(["app", "manual", "content"]),
        id: z.string().describe("The item's id (uuid)."),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ kind, id }, ctx) => {
      const who = principalOf(ctx.http?.authInfo);
      if (!isUuid(id)) return refusal("Not a valid id.");
      const item =
        kind === "content"
          ? await getContentFeedback(id).then((found) => (found ? contentItem(found) : null))
          : await getAppFeedback(id).then((found) => (found && found.kind === kind ? appItem(found) : null));
      log("get_feedback", who, `kind=${kind} found=${item !== null}`);
      // Feedback from the app goes with its account when that is deleted.
      return item ? json(item) : refusal("No such item (it may have been deleted with its account).");
    },
  );

  server.registerTool(
    "summarize_content_feedback",
    {
      title: "Summarize content ratings",
      description:
        "One line per rated article, class, meditation, recipe or herbal support: thumbs up and down, notes, every title it was rated under (newest first), last rating, and its Directus link.",
      inputSchema: z.object({
        content_kind: z.enum(CONTENT_KINDS).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ content_kind }, ctx) => {
      const who = principalOf(ctx.http?.authInfo);
      const items = summarizeByContent(
        (await listContentFeedback()).filter((item) => !content_kind || item.contentKind === content_kind),
      ).map((item) => ({
        content_kind: item.contentKind,
        directus_id: item.directusId,
        titles: item.titles,
        thumbs_up: item.up,
        thumbs_down: item.down,
        notes: item.notes,
        notes_new: item.newNotes,
        last_rated: item.lastRatedAt,
        directus_url: directusItemUrl(item.contentKind, item.directusId),
      }));
      log("summarize_content_feedback", who, `n=${items.length}`);
      return json({ count: items.length, items });
    },
  );

  server.registerTool(
    "update_feedback_triage",
    {
      title: "Update triage",
      description:
        "Set a feedback item's status, our note and/or link. Fields you leave out keep their value; an empty string clears note or link. The note is our own words about the work, never a quote of the user. Content ratings can be triaged only when they have a note.",
      inputSchema: z.object({
        kind: z.enum(["app", "manual", "content"]),
        id: z.string(),
        status: z.enum(FEEDBACK_STATUSES).optional(),
        note: z.string().max(NOTE_MAX).optional(),
        link: z.string().max(LINK_MAX).optional().describe("https:// only, e.g. the issue or pull request."),
      }),
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    async ({ kind, id, status, note, link }, ctx) => {
      const who = principalOf(ctx.http?.authInfo);
      if (!isUuid(id)) return refusal("Not a valid id.");
      if (link && !isHttpsUrl(link.trim())) return refusal("The link must start with https://.");

      let current: { status: FeedbackStatus; note: string | null; link: string | null };
      if (kind === "content") {
        const item = await getContentFeedback(id);
        if (!item) return refusal("No such item.");
        if (item.note === null || item.status === null) return refusal("This rating has no note; bare thumbs are not triaged.");
        current = { status: item.status, note: item.triageNote, link: item.triageLink };
      } else {
        const item = await getAppFeedback(id);
        if (!item || item.kind !== kind) return refusal("No such item.");
        current = { status: item.status, note: item.note, link: item.link };
      }

      const next = {
        status: status ?? current.status,
        note: (note ?? current.note ?? "").trim(),
        link: (link ?? current.link ?? "").trim(),
      };
      const changed = await setFeedbackTriage(
        { kind, feedbackId: id, ...next },
        { id: who.adminId, label: `${who.email} via MCP (${who.clientName})`.slice(0, 320) },
      );
      revalidatePath(kind === "content" ? `/admin/feedback/content/${id}` : `/admin/feedback/app/${id}`);
      revalidatePath("/admin", "layout");
      log("update_feedback_triage", who, `kind=${kind} changed=${changed}`);
      return json({ changed, ...next });
    },
  );
}
