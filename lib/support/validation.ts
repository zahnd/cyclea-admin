// Shared by the support pages, their forms and server actions, and the tests.
// No server-only import and no runtime imports at all: the rules are not
// secret, the forms show them, and `node --test` loads this file as is.

/** support_threads.status (cyclea-app 0069). `open` means waiting for us. */
export const SUPPORT_STATUSES = ["open", "answered", "closed"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  open: "Waiting for us",
  answered: "Answered",
  closed: "Closed",
};

export function isSupportStatus(value: string): value is SupportStatus {
  return (SUPPORT_STATUSES as readonly string[]).includes(value);
}

/** support_messages.author (0069). `assistant` rows come from the AI chat. */
export const SUPPORT_AUTHORS = ["user", "assistant", "team"] as const;
export type SupportAuthor = (typeof SUPPORT_AUTHORS)[number];

/** support_messages.body: 1-4000 characters (0069). */
export const SUPPORT_REPLY_MAX = 4000;
/** support_messages.team_name and admins.support_name (admin 0014): at most 40. */
export const SUPPORT_NAME_MAX = 40;

/** Characters as Postgres' length() counts them: code points, not UTF-16 units. */
export function charCount(text: string): number {
  return [...text].length;
}

/** Why a reply cannot be sent as typed, or null. Trimmed first, as the server does. */
export function replyError(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return "Write a reply first.";
  if (charCount(trimmed) > SUPPORT_REPLY_MAX) return `Keep the reply under ${SUPPORT_REPLY_MAX} characters.`;
  return null;
}

/** Why a signature name is not usable, or null. Empty is checked by the caller (it clears). */
export function supportNameError(name: string): string | null {
  const trimmed = name.trim();
  if (charCount(trimmed) > SUPPORT_NAME_MAX) return `Keep the name under ${SUPPORT_NAME_MAX} characters.`;
  // admins_support_name_check: one line, no control characters.
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return "One line, please.";
  return null;
}

/** How a team reply is signed in the app: "Stefan · Cyclea team". */
export function signatureLabel(teamName: string): string {
  return `${teamName} · Cyclea team`;
}

/** "@lena · Lena", or whichever of the two exists. */
export function threadUserLabel(thread: { username: string | null; displayName: string | null }): string {
  return (
    [thread.username && `@${thread.username}`, thread.displayName].filter(Boolean).join(" · ") || "(no name)"
  );
}

/** The newest message in either direction; the thread's start before anyone wrote. */
export function lastActivity(thread: {
  createdAt: string;
  lastUserMessageAt: string | null;
  lastTeamMessageAt: string | null;
}): string {
  const times = [thread.lastUserMessageAt, thread.lastTeamMessageAt].filter((t): t is string => t !== null);
  if (times.length === 0) return thread.createdAt;
  return times.reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b));
}

const STATUS_RANK: Record<SupportStatus, number> = { open: 0, answered: 1, closed: 2 };

/**
 * The inbox order: waiting for us first, the longest-waiting at the top
 * (by the user's last message); then answered and closed, most recent
 * activity first.
 */
export function compareInbox(
  a: { status: SupportStatus; createdAt: string; lastUserMessageAt: string | null; lastTeamMessageAt: string | null },
  b: { status: SupportStatus; createdAt: string; lastUserMessageAt: string | null; lastTeamMessageAt: string | null },
): number {
  const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (rank !== 0) return rank;
  if (a.status === "open") {
    return Date.parse(a.lastUserMessageAt ?? a.createdAt) - Date.parse(b.lastUserMessageAt ?? b.createdAt);
  }
  return Date.parse(lastActivity(b)) - Date.parse(lastActivity(a));
}

/**
 * What the app's support functions raise (0069), as named errors:
 * support_team_reply raises `thread_closed` and `invalid`,
 * support_set_status raises `open_thread_exists` on a reopen.
 */
export const SUPPORT_RAISED = ["thread_closed", "invalid", "open_thread_exists"] as const;
export type SupportRaised = (typeof SUPPORT_RAISED)[number];

export const SUPPORT_RAISED_MESSAGES: Record<SupportRaised, string> = {
  thread_closed: "This conversation is closed. Reopen it to reply.",
  invalid: "The app refused the reply: it is empty or too long, or your signature name is not usable.",
  open_thread_exists:
    "This user already has another open conversation, so this one cannot be reopened. Reply there instead.",
};

/**
 * Which named error a failed call raised, or null for anything else (a
 * dropped connection, a missing grant). Looks at the message, detail and
 * hint, since the contract names the error but not where it puts the name.
 */
export function supportRaised(error: unknown): SupportRaised | null {
  if (typeof error !== "object" || error === null) return null;
  const fields = ["message", "detail", "hint"]
    .map((field) => (error as Record<string, unknown>)[field])
    .filter((value): value is string => typeof value === "string");
  for (const name of SUPPORT_RAISED) {
    // A whole token, and not the start of a sentence: `invalid` must not match
    // Postgres' own "invalid input syntax for type uuid".
    const pattern = new RegExp(`(^|[^a-z_])${name}(?![a-z_])(?! [a-z])`);
    if (fields.some((text) => pattern.test(text))) return name;
  }
  return null;
}
