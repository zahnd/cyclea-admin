import { cookies } from "next/headers";

import { AdminShell } from "@/components/admin-shell/admin-shell";
import { requireAdmin } from "@/lib/auth/dal";
import { countNewAppFeedback } from "@/lib/feedback/data";

/** How long the shell waits for the New count before rendering without it. */
const COUNT_TIMEOUT_MS = 2000;

/**
 * Untriaged feedback of every kind (app feedback only, so far), for the badge
 * on the Feedback section -- the signal that something came in, until
 * notifications exist. Fail-soft: every admin
 * page renders through this layout, and none of them should go down or wait
 * long because the app project is slow or unreachable.
 */
async function newFeedbackCount(): Promise<number | null> {
  try {
    return await Promise.race([
      countNewAppFeedback(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), COUNT_TIMEOUT_MS)),
    ]);
  } catch (error) {
    console.error(`[feedback] new count failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Pages call requireAdmin() too: a layout does not re-render on client
  // navigation, so on its own it would not re-check.
  const admin = await requireAdmin();

  // The sidebar remembers expanded/collapsed in this cookie (shadcn sidebar);
  // reading it here renders the right width on the first paint.
  const [sidebarState, newFeedback] = await Promise.all([
    cookies().then((store) => store.get("sidebar_state")?.value),
    newFeedbackCount(),
  ]);

  return (
    <AdminShell
      email={admin.email}
      defaultOpen={sidebarState !== "false"}
      sectionCounts={newFeedback ? { "/admin/feedback": newFeedback } : {}}
    >
      {children}
    </AdminShell>
  );
}
