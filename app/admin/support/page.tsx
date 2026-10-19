import { PageHeader } from "@/components/page-header";
import { requireAdmin } from "@/lib/auth/dal";
import { deviceLabel } from "@/lib/feedback/validation";
import { listThreads, SUPPORT_LIST_LIMIT } from "@/lib/support/data";
import { compareInbox, lastActivity, threadUserLabel } from "@/lib/support/validation";

import { SupportGrid, type SupportRow } from "./support-grid";

export default async function SupportPage() {
  await requireAdmin();
  const threads = await listThreads();

  const rows: SupportRow[] = [...threads].sort(compareInbox).map((thread) => ({
    id: thread.id,
    status: thread.status,
    user: threadUserLabel(thread),
    app: [deviceLabel(thread.platform, null), thread.appVersion].filter(Boolean).join(" · ") || null,
    entitled: thread.entitled,
    lastUserMessageAt: thread.lastUserMessageAt,
    lastActivity: lastActivity(thread),
    messageCount: thread.messageCount,
    userMessageCount: thread.userMessageCount,
  }));

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Support" }]}
        title="Support"
        description="Conversations users started with the team in the app. Replies land in the app; the user gets an email note without the text. Closed conversations are deleted after 12 months."
      />
      <SupportGrid rows={rows} limit={SUPPORT_LIST_LIMIT} />
    </>
  );
}
