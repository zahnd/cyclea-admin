"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";

import { revoke, type FormState } from "./actions";

export function RevokeButton({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(revoke, {});
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="client_id" value={clientId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Revoking…" : "Revoke"}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}
