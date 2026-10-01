"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/form-message";
import { StepUpField } from "@/components/step-up-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  adoptCreator,
  inviteCreatorLogin,
  removeCreatorLogin,
  renameCreator,
  setCreatorActive,
  updateCreatorRecord,
  type FormState,
} from "../actions";

export function RenameForm({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(renameCreator, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <Label htmlFor="name">Name</Label>
      <div className="flex gap-2">
        <Input id="name" name="name" defaultValue={name} required maxLength={200} autoComplete="off" />
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Saving…" : "Rename"}
        </Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function ActiveForm({ id, active }: { id: string; active: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(setCreatorActive, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <p className="text-sm text-muted-foreground">
        {active
          ? "New users can claim this code. Deactivating stops new claims; existing referrals are untouched."
          : "The code accepts no new claims. Existing referrals are untouched."}
      </p>
      <div>
        <Button type="submit" variant={active ? "destructive" : "outline"} disabled={pending}>
          {pending ? "Saving…" : active ? "Deactivate" : "Activate"}
        </Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function AdoptForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(adoptCreator, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <p className="text-sm text-muted-foreground">
        This creator exists in the app but has no business record here — it was created outside this admin, or
        the second half of its creation failed.
      </p>
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Adding…" : "Add record"}
        </Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function RecordForm({
  id,
  contractSignedOn,
  payeeReference,
  internalNote,
}: {
  id: string;
  contractSignedOn: string | null;
  payeeReference: string | null;
  internalNote: string | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateCreatorRecord, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="contract_signed_on">Contract signed on</Label>
        <Input
          id="contract_signed_on"
          name="contract_signed_on"
          type="date"
          defaultValue={contractSignedOn ?? ""}
          className="w-48"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="payee_reference">Payee reference</Label>
        <Input
          id="payee_reference"
          name="payee_reference"
          defaultValue={payeeReference ?? ""}
          maxLength={100}
          autoComplete="off"
          spellCheck={false}
        />
        <p className="text-xs text-muted-foreground">
          The Wise recipient id or the bank&apos;s payee reference. Never an IBAN or account number — those stay in
          Wise or the bank.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="internal_note">Internal note</Label>
        <Textarea id="internal_note" name="internal_note" defaultValue={internalNote ?? ""} maxLength={5000} rows={4} />
        <p className="text-xs text-muted-foreground">Admins only. Changes are logged, the text itself is not.</p>
      </div>
      <FormMessage state={state} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save record"}
        </Button>
      </div>
    </form>
  );
}

export function InviteLoginForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(inviteCreatorLogin, {});
  // Controlled: React resets a form after its action, and the email must
  // survive the round trip that asks for an authenticator code.
  const [email, setEmail] = useState("");
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <p className="text-sm text-muted-foreground">
        Gives this creator a login for the portal (their code, its status, sign-ups per month). No email is sent —
        tell them to sign in at admin.cyclea.app/portal with a code. Admins cannot also be creators.
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="portal-email">Creator&apos;s email</Label>
        <Input
          id="portal-email"
          name="email"
          type="email"
          required
          autoComplete="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <StepUpField show={state.needsCode} />
      <FormMessage state={state} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Inviting…" : "Give portal access"}
        </Button>
      </div>
    </form>
  );
}

export function RemoveLoginForm({ id, email }: { id: string; email: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(removeCreatorLogin, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{email}</span> signs in to the portal as this creator. Removing
        access ends that on their next click; the account stays, with no access.
      </p>
      <StepUpField show={state.needsCode} />
      <FormMessage state={state} />
      <div>
        <Button type="submit" variant="destructive" disabled={pending}>
          {pending ? "Removing…" : "Remove portal access"}
        </Button>
      </div>
    </form>
  );
}
