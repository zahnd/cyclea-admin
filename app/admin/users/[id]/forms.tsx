"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/form-message";
import { StepUpField } from "@/components/step-up-field";
import { Button } from "@/components/ui/button";

import {
  deleteAccount,
  grantAdmin,
  resetAuthenticator,
  revokeAdmin,
  type UserFormState,
} from "../actions";

type Action = (prev: UserFormState, formData: FormData) => Promise<UserFormState>;

/** One role-changing action: hidden id, explanation, step-up field, button. */
function ActionForm({
  action,
  id,
  explanation,
  label,
  pendingLabel,
  variant,
}: {
  action: Action;
  id: string;
  explanation: React.ReactNode;
  label: string;
  pendingLabel: string;
  variant: "default" | "outline" | "destructive";
}) {
  const [state, formAction, pending] = useActionState<UserFormState, FormData>(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <p className="text-sm text-muted-foreground">{explanation}</p>
      <StepUpField show={state.needsCode} />
      <FormMessage state={state} />
      <div>
        <Button type="submit" variant={variant} disabled={pending}>
          {pending ? pendingLabel : label}
        </Button>
      </div>
    </form>
  );
}

export function RevokeForm({ id, email }: { id: string; email: string }) {
  return (
    <ActionForm
      action={revokeAdmin}
      id={id}
      variant="destructive"
      label="Revoke admin access"
      pendingLabel="Revoking…"
      explanation={`${email} loses access on their next click. The account stays and can be made an admin again. The last admin cannot be revoked.`}
    />
  );
}

export function GrantForm({ id, email }: { id: string; email: string }) {
  return (
    <ActionForm
      action={grantAdmin}
      id={id}
      variant="outline"
      label="Make admin"
      pendingLabel="Granting…"
      explanation={`${email} gets full access to this panel, after signing in with a code and an authenticator.`}
    />
  );
}

export function ResetAuthenticatorForm({ id, email }: { id: string; email: string }) {
  return (
    <ActionForm
      action={resetAuthenticator}
      id={id}
      variant="outline"
      label="Reset authenticator"
      pendingLabel="Resetting…"
      explanation={`For a lost phone. Removes ${email}'s authenticator; they set up a new one at their next sign-in. Sessions they already have stay valid until the 12-hour re-check — revoke instead if the account may be compromised.`}
    />
  );
}

export function DeleteForm({ id, email }: { id: string; email: string }) {
  return (
    <ActionForm
      action={deleteAccount}
      id={id}
      variant="destructive"
      label="Delete account"
      pendingLabel="Deleting…"
      explanation={`Deletes ${email}'s login for good: the account, its sessions and authenticator. Cannot be undone. Its audit history stays.`}
    />
  );
}
