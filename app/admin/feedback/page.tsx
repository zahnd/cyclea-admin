import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/dal";

// The Feedback section holds one page per kind of feedback; app feedback is
// the first, so the section's own address lands there.
export default async function FeedbackSectionPage() {
  await requireAdmin();
  redirect("/admin/feedback/app");
}
