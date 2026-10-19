import { cookies } from "next/headers";

import { AdminShell } from "@/components/admin-shell/admin-shell";
import { requireAdmin } from "@/lib/auth/dal";
import { countNewFeedback } from "@/lib/feedback/count";
import { countNewReports } from "@/lib/reports/data";
import { countWaitingThreads } from "@/lib/support/data";

/** How long the shell waits for the New count before rendering without it. */
const COUNT_TIMEOUT_MS = 2000;

/**
 * What nobody has picked up yet -- feedback of every kind on the Feedback
 * section, reports on Reports, conversations waiting for us on Support -- as
 * badges beside the email notifications
 * (0011). Fail-soft: every admin
 * page renders through this layout, and none of them should go down or wait
 * long because the app project is slow or unreachable.
 */
async function newCount(label: string, count: () => Promise<number>): Promise<number | null> {
  try {
    return await Promise.race([
      count(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), COUNT_TIMEOUT_MS)),
    ]);
  } catch (error) {
    console.error(`[${label}] new count failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Pages call requireAdmin() too: a layout does not re-render on client
  // navigation, so on its own it would not re-check.
  const admin = await requireAdmin();

  // The sidebar remembers expanded/collapsed in this cookie (shadcn sidebar);
  // reading it here renders the right width on the first paint.
  const [sidebarState, newFeedback, newReports, waitingSupport] = await Promise.all([
    cookies().then((store) => store.get("sidebar_state")?.value),
    newCount("feedback", countNewFeedback),
    newCount("reports", countNewReports),
    newCount("support", countWaitingThreads),
  ]);
  const sectionCounts: Record<string, number> = {};
  if (newFeedback) sectionCounts["/admin/feedback"] = newFeedback;
  if (newReports) sectionCounts["/admin/reports"] = newReports;
  if (waitingSupport) sectionCounts["/admin/support"] = waitingSupport;

  return (
    <AdminShell
      email={admin.email}
      defaultOpen={sidebarState !== "false"}
      sectionCounts={sectionCounts}
    >
      {children}
    </AdminShell>
  );
}
