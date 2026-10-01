"use server";

import { redirect } from "next/navigation";

import { adminDbAsUser } from "@/lib/db/admin-as-user";

// Deliberately not behind requireAdmin(): anyone holding a session may end it,
// including one stuck halfway through sign-in.
export async function signOut() {
  const supabase = await adminDbAsUser();
  await supabase.auth.signOut();
  redirect("/login");
}
