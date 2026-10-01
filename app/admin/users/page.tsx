import { PageHeader } from "@/components/page-header";
import { requireAdmin } from "@/lib/auth/dal";
import { listUsers } from "@/lib/users/data";

import { UsersGrid } from "./users-grid";

export default async function UsersPage() {
  const me = await requireAdmin();
  const users = await listUsers();

  return (
    <>
      <PageHeader
        title="Users"
        description="Every account that can sign in here, and what it may do. App users are not here — they live in the app's own database."
      />
      <UsersGrid
        rows={users.map((user) => ({
          userId: user.userId,
          email: user.email,
          isYou: user.userId === me.userId,
          role: user.role,
          creatorCode: user.creatorCode,
          createdAt: user.createdAt,
          lastSignInAt: user.lastSignInAt,
          hasAuthenticator: user.hasAuthenticator,
        }))}
      />
    </>
  );
}
