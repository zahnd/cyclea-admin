import { cookies } from "next/headers";

import { AdminShell } from "@/components/admin-shell/admin-shell";
import { requireAdmin } from "@/lib/auth/dal";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Pages call requireAdmin() too: a layout does not re-render on client
  // navigation, so on its own it would not re-check.
  const admin = await requireAdmin();

  // The sidebar remembers expanded/collapsed in this cookie (shadcn sidebar);
  // reading it here renders the right width on the first paint.
  const sidebarState = (await cookies()).get("sidebar_state")?.value;

  return (
    <AdminShell email={admin.email} defaultOpen={sidebarState !== "false"}>
      {children}
    </AdminShell>
  );
}
