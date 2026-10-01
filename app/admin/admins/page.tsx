import { PageHeader } from "@/components/page-header";
import { listAdmins } from "@/lib/admins/data";
import { requireAdmin } from "@/lib/auth/dal";

import { AdminsGrid } from "./admins-grid";

export default async function AdminsPage() {
  const me = await requireAdmin();
  const admins = await listAdmins();

  return (
    <>
      <PageHeader
        title="Admins"
        description="Who can sign in to this panel. Every admin signs in with an email code and an authenticator app."
      />
      <AdminsGrid rows={admins.map((admin) => ({ ...admin, isYou: admin.userId === me.userId }))} />
    </>
  );
}
