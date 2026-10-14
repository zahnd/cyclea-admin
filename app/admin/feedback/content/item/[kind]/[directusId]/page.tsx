import { ExternalLinkIcon } from "lucide-react";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { requireAdmin } from "@/lib/auth/dal";
import { listContentFeedback, summarizeByContent } from "@/lib/feedback/content";
import { FEEDBACK_LIST_LIMIT } from "@/lib/feedback/data";
import { CONTENT_KIND_LABELS, contentLabel, directusItemUrl, isContentKind } from "@/lib/feedback/validation";
import { formatDateTimeUtc } from "@/lib/format";

import { ContentGrid } from "../../../content-grid";
import { toRatingRow } from "../../../rows";

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm tabular-nums">{value}</dd>
    </div>
  );
}

/** One content item: how it is rated, under which titles, and every rating of it. */
export default async function ContentItemPage({ params }: PageProps<"/admin/feedback/content/item/[kind]/[directusId]">) {
  await requireAdmin();
  const { kind, directusId: rawId } = await params;
  if (!isContentKind(kind) || !/^\d{1,15}$/.test(rawId)) notFound();
  const directusId = Number(rawId);

  const ratings = (await listContentFeedback()).filter(
    (rating) => rating.contentKind === kind && rating.directusId === directusId,
  );
  const [summary] = summarizeByContent(ratings);
  // No ratings (left): the item has nothing to show here.
  if (!summary) notFound();
  const [latest, ...older] = summary.titles;
  const label = contentLabel(kind, directusId, latest ?? null);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        crumbs={[
          { label: "Feedback" },
          { label: "Content feedback", href: "/admin/feedback/content?view=items" },
          { label },
        ]}
        title={label}
        description={`${CONTENT_KIND_LABELS[kind]} #${directusId}`}
        actions={
          <Button
            variant="outline"
            nativeButton={false}
            render={<a href={directusItemUrl(kind, directusId)} target="_blank" rel="noopener noreferrer" />}
          >
            Open in Directus
            <ExternalLinkIcon />
          </Button>
        }
      />

      <Frame className="max-w-3xl">
        <FrameHeader>
          <FrameTitle>Summary</FrameTitle>
          {older.length > 0 && (
            <FrameDescription>
              Also rated under {older.length === 1 ? "an earlier title" : "earlier titles"}: {older.join(", ")}.
            </FrameDescription>
          )}
        </FrameHeader>
        <FramePanel>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Stat label="Thumbs up" value={summary.up} />
            <Stat label="Thumbs down" value={summary.down} />
            <Stat label="With a note" value={summary.notes} />
            <Stat label="Notes new" value={summary.newNotes} />
            <Stat label="Last rated" value={formatDateTimeUtc(summary.lastRatedAt)} />
          </dl>
        </FramePanel>
      </Frame>

      <ContentGrid rows={ratings.map(toRatingRow)} limit={FEEDBACK_LIST_LIMIT} item />
    </div>
  );
}
