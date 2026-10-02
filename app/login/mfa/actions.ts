"use server";

import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/dal";
import { adminDbAsUser } from "@/lib/db/admin-as-user";

export type MfaState =
  | { mode: "enroll-start"; error?: string }
  | { mode: "enroll"; factorId: string; qrCode: string; secret: string; error?: string }
  | { mode: "challenge"; factorId: string; error?: string };

const CODE = /^\d{6}$/;

/** The one action behind enrolment and challenge; the submit button names the intent. */
export async function mfa(prev: MfaState, formData: FormData): Promise<MfaState> {
  // An admin who has passed the email code, whatever the state of their TOTP.
  await requireAdmin({ allowStaleTotp: true });

  switch (formData.get("intent")) {
    case "enroll":
      return startEnrolment();
    case "verify":
      return verify(prev, formData);
    default:
      return prev;
  }
}

async function startEnrolment(): Promise<MfaState> {
  const supabase = await adminDbAsUser();

  // An abandoned enrolment leaves an unverified factor behind, and a second
  // one with the same name is refused -- clear them before starting again.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type === "totp" && factor.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    issuer: "Cyclea Admin",
    friendlyName: "Authenticator app",
  });
  if (error || !data) {
    console.warn(`[mfa] enroll: ${error?.code ?? error?.message}`);
    return { mode: "enroll-start", error: "Could not start the setup. Try again." };
  }

  return {
    mode: "enroll",
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  };
}

async function verify(prev: MfaState, formData: FormData): Promise<MfaState> {
  if (prev.mode === "enroll-start") return prev;
  const code = String(formData.get("code") ?? "").replace(/\s+/g, "");
  if (!CODE.test(code)) {
    return { ...prev, error: "Enter the 6-digit code from your authenticator app." };
  }

  // `prev` round-trips through the browser, so its factor id is as forgeable as
  // any form field. Accept only one of this user's own TOTP factors.
  const supabase = await adminDbAsUser();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const owned = (factors?.all ?? []).some(
    (factor) => factor.id === prev.factorId && factor.factor_type === "totp",
  );
  if (!owned) return { mode: "enroll-start", error: "Start the setup again." };

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: prev.factorId,
    code,
  });
  if (error) {
    return { ...prev, error: "That code did not work. Codes change every 30 seconds — try the current one." };
  }

  redirect("/admin");
}
