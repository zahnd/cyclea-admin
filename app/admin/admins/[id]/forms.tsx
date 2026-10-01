"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/form-message";
import { StepUpField } from "@/components/step-up-field";
import { Button } from "@/components/ui/button";

import { resetAuthenticator, revokeAdmin, type AdminFormState } from "../actions";

export function ResetAuthenticatorForm({ id, email }: { id: string; email: string }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(resetAuthenticator, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <p className="text-sm text-muted-foreground">
        For a lost phone. Removes {email}&apos;s authenticator; they set up a new one at their next sign-in. Sessions
        they already have stay valid until the 12-hour re-check — revoke instead if the account may be compromised.
      </p>
      <StepUpField show={state.needsCode} />
      <FormMessage state={state} />
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Resetting…" : "Reset authenticator"}
        </Button>
      </div>
    </form>
  );
}

export function RevokeForm({ id, email }: { id: string; email: string }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(revokeAdmin, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <p className="text-sm text-muted-foreground">
        {email} loses access on their next click. The account stays and can be made an admin again; the change is
        in the audit log.
      </p>
      <StepUpField show={state.needsCode} />
      <FormMessage state={state} />
      <div>
        <Button type="submit" variant="destructive" disabled={pending}>
          {pending ? "Revoking…" : "Revoke admin access"}
        </Button>
      </div>
    </form>
  );
}
