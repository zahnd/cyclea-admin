import "server-only";

import { adminDb } from "@/lib/db/admin";
import { appDbAsAdminPortal } from "@/lib/db/app";

import {
  MESSAGE_COLUMNS,
  THREAD_COLUMNS,
  toMessage,
  toThread,
  type MessageRow,
  type SupportMessage,
  type SupportThread,
  type ThreadRow,
} from "./rows";

// Support conversations (cyclea-app 0069, docs/support.md there), read
// through the app views support_threads_admin and support_messages_admin and
// written only through the app's functions support_team_reply and
// support_set_status -- admin_portal holds no grant on the tables. Nothing of a
// conversation is stored in the admin project; the audit log records that an
// admin replied or changed the status, with the thread id and nothing else.
//
// Not exposed through /mcp: AI clients never see support conversations.

/** The inbox shows at most this many threads; the page says so when it is hit. */
export const SUPPORT_LIST_LIMIT = 1000;

export type { SupportMessage, SupportThread };

export async function listThreads(): Promise<SupportThread[]> {
  // Waiting first, then the most recently touched; the page sorts finer.
  const { rows } = await appDbAsAdminPortal().query<ThreadRow>(
    `SELECT ${THREAD_COLUMNS} FROM public.support_threads_admin
     ORDER BY (status = 'open') DESC, updated_at DESC LIMIT $1`,
    [SUPPORT_LIST_LIMIT],
  );
  return rows.map(toThread);
}

/** One thread, or null once it was purged or its account deleted. */
export async function getThread(id: string): Promise<SupportThread | null> {
  const { rows } = await appDbAsAdminPortal().query<ThreadRow>(
    `SELECT ${THREAD_COLUMNS} FROM public.support_threads_admin WHERE id = $1`,
    [id],
  );
  return rows[0] ? toThread(rows[0]) : null;
}

/** A thread's messages, oldest first; on a tie, transcript rows before the rest. */
export async function listMessages(threadId: string): Promise<SupportMessage[]> {
  const { rows } = await appDbAsAdminPortal().query<MessageRow>(
    `SELECT ${MESSAGE_COLUMNS} FROM public.support_messages_admin
     WHERE thread_id = $1 ORDER BY created_at, from_transcript DESC`,
    [threadId],
  );
  return rows.map(toMessage);
}

/** Threads waiting for us, for the badge on the Support section. */
export async function countWaitingThreads(): Promise<number> {
  const { rows } = await appDbAsAdminPortal().query<{ count: string }>(
    "SELECT count(*) AS count FROM public.support_threads_admin WHERE status = 'open'",
  );
  return Number(rows[0]?.count ?? 0);
}

/**
 * Posts a team reply (support_team_reply, 0069): the app stores it, marks the
 * thread answered and emails the user a note -- without the text -- if they
 * have not read it within 10 minutes. Throws what the function raises
 * (`thread_closed`, `invalid`); supportRaised() names it.
 */
export async function teamReply(threadId: string, body: string, teamName: string): Promise<void> {
  await appDbAsAdminPortal().query("SELECT public.support_team_reply($1, $2, $3)", [threadId, body, teamName]);
}

/** Closes or reopens a thread (support_set_status, 0069). Throws `open_thread_exists` on a refused reopen. */
export async function setThreadStatus(threadId: string, status: "open" | "closed"): Promise<void> {
  await appDbAsAdminPortal().query("SELECT public.support_set_status($1, $2)", [threadId, status]);
}

export type SupportAuditAction = "support.reply" | "support.close" | "support.reopen";

/**
 * The audit entry for a reply or a status change: who, what, which thread.
 * Never the text, never the user's names -- audit rows are permanent, threads
 * are deleted with the account or 12 months after closing. Returns an error
 * message for the form when the entry could not be written; the change itself
 * is real by then (two databases, no shared transaction).
 */
export async function auditSupport(
  admin: { userId: string; email: string },
  action: SupportAuditAction,
  threadId: string,
): Promise<string | null> {
  const { error } = await adminDb().from("audit_log").insert({
    actor_id: admin.userId,
    actor_label: admin.email,
    action,
    target_type: "support_thread",
    target_id: threadId,
    details: {},
  });
  if (!error) return null;
  console.error(`[support] audit ${action} for ${threadId} failed: ${error.message}`);
  return "Done, but writing the audit entry failed. Check the server log.";
}
