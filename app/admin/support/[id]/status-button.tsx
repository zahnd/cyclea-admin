"use client";

import { useActionState, useRef, useState } from "react";

import { FormMessage } from "@/components/form-message";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

import { changeStatus, type FormState } from "../actions";

/**
 * Close an open or answered conversation, or reopen a closed one.
 *
 * Closing asks first: on a detail page a bare "Close" read like closing the
 * page and going back to the list. Reopening is harmless and goes straight
 * through.
 */
export function StatusButton({ id, closed }: { id: string; closed: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(changeStatus, {});
  const [confirming, setConfirming] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={closed ? "open" : "closed"} />
      {closed ? (
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "Reopening…" : "Reopen"}
        </Button>
      ) : (
        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogTrigger render={<Button type="button" size="sm" variant="outline" disabled={pending} />}>
            {pending ? "Closing…" : "Close ticket"}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Close this ticket?</AlertDialogTitle>
              <AlertDialogDescription>
                The conversation ends for the user too. If they write again, it starts a new one. You can
                reopen this one later, as long as they haven&apos;t started a new one.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              {/* The dialog renders in a portal, outside the form. */}
              <AlertDialogAction
                onClick={() => {
                  form.current?.requestSubmit();
                  setConfirming(false);
                }}
              >
                Close ticket
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      <FormMessage state={state} />
    </form>
  );
}
