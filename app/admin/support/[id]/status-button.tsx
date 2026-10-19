"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";

import { changeStatus, type FormState } from "../actions";

/** Close an open or answered conversation, or reopen a closed one. */
export function StatusButton({ id, closed }: { id: string; closed: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(changeStatus, {});
  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={closed ? "open" : "closed"} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {closed ? (pending ? "Reopening…" : "Reopen") : pending ? "Closing…" : "Close"}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}
