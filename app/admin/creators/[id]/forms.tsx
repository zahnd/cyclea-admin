"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  adoptCreator,
  renameCreator,
  setCreatorActive,
  updateCreatorRecord,
  type FormState,
} from "../actions";
import { FormMessage } from "../form-message";

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
