import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/dal";
import { signOut } from "@/lib/auth/sign-out";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Pages call requireAdmin() too: a layout does not re-render on client
  // navigation, so on its own it would not re-check.
  const admin = await requireAdmin();

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <nav className="flex items-center gap-4">
          <span className="text-sm font-semibold">Cyclea Admin</span>
          <Link href="/admin/creators" className="text-sm text-muted-foreground hover:text-foreground">
            Creators
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{admin.email}</span>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
