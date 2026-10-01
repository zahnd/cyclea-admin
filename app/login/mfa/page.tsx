import { redirect } from "next/navigation";

import { getClaims, hasFreshTotp, requireAdmin } from "@/lib/auth/dal";
import { adminDbAsUser } from "@/lib/db/admin-as-user";

import type { MfaState } from "./actions";
import { MfaForm } from "./mfa-form";

export default async function MfaPage() {
  const admin = await requireAdmin({ allowStaleTotp: true });

  const claims = await getClaims();
  if (claims && hasFreshTotp(claims)) redirect("/admin");

  const supabase = await adminDbAsUser();
  const { data } = await supabase.auth.mfa.listFactors();
  const factor = data?.totp[0];

  const initial: MfaState = factor
    ? { mode: "challenge", factorId: factor.id }
    : { mode: "enroll-start" };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">
          {factor ? "Authenticator code" : "Set up an authenticator"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {factor
            ? `Signed in as ${admin.email}. Enter the current code from your authenticator app.`
            : `Signed in as ${admin.email}. Admin access needs an authenticator app as a second step, every time.`}
        </p>
      </div>
      <MfaForm initial={initial} />
    </div>
  );
}
