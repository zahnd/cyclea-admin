import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { requireAdmin } from "@/lib/auth/dal";
import { isUuid } from "@/lib/creators/validation";
import { formatDateTimeUtc } from "@/lib/format";
import { getReport } from "@/lib/reports/data";
import { REPORT_REASON_LABELS, reportedLabel } from "@/lib/reports/validation";

import { ReportReasonBadge, ReportStatusBadge } from "../reports-grid";
import { ReportTriageForm } from "./triage-form";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children ?? "—"}</dd>
    </div>
  );
}

function names(username: string | null, displayName: string | null): string | null {
  return [username && `@${username}`, displayName].filter(Boolean).join(" · ") || null;
}

export default async function ReportPage({ params }: PageProps<"/admin/reports/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  // Purged by the app after 12 months; our triage row goes the same night.
  const report = await getReport(id);
  if (!report) notFound();

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader
        crumbs={[{ label: "Reports", href: "/admin/reports" }, { label: `${id.slice(0, 8)}…` }]}
        title={`${REPORT_REASON_LABELS[report.reason]} · ${reportedLabel(report)}`}
        badges={
          <>
            <ReportReasonBadge reason={report.reason} />
            <ReportStatusBadge status={report.status} />
          </>
        }
      />

      <Frame>
        <FrameHeader>
          <FrameTitle>Report</FrameTitle>
          <FrameDescription>
            Received {formatDateTimeUtc(report.createdAt)}. Who reported is not shown here.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="flex flex-col gap-6">
          {report.note ? (
            <p className="text-sm whitespace-pre-wrap">{report.note}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No note — only the reason.</p>
          )}
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Fact label="Reported account now">
              {report.reportedAccountExists
                ? names(report.reportedUsernameNow, report.reportedDisplayNameNow)
                : "Deleted"}
            </Fact>
            <Fact label="When reported">{names(report.reportedUsernameThen, report.reportedDisplayNameThen)}</Fact>
            <Fact label="Reports on this account">{report.reportsOnAccount}</Fact>
          </dl>
        </FramePanel>
      </Frame>

      <Frame>
        <FrameHeader>
          <FrameTitle>What we did</FrameTitle>
          <FrameDescription>
            {report.triagedAt
              ? `Last changed ${formatDateTimeUtc(report.triagedAt)} by ${report.triagedBy}.`
              : "Not picked up yet."}
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <ReportTriageForm id={report.id} status={report.status} action={report.action} note={report.triageNote} />
        </FramePanel>
      </Frame>
    </div>
  );
}
