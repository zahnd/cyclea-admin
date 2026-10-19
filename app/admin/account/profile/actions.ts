"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/dal";
import { setSupportName } from "@/lib/support/signature";
import { supportNameError } from "@/lib/support/validation";

export type FormState = { error?: string; ok?: string };

/** The signed-in admin's own support signature. Nobody sets another admin's. */
export async function updateSupportName(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();

  const name = String(formData.get("support_name") ?? "").trim();
  const invalid = supportNameError(name);
  if (invalid) return { error: invalid };

  let changed: boolean;
  try {
    changed = await setSupportName(admin.userId, name, { id: admin.userId, label: admin.email });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[profile] support name of ${admin.userId} failed: ${message}`);
    return { error: "Could not save. Nothing was changed." };
  }

  revalidatePath("/admin/account/profile");
  // Thread pages show the signature and unlock the reply form.
  revalidatePath("/admin/support", "layout");
  if (!changed) return { ok: "No change." };
  return { ok: name ? "Saved." : "Cleared. You cannot reply to support messages until you set a name again." };
}
