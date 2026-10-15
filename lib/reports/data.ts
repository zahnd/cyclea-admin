import "server-only";

import { adminDb } from "@/lib/db/admin";
import { appDbAsAdminPortal } from "@/lib/db/app";
import type { FeedbackActor } from "@/lib/feedback/data";

import type { ReportAction, ReportReason, ReportStatus } from "./validation";

// User reports (app migration 0025), read through the app view
// user_reports_admin (0068): the reported account's names then and now and its
// report count -- never the reporter, no user ids. Reports are purged by the
// app after 12 months; what we decided (report_triage, 0012) goes with them.

/** The list shows at most this many, newest first. */
export const REPORT_LIST_LIMIT = 1000;

export type Report = {
  id: string;
  createdAt: string;
  reason: ReportReason;
  /** The reporter's words. May name people or mention health; never copied. */
  note: string | null;
  reportedUsernameThen: string | null;
  reportedDisplayNameThen: string | null;
  reportedUsernameNow: string | null;
  reportedDisplayNameNow: string | null;
  reportedAccountExists: boolean;
  /** Reports on the same account, this one included; null once it is deleted. */
  reportsOnAccount: number | null;
  status: ReportStatus;
  action: ReportAction | null;
  triageNote: string | null;
  triagedAt: string | null;
  triagedBy: string | null;
};

type ReportRow = {
  id: string;
  created_at: Date;
  reason: ReportReason;
  note: string | null;
  reported_username_then: string | null;
  reported_display_name_then: string | null;
  reported_username_now: string | null;
  reported_display_name_now: string | null;
  reported_account_exists: boolean;
  // count(*) is bigint: pg hands it over as a string.
  reports_on_account: string | null;
};

type TriageRow = {
  report_id: string;
  status: ReportStatus;
  action: ReportAction | null;
  note: string | null;
  updated_at: string;
  updated_by_label: string;
};

const REPORT_COLUMNS =
  "id, created_at, reason, note, reported_username_then, reported_display_name_then, " +
  "reported_username_now, reported_display_name_now, reported_account_exists, reports_on_account";
const TRIAGE_COLUMNS = "report_id, status, action, note, updated_at, updated_by_label";

function fromRow(row: ReportRow, triage: TriageRow | undefined): Report {
  return {
    id: row.id,
    createdAt: row.created_at.toISOString(),
    reason: row.reason,
    note: row.note,
    reportedUsernameThen: row.reported_username_then,
    reportedDisplayNameThen: row.reported_display_name_then,
    reportedUsernameNow: row.reported_username_now,
    reportedDisplayNameNow: row.reported_display_name_now,
    reportedAccountExists: row.reported_account_exists,
    reportsOnAccount: row.reports_on_account === null ? null : Number(row.reports_on_account),
    status: triage?.status ?? "new",
    action: triage?.action ?? null,
    triageNote: triage?.note ?? null,
    triagedAt: triage?.updated_at ?? null,
    triagedBy: triage?.updated_by_label ?? null,
  };
}

export async function listReports(): Promise<Report[]> {
  const [reports, triage] = await Promise.all([
    appDbAsAdminPortal().query<ReportRow>(
      `SELECT ${REPORT_COLUMNS} FROM public.user_reports_admin ORDER BY created_at DESC LIMIT $1`,
      [REPORT_LIST_LIMIT],
    ),
    adminDb().from("report_triage").select(TRIAGE_COLUMNS),
  ]);
  if (triage.error) throw new Error(`report triage: ${triage.error.message}`);
  const byId = new Map((triage.data as TriageRow[]).map((row) => [row.report_id, row]));
  return reports.rows.map((row) => fromRow(row, byId.get(row.id)));
}

/** One report, or null once the app purged it. */
export async function getReport(id: string): Promise<Report | null> {
  const [reports, triage] = await Promise.all([
    appDbAsAdminPortal().query<ReportRow>(`SELECT ${REPORT_COLUMNS} FROM public.user_reports_admin WHERE id = $1`, [id]),
    adminDb().from("report_triage").select(TRIAGE_COLUMNS).eq("report_id", id).maybeSingle(),
  ]);
  if (triage.error) throw new Error(`report triage: ${triage.error.message}`);
  const row = reports.rows[0];
  return row ? fromRow(row, (triage.data as TriageRow | null) ?? undefined) : null;
}

/** The ids of all reports that still exist. */
export async function listReportIds(): Promise<string[]> {
  const result = await appDbAsAdminPortal().query<{ id: string }>("SELECT id FROM public.user_reports_admin");
  return result.rows.map((row) => row.id);
}

/** Reports nobody has picked up: no triage row, or set back to new. */
export async function countNewReports(): Promise<number> {
  const [ids, triaged] = await Promise.all([
    listReportIds(),
    adminDb().from("report_triage").select("report_id").neq("status", "new"),
  ]);
  if (triaged.error) throw new Error(`report triage: ${triaged.error.message}`);
  const done = new Set((triaged.data as { report_id: string }[]).map((row) => row.report_id));
  return ids.filter((id) => !done.has(id)).length;
}

export type ReportTriageInput = {
  reportId: string;
  reportCreatedAt: string;
  status: ReportStatus;
  action: ReportAction | null;
  note: string;
};

/**
 * Saves status, action and note and writes the audit entry, in one
 * transaction (set_report_triage, migration 0012). Returns whether anything
 * changed. Callers validate first; the database refuses what slips through.
 */
export async function setReportTriage(input: ReportTriageInput, actor: FeedbackActor): Promise<boolean> {
  const { data, error } = await adminDb().rpc("set_report_triage", {
    p_report_id: input.reportId,
    p_report_created_at: input.reportCreatedAt,
    p_status: input.status,
    p_action: input.action,
    p_note: input.note,
    p_actor_id: actor.id,
    p_actor_label: actor.label,
  });
  if (error) throw new Error(`set_report_triage: ${error.message}`);
  return data === true;
}
