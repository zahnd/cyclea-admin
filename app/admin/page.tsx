import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/dal";

// Creators is the only admin feature so far.
export default async function AdminHome() {
  await requireAdmin();
  redirect("/admin/creators");
}
