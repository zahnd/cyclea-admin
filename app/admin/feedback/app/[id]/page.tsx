import { ExternalLinkIcon } from "lucide-react";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { requireAdmin } from "@/lib/auth/dal";
import { isUuid } from "@/lib/creators/validation";
import { getAppFeedback, screenshotDashboardUrl, type Feedback } from "@/lib/feedback/data";
import { deviceLabel, FEEDBACK_CATEGORY_LABELS, FEEDBACK_SOURCE_LABELS, isManualSource, isPlatform } from "@/lib/feedback/validation";
import { formatDateLong, formatDateTimeUtc } from "@/lib/format";

import { FeedbackCategoryBadge, FeedbackStatusBadge } from "../feedback-grid";
import { ManualForm } from "../manual-form";
import { TriageForm } from "./triage-form";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children ?? "—"}</dd>
    </div>
  );
}

function received(item: Feedback): string {
  return item.dateOnly ? formatDateLong(item.receivedAt) : formatDateTimeUtc(item.receivedAt);
}

export default async function FeedbackItemPage({ params }: PageProps<"/admin/feedback/app/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  // Feedback sent from the app is gone once its account was deleted: it
  // cascades away in the app project, and only our triage row (which holds
  // none of it) is left.
  const item = await getAppFeedback(id);
  if (!item) notFound();
  const manual = item.kind === "manual";

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader
        crumbs={[{ label: "Feedback" }, { label: "App feedback", href: "/admin/feedback/app" }, { label: `${id.slice(0, 8)}…` }]}
        title={`${FEEDBACK_CATEGORY_LABELS[item.category]} · ${received(item)}`}
        badges={
          <>
            <FeedbackCategoryBadge category={item.category} />
            <FeedbackStatusBadge status={item.status} />
          </>
        }
      />

      <Frame>
        <FrameHeader>
          <FrameTitle>{manual ? `Via ${FEEDBACK_SOURCE_LABELS[item.source]}` : "Sent from the app"}</FrameTitle>
          <FrameDescription>
            {manual
              ? `Entered by ${item.enteredBy} on ${formatDateTimeUtc(item.enteredAt ?? item.receivedAt)}. Who said it is not recorded.`
              : "As the user wrote it. Who sent it is not shown here."}
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="flex flex-col gap-6">
          <p className="text-sm whitespace-pre-wrap">{item.message}</p>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Fact label="App version">{item.appVersion}</Fact>
            <Fact label="Device">{deviceLabel(item.platform, item.osVersion)}</Fact>
            {!manual && (
              <>
                <Fact label="Language">{item.locale}</Fact>
                <Fact label="Screen">{item.screen}</Fact>
                <Fact label="Screenshot">
                  {item.hasScreenshot ? (
                    <a
                      href={screenshotDashboardUrl(item.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-4"
                    >
                      Open in Supabase
                      <ExternalLinkIcon className="size-3.5" aria-hidden />
                    </a>
                  ) : (
                    "None"
                  )}
                </Fact>
              </>
            )}
          </dl>
          {item.hasScreenshot && (
            <p className="text-xs text-muted-foreground">
              The screenshot can show cycle data, so it never leaves Supabase; opening it needs your Supabase login.
            </p>
          )}
        </FramePanel>
      </Frame>

      <Frame>
        <FrameHeader>
          <FrameTitle>Triage</FrameTitle>
          <FrameDescription>
            {item.triagedAt
              ? `Last changed ${formatDateTimeUtc(item.triagedAt)} by ${item.triagedBy}.`
              : "Not triaged yet."}
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <TriageForm kind={item.kind} id={item.id} status={item.status} note={item.note} link={item.link} />
        </FramePanel>
      </Frame>

      {manual && isManualSource(item.source) && (
        <Frame>
          <FrameHeader>
            <FrameTitle>Edit entry</FrameTitle>
            <FrameDescription>Fix what was noted down. Changes are logged, the text itself is not.</FrameDescription>
          </FrameHeader>
          <FramePanel>
            <ManualForm
              id={item.id}
              initial={{
                source: item.source,
                category: item.category,
                message: item.message,
                receivedOn: item.receivedAt.slice(0, 10),
                appVersion: item.appVersion,
                platform: item.platform && isPlatform(item.platform) ? item.platform : null,
              }}
            />
          </FramePanel>
        </Frame>
      )}
    </div>
  );
}
