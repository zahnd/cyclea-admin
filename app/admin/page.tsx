import { requireAdmin } from "@/lib/auth/dal";

// Placeholder until the first admin feature exists.
export default async function AdminHome() {
  const admin = await requireAdmin();

  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-lg font-semibold">Signed in</h1>
      <p className="text-sm text-muted-foreground">
        {admin.email} — nothing to administer yet.
      </p>
    </div>
  );
}
