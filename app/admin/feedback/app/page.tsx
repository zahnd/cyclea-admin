import { PlusIcon } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/dal";
import { FEEDBACK_LIST_LIMIT, listAppFeedback } from "@/lib/feedback/data";
import { deviceLabel } from "@/lib/feedback/validation";

import { FeedbackGrid, type FeedbackRow } from "./feedback-grid";

export default async function AppFeedbackPage() {
  await requireAdmin();
  const feedback = await listAppFeedback();

  const rows: FeedbackRow[] = feedback.map((item) => ({
    id: item.id,
    source: item.source,
    receivedAt: item.receivedAt,
    dateOnly: item.dateOnly,
    category: item.category,
    message: item.message,
    appVersion: item.appVersion,
    device: deviceLabel(item.platform, item.osVersion, { short: true }),
    screen: item.screen,
    // The list marks both the same way: an app screenshot (in Supabase) or a manual entry's image.
    hasScreenshot: item.hasScreenshot || item.hasImage,
    status: item.status,
  }));

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Feedback" }, { label: "App feedback" }]}
        title="App feedback"
        description="Everything about the app: what people sent from it (shake, or Settings → Send feedback) and what reached us another way. Who it came from is never shown; app screenshots stay in Supabase."
        actions={
          <Button nativeButton={false} render={<Link href="/admin/feedback/new" />}>
            <PlusIcon />
            Add feedback
          </Button>
        }
      />
      <FeedbackGrid rows={rows} limit={FEEDBACK_LIST_LIMIT} />
    </>
  );
}
