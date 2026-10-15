"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/dal";
import { isUuid } from "@/lib/creators/validation";
import { getReport, setReportTriage } from "@/lib/reports/data";
import { isReportAction, isReportStatus, REPORT_NOTE_MAX } from "@/lib/reports/validation";

export type FormState = { error?: string; ok?: string };

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Status, action and note of one report. No step-up code: recording a
 * decision is not a role or account action. Deleting the reported account is
 * not done here at all -- that is `make delete-user` in cyclea-app.
 */
export async function updateReportTriage(_prev: FormState, formData: FormData): Promise<FormState> {
  // Every server action checks for itself: a POST does not pass the layout.
  const admin = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) throw new Error("Invalid report id.");

  const status = String(formData.get("status") ?? "");
  const rawAction = String(formData.get("action") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (!isReportStatus(status)) return { error: "Choose a status from the list." };
  if (rawAction && !isReportAction(rawAction)) return { error: "Choose an action from the list." };
  const action = rawAction && isReportAction(rawAction) ? rawAction : null;
  if (status === "closed" && !action) return { error: "Say what was done before closing the report." };
  if (note.length > REPORT_NOTE_MAX) return { error: `Keep the note under ${REPORT_NOTE_MAX} characters.` };

  // The report's own date goes with the decision, so it is purged with the
  // report after 12 months.
  let report;
  try {
    report = await getReport(id);
  } catch (error) {
    console.error(`[reports] triage ${id}: could not read the report: ${message(error)}`);
    return { error: "Could not save. Nothing was changed." };
  }
  if (!report) return { error: "This report no longer exists." };

  let changed: boolean;
  try {
    changed = await setReportTriage(
      { reportId: id, reportCreatedAt: report.createdAt, status, action, note },
      { id: admin.userId, label: admin.email },
    );
  } catch (error) {
    console.error(`[reports] triage ${id} failed: ${message(error)}`);
    return { error: "Could not save. Nothing was changed." };
  }

  revalidatePath(`/admin/reports/${id}`);
  revalidatePath("/admin/reports");
  // The layout's New count, on every admin page.
  revalidatePath("/admin", "layout");
  return { ok: changed ? "Saved." : "No change." };
}
