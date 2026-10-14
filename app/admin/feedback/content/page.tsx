import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/dal";
import { listContentFeedback, summarizeByContent } from "@/lib/feedback/content";
import { FEEDBACK_LIST_LIMIT } from "@/lib/feedback/data";

import { ContentGrid } from "./content-grid";
import { ContentSummaryGrid } from "./content-summary-grid";
import { toRatingRow } from "./rows";

const VIEWS = [
  { value: "ratings", label: "All ratings", href: "/admin/feedback/content" },
  { value: "items", label: "By content", href: "/admin/feedback/content?view=items" },
] as const;

export default async function ContentFeedbackPage({ searchParams }: PageProps<"/admin/feedback/content">) {
  await requireAdmin();
  const view = (await searchParams).view === "items" ? "items" : "ratings";
  const ratings = await listContentFeedback();

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Feedback" }, { label: "Content feedback" }]}
        title="Content feedback"
        description="Thumbs and notes on articles, classes, meditations, recipes and herbal support. Who rated is never shown. Only ratings with a note are triaged; the editors see the same ratings in Directus."
      />
      <nav aria-label="View" className="flex gap-2">
        {VIEWS.map((item) => (
          <Button
            key={item.value}
            size="sm"
            variant={view === item.value ? "secondary" : "ghost"}
            nativeButton={false}
            render={<Link href={item.href} aria-current={view === item.value ? "page" : undefined} />}
          >
            {item.label}
          </Button>
        ))}
      </nav>
      {view === "items" ? (
        <ContentSummaryGrid rows={summarizeByContent(ratings)} />
      ) : (
        <ContentGrid rows={ratings.map(toRatingRow)} limit={FEEDBACK_LIST_LIMIT} />
      )}
    </>
  );
}
