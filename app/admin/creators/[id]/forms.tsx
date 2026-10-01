"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/form-message";
import { StepUpField } from "@/components/step-up-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUSES,
  isContractStatus,
  isPayoutMethod,
  PAYOUT_METHOD_LABELS,
  PAYOUT_METHODS,
  type ContractStatus,
  type PayoutMethod,
} from "@/lib/creators/validation";

import {
  adoptCreator,
  inviteCreatorLogin,
  removeCreatorLogin,
  renameCreator,
  setCreatorActive,
  updateCreatorContract,
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

const PAYOUT_METHOD_ITEMS = [
  { value: "", label: "Not set" },
  ...PAYOUT_METHODS.map((value) => ({ value, label: PAYOUT_METHOD_LABELS[value] })),
];

const PAYEE_HINTS: Record<PayoutMethod | "", string> = {
  "": "Choose the payout method first; the reference says where to find the payee there.",
  bank: "The payee's name in your e-banking.",
  wise: "The Wise recipient id.",
};

export function RecordForm({
  id,
  payoutMethod,
  payeeReference,
  internalNote,
}: {
  id: string;
  payoutMethod: PayoutMethod | null;
  payeeReference: string | null;
  internalNote: string | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateCreatorRecord, {});
  const [method, setMethod] = useState<PayoutMethod | "">(payoutMethod ?? "");
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="payout_method" value={method} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="payout_method">Payout method</Label>
        <Select
          items={PAYOUT_METHOD_ITEMS}
          value={method}
          onValueChange={(value) => setMethod(value && isPayoutMethod(value) ? value : "")}
        >
          <SelectTrigger id="payout_method" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {PAYOUT_METHOD_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
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
          {PAYEE_HINTS[method]} Never an IBAN or account number — those stay in the bank or Wise, and come from the
          signed contract.
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

const CONTRACT_STATUS_ITEMS = CONTRACT_STATUSES.map((value) => ({ value, label: CONTRACT_STATUS_LABELS[value] }));

export function ContractForm({
  id,
  status: savedStatus,
  signedOn,
  endedOn,
  url,
}: {
  id: string;
  status: ContractStatus;
  signedOn: string | null;
  endedOn: string | null;
  url: string | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateCreatorContract, {});
  const [status, setStatus] = useState<ContractStatus>(savedStatus);
  const needsSigned = status === "signed" || status === "ended";
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="contract_status" value={status} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="contract_status">State</Label>
        <Select
          items={CONTRACT_STATUS_ITEMS}
          value={status}
          onValueChange={(value) => value && isContractStatus(value) && setStatus(value)}
        >
          <SelectTrigger id="contract_status" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {CONTRACT_STATUS_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          A declined or withdrawn request goes back to No contract; the audit log keeps the history.
        </p>
      </div>
      {needsSigned && (
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="contract_signed_on">Signed on</Label>
            <Input
              id="contract_signed_on"
              name="contract_signed_on"
              type="date"
              required
              defaultValue={signedOn ?? ""}
              className="w-48"
            />
          </div>
          {status === "ended" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="contract_ended_on">Ended on</Label>
              <Input
                id="contract_ended_on"
                name="contract_ended_on"
                type="date"
                required
                defaultValue={endedOn ?? ""}
                className="w-48"
              />
            </div>
          )}
        </div>
      )}
      {status === "ended" && (
        <p className="text-xs text-muted-foreground">
          Ending the contract does not deactivate the code — use Deactivate above if new users should no longer
          claim it.
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="contract_url">Skribble link</Label>
        <Input
          id="contract_url"
          name="contract_url"
          type="url"
          defaultValue={url ?? ""}
          maxLength={500}
          placeholder="https://my.skribble.com/…"
          autoComplete="off"
          spellCheck={false}
        />
        <p className="text-xs text-muted-foreground">
          Only a Skribble link — never a file share. The contract and the bank details in it stay in Skribble.
        </p>
      </div>
      <FormMessage state={state} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save contract"}
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
