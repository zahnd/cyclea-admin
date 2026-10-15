// Shared by the report pages, the triage form and its server action. No
// server-only import: the rules are not secret, and the form shows them.

/** Why the user reported someone (user_reports_reason_ck, app migration 0025). */
export const REPORT_REASONS = [
  "spam",
  "harassment",
  "hate_speech",
  "impersonation",
  "inappropriate_content",
  "self_harm",
  "underage",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: "Spam",
  harassment: "Harassment",
  hate_speech: "Hate speech",
  impersonation: "Impersonation",
  inappropriate_content: "Inappropriate content",
  self_harm: "Self-harm",
  underage: "Underage",
  other: "Other",
};

export function isReportReason(value: string): value is ReportReason {
  return (REPORT_REASONS as readonly string[]).includes(value);
}

/** report_triage_status_check (migration 0012). No row means new. */
export const REPORT_STATUSES = ["new", "in_progress", "closed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  new: "New",
  in_progress: "In progress",
  closed: "Closed",
};

export function isReportStatus(value: string): value is ReportStatus {
  return (REPORT_STATUSES as readonly string[]).includes(value);
}

/**
 * What was done (report_triage_action_check), required once closed.
 * "Account deleted" records an admin's `make delete-user`; this app never
 * deletes an app account itself.
 */
export const REPORT_ACTIONS = ["no_action", "warned", "account_deleted", "other"] as const;
export type ReportAction = (typeof REPORT_ACTIONS)[number];

export const REPORT_ACTION_LABELS: Record<ReportAction, string> = {
  no_action: "No action",
  warned: "Warned",
  account_deleted: "Account deleted",
  other: "Other",
};

export function isReportAction(value: string): value is ReportAction {
  return (REPORT_ACTIONS as readonly string[]).includes(value);
}

/** Mirrors report_triage_note_check. */
export const REPORT_NOTE_MAX = 2000;

/**
 * "@lena" -- the reported account as it is now, else as it was when
 * reported, marked "(deleted)" once the account is gone.
 */
export function reportedLabel(report: {
  reportedUsernameNow: string | null;
  reportedDisplayNameNow: string | null;
  reportedUsernameThen: string | null;
  reportedDisplayNameThen: string | null;
  reportedAccountExists: boolean;
}): string {
  if (report.reportedAccountExists) {
    return report.reportedUsernameNow
      ? `@${report.reportedUsernameNow}`
      : (report.reportedDisplayNameNow ?? "(no name)");
  }
  const then = report.reportedUsernameThen
    ? `@${report.reportedUsernameThen}`
    : (report.reportedDisplayNameThen ?? "Unknown account");
  return `${then} (deleted)`;
}
