import "server-only";

import {
  CONTENT_KIND_LABELS,
  contentLabel,
  FEEDBACK_CATEGORY_LABELS,
  type ContentKind,
  type FeedbackCategory,
} from "@/lib/feedback/validation";
import { REPORT_REASON_LABELS, type ReportReason } from "@/lib/reports/validation";

// The notification email. It says WHAT arrived and links to the admin; it
// never carries what a user wrote -- no message, no note, no username (not
// even the reported account's). That
// stays behind sign-in and an authenticator. Content titles are editorial
// text and may appear.
//
// Sent through the Postmark server "Cyclea Admin" (POSTMARK_ADMIN_TOKEN), not
// the app's: that token cannot read the app server's sent mail -- password
// reset and confirmation links -- nor edit its templates, and can be revoked
// alone. It CAN send as any cyclea.app address (verified domains are
// account-wide); revoking it is the answer to a leak.

export const ADMIN_URL = "https://admin.cyclea.app";
const FROM = "Cyclea Admin <admin@cyclea.app>";

export type NoticeItems = {
  reports: { reason: ReportReason }[];
  appFeedback: { category: FeedbackCategory }[];
  contentNotes: { contentKind: ContentKind; directusId: number; title: string | null }[];
};

/** `reminder`: reports still new 24 hours after they arrived (sent once). */
export type NoticeVariant = "immediate" | "digest" | "reminder";

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Entity-escapes text for an HTML text node or quoted attribute, in one pass
 * (so nothing is escaped twice). Only editorial titles and our own wording
 * pass through here, never user text, and every URL is a constant; a
 * sanitizer library cleans markup rather than escaping text.
 */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]);
}

/** "1 bug, 2 ideas" -- labels and counts only. */
function summary<T extends string>(values: T[], labels: Record<T, string>): string {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].map(([value, n]) => `${n} ${labels[value].toLowerCase()}`).join(", ");
}

type Section = { heading: string; lines: string[]; link: string };

function sections(items: NoticeItems, variant: NoticeVariant): Section[] {
  const result: Section[] = [];
  if (items.reports.length > 0) {
    const what = variant === "reminder" ? plural(items.reports.length, "report", "reports") + " still new after 24 hours" : plural(items.reports.length, "new report", "new reports");
    result.push({
      heading: `${what} (${summary(items.reports.map((r) => r.reason), REPORT_REASON_LABELS)})`,
      lines: [],
      link: `${ADMIN_URL}/admin/reports`,
    });
  }
  if (items.appFeedback.length > 0) {
    result.push({
      heading: `${plural(items.appFeedback.length, "new app feedback", "new app feedback")} (${summary(items.appFeedback.map((f) => f.category), FEEDBACK_CATEGORY_LABELS)})`,
      lines: [],
      link: `${ADMIN_URL}/admin/feedback/app`,
    });
  }
  if (items.contentNotes.length > 0) {
    result.push({
      heading: plural(items.contentNotes.length, "content note", "content notes"),
      lines: items.contentNotes.map(
        (note) =>
          `“${contentLabel(note.contentKind, note.directusId, note.title)}” (${CONTENT_KIND_LABELS[note.contentKind]})`,
      ),
      link: `${ADMIN_URL}/admin/feedback/content`,
    });
  }
  return result;
}

export type Notice = { subject: string; text: string; html: string };

/** The email for one admin. */
export function buildNotice(items: NoticeItems, variant: NoticeVariant): Notice {
  const parts = sections(items, variant);
  const subject =
    (variant === "reminder" ? "Cyclea Admin reminder: " : "Cyclea Admin: ") +
    parts.map((part) => part.heading.replace(/ \(.*\)$/, "")).join(", ");
  const intro =
    variant === "digest"
      ? "Since yesterday's summary:"
      : variant === "reminder"
        ? "Not picked up yet:"
        : "New in the admin:";
  const footer = [
    "What users wrote stays in the admin; this email only says what arrived.",
    `Change these emails: ${ADMIN_URL}/admin/account/notifications`,
    "Replies to this address are not read.",
  ];

  const text = [
    intro,
    "",
    ...parts.flatMap((part) => [part.heading, ...part.lines.map((line) => `  – ${line}`), part.link, ""]),
    ...footer,
  ].join("\n");

  const html = [
    `<p>${escapeHtml(intro)}</p>`,
    ...parts.map(
      (part) =>
        `<p><strong>${escapeHtml(part.heading)}</strong>` +
        (part.lines.length > 0 ? `<br>${part.lines.map((line) => `– ${escapeHtml(line)}`).join("<br>")}` : "") +
        `<br><a href="${part.link}">Open in the admin</a></p>`,
    ),
    `<p style="color:#666;font-size:12px">${footer.map(escapeHtml).join("<br>")}</p>`,
  ].join("\n");

  return { subject, text, html };
}

/** Sends one email through Postmark. Throws when it was not accepted. */
export async function sendNotice(to: string, notice: Notice): Promise<void> {
  const token = process.env.POSTMARK_ADMIN_TOKEN;
  if (!token) throw new Error("POSTMARK_ADMIN_TOKEN is not set. See docs/setup.md § Notifications.");
  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": token,
    },
    body: JSON.stringify({
      From: FROM,
      To: to,
      Subject: notice.subject,
      TextBody: notice.text,
      HtmlBody: notice.html,
      MessageStream: "outbound",
      Tag: "admin-notification",
      TrackOpens: false,
      TrackLinks: "None",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Postmark ${res.status}: ${body.slice(0, 200)}`);
  }
}
