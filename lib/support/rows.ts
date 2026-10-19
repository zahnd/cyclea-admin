// The app views' rows (cyclea-app 0069) and what the pages get from them.
// No runtime imports, so `node --test` loads it as is; the queries are in
// data.ts.
//
// support_threads_admin carries who (username, display name), the device and
// whether the user is entitled -- never a user id or an email address.
// support_messages_admin carries the text. Neither is ever copied into the
// admin project, the audit log or an email.

import type { SupportAuthor, SupportStatus } from "./validation";

export type SupportThread = {
  id: string;
  status: SupportStatus;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  lastUserMessageAt: string | null;
  lastTeamMessageAt: string | null;
  /** When the user last opened the conversation in the app. */
  userReadAt: string | null;
  platform: string | null;
  appVersion: string | null;
  locale: string | null;
  username: string | null;
  displayName: string | null;
  /** A subscription or a comp that has not run out. */
  entitled: boolean;
  /** Every message, transcript rows included. */
  messageCount: number;
  userMessageCount: number;
};

export type SupportMessage = {
  id: string;
  threadId: string;
  author: SupportAuthor;
  /** What was written. User text: can mention health details; never copied. */
  body: string;
  /** The signature on a team message ("Stefan"); null otherwise. */
  teamName: string | null;
  /** Copied from the AI chat when the user handed over to the team. */
  fromTranscript: boolean;
  createdAt: string;
};

export type ThreadRow = {
  id: string;
  status: SupportStatus;
  created_at: Date;
  updated_at: Date;
  closed_at: Date | null;
  last_user_message_at: Date | null;
  last_team_message_at: Date | null;
  user_read_at: Date | null;
  platform: string | null;
  app_version: string | null;
  locale: string | null;
  username: string | null;
  display_name: string | null;
  entitled: boolean | null;
  // count(*) is bigint: pg hands it over as a string.
  message_count: string | number | null;
  user_message_count: string | number | null;
};

export type MessageRow = {
  id: string;
  thread_id: string;
  author: SupportAuthor;
  body: string;
  team_name: string | null;
  from_transcript: boolean | null;
  created_at: Date;
};

export const THREAD_COLUMNS =
  "id, status, created_at, updated_at, closed_at, last_user_message_at, last_team_message_at, user_read_at, " +
  "platform, app_version, locale, username, display_name, entitled, message_count, user_message_count";

export const MESSAGE_COLUMNS = "id, thread_id, author, body, team_name, from_transcript, created_at";

const iso = (value: Date | null): string | null => (value === null ? null : value.toISOString());

export function toThread(row: ThreadRow): SupportThread {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    closedAt: iso(row.closed_at),
    lastUserMessageAt: iso(row.last_user_message_at),
    lastTeamMessageAt: iso(row.last_team_message_at),
    userReadAt: iso(row.user_read_at),
    platform: row.platform,
    appVersion: row.app_version,
    locale: row.locale,
    username: row.username,
    displayName: row.display_name,
    entitled: row.entitled === true,
    messageCount: Number(row.message_count ?? 0),
    userMessageCount: Number(row.user_message_count ?? 0),
  };
}

export function toMessage(row: MessageRow): SupportMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    author: row.author,
    body: row.body,
    teamName: row.team_name,
    fromTranscript: row.from_transcript === true,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * The conversation in the order it happened, split where the AI chat handed
 * over: the transcript first (the app stores it before the first user
 * message), then everything written to the team. Ties on created_at keep
 * transcript rows first, since they were inserted in one statement.
 */
export function splitConversation(messages: SupportMessage[]): {
  transcript: SupportMessage[];
  conversation: SupportMessage[];
} {
  const ordered = [...messages].sort(
    (a, b) =>
      Date.parse(a.createdAt) - Date.parse(b.createdAt) || Number(b.fromTranscript) - Number(a.fromTranscript),
  );
  return {
    transcript: ordered.filter((message) => message.fromTranscript),
    conversation: ordered.filter((message) => !message.fromTranscript),
  };
}
