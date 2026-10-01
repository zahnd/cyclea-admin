import "server-only";

import { getClaims, lastTotpAt } from "@/lib/auth/dal";
import { adminDbAsUser } from "@/lib/db/admin-as-user";

/**
 * Step-up for the most powerful actions -- granting or revoking admin rights,
 * resetting someone's authenticator. On top of the 12-hour rule in the DAL,
 * these need an authenticator code from the last five minutes, so a session
 * that was left open (or stolen) cannot add an admin on its own.
 */
export const STEP_UP_SECONDS = 5 * 60;

const CODE = /^\d{6}$/;

export type StepUp = { ok: true } | { ok: false; needsCode: true; error?: string };

/**
 * Passes when a TOTP code was verified in the last five minutes. Otherwise
 * verifies the `totp` field of the form, if there is one -- which refreshes the
 * session with a new timestamp, so the next sensitive action within five
 * minutes passes without asking again.
 */
export async function requireRecentTotp(formData: FormData): Promise<StepUp> {
  const claims = await getClaims();
  const at = claims ? lastTotpAt(claims) : null;
  if (at !== null && Date.now() / 1000 - at < STEP_UP_SECONDS) return { ok: true };

  const code = String(formData.get("totp") ?? "").trim();
  if (!code) return { ok: false, needsCode: true };
  if (!CODE.test(code)) {
    return { ok: false, needsCode: true, error: "Enter the 6-digit code from your authenticator app." };
  }

  const supabase = await adminDbAsUser();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp[0];
  if (!factor) return { ok: false, needsCode: true, error: "No authenticator is set up for this account." };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) {
    return {
      ok: false,
      needsCode: true,
      error: "That code did not work. Codes change every 30 seconds — try the current one.",
    };
  }
  return { ok: true };
}
