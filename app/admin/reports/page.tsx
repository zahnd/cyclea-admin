import { PageHeader } from "@/components/page-header";
import { requireAdmin } from "@/lib/auth/dal";
import { listReports, REPORT_LIST_LIMIT } from "@/lib/reports/data";
import { reportedLabel } from "@/lib/reports/validation";

import { ReportsGrid, type ReportRow } from "./reports-grid";

export default async function ReportsPage() {
  await requireAdmin();
  const reports = await listReports();

  const rows: ReportRow[] = reports.map((report) => ({
    id: report.id,
    createdAt: report.createdAt,
    reason: report.reason,
    reported: reportedLabel(report),
    reportsOnAccount: report.reportsOnAccount,
    status: report.status,
    action: report.action,
    note: report.note,
  }));

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Reports" }]}
        title="Reports"
        description="Abuse reports from the app. Who reported is never shown; reports and what we did about them are deleted after 12 months."
      />
      <ReportsGrid rows={rows} limit={REPORT_LIST_LIMIT} />
    </>
  );
}
