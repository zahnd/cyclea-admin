"use server";

import { redirect } from "next/navigation";

import { getRole } from "@/lib/auth/dal";
import { adminDbAsUser } from "@/lib/db/admin-as-user";

export type LoginState =
  | { step: "email"; error?: string }
  | { step: "code"; email: string; error?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE = /^\d{6}$/;

/** The one action behind both steps; the submit button names the intent. */
export async function login(
  prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  switch (formData.get("intent")) {
    case "send":
      return sendCode(formData);
    case "verify":
      return verifyCode(formData);
    case "back":
      return { step: "email" };
    default:
      return prev;
  }
}

async function sendCode(formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 320) {
    return { step: "email", error: "Enter a valid email address." };
  }

  const supabase = await adminDbAsUser();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    // Never create an account from this form: admins are added by script.
    options: { shouldCreateUser: false },
  });

  // Every outcome reads the same, whether the address has an account, has
  // none, or hit the one-per-minute limit -- otherwise this form would tell a
  // stranger which addresses are admins. The real reason goes to the log.
  if (error) console.warn(`[login] signInWithOtp: ${error.code ?? error.message}`);

  return { step: "code", email };
}

async function verifyCode(formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("code") ?? "").replace(/\s+/g, "");
  if (!EMAIL.test(email)) return { step: "email" };
  if (!CODE.test(token)) {
    return { step: "code", email, error: "Enter the 6-digit code from the email." };
  }

  const supabase = await adminDbAsUser();
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error || !data.user) {
    return {
      step: "code",
      email,
      error: "That code did not work. It may have expired — request a new one.",
    };
  }

  // Signed in at aal1. Where next depends on the role: admins go on to the
  // authenticator step; creators need nothing more (decided 2026-10-01).
  const role = await getRole(data.user.id);
  if (role.kind === "admin") redirect("/login/mfa");
  if (role.kind === "creator") redirect("/portal");
  // No role: nothing here for this account. End the session it just got.
  await supabase.auth.signOut();
  redirect("/login?denied=1");
}
