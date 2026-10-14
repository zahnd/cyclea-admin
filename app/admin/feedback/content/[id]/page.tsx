import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { requireAdmin } from "@/lib/auth/dal";
import { isUuid } from "@/lib/creators/validation";
import { getContentFeedback } from "@/lib/feedback/content";
import { CONTENT_KIND_LABELS, contentLabel, directusItemUrl, ratingLabel } from "@/lib/feedback/validation";
import { formatDateTimeUtc } from "@/lib/format";

import { FeedbackStatusBadge } from "../../app/feedback-grid";
import { TriageForm } from "../../triage-form";
import { RatingBadge } from "../content-grid";
import { itemHref } from "../rows";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children ?? "—"}</dd>
    </div>
  );
}

const linkClass = "inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-4";

export default async function ContentRatingPage({ params }: PageProps<"/admin/feedback/content/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  // Deleted with its account: the rating cascades away in the app project, and
  // only our triage row (which holds none of it) is left.
  const item = await getContentFeedback(id);
  if (!item) notFound();
  const label = contentLabel(item.contentKind, item.directusId, item.title);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader
        crumbs={[
          { label: "Feedback" },
          { label: "Content feedback", href: "/admin/feedback/content" },
          { label: `${id.slice(0, 8)}…` },
        ]}
        title={`${ratingLabel(item.rating)} · ${label}`}
        badges={
          <>
            <RatingBadge rating={item.rating} />
            {item.status && <FeedbackStatusBadge status={item.status} />}
          </>
        }
      />

      {item.noteChangedSinceTriage && (
        <Alert variant="info">
          <AlertDescription>
            The note changed after it was triaged on {formatDateTimeUtc(item.triagedAt ?? item.updatedAt)}, so it counts
            as new again. Save the triage to confirm it.
          </AlertDescription>
        </Alert>
      )}

      <Frame>
        <FrameHeader>
          <FrameTitle>{CONTENT_KIND_LABELS[item.contentKind]}</FrameTitle>
          <FrameDescription>As the user rated it. Who rated is not shown here.</FrameDescription>
        </FrameHeader>
        <FramePanel className="flex flex-col gap-6">
          {item.note ? (
            <p className="text-sm whitespace-pre-wrap">{item.note}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No note — a thumb only.</p>
          )}
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Fact label="Content">
              <Link href={itemHref(item.contentKind, item.directusId)} className={linkClass}>
                {label}
              </Link>
            </Fact>
            <Fact label="In Directus">
              <a
                href={directusItemUrl(item.contentKind, item.directusId)}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
              >
                Open #{item.directusId}
                <ExternalLinkIcon className="size-3.5" aria-hidden />
              </a>
            </Fact>
            <Fact label="First rated">{formatDateTimeUtc(item.createdAt)}</Fact>
            <Fact label="Last changed">{formatDateTimeUtc(item.updatedAt)}</Fact>
            <Fact label="Note changed">{item.noteChangedAt ? formatDateTimeUtc(item.noteChangedAt) : null}</Fact>
          </dl>
        </FramePanel>
      </Frame>

      <Frame>
        <FrameHeader>
          <FrameTitle>Triage</FrameTitle>
          <FrameDescription>
            {!item.note
              ? "Only ratings with a note are triaged."
              : item.triagedAt
                ? `Last changed ${formatDateTimeUtc(item.triagedAt)} by ${item.triagedBy}.`
                : "Not triaged yet."}
          </FrameDescription>
        </FrameHeader>
        {item.note && item.status && (
          <FramePanel>
            <TriageForm
              kind="content"
              id={item.id}
              status={item.status}
              note={item.triageNote}
              link={item.triageLink}
            />
          </FramePanel>
        )}
      </Frame>
    </div>
  );
}
