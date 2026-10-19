"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signatureLabel, SUPPORT_NAME_MAX } from "@/lib/support/validation";

import { updateSupportName, type FormState } from "./actions";

export function SupportNameForm({ initial }: { initial: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateSupportName, {});
  // Controlled: React resets a form after its action, and a refused save must
  // not lose what was typed.
  const [name, setName] = useState(initial ?? "");
  const preview = name.trim();

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="support_name">First name</Label>
        <Input
          id="support_name"
          name="support_name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={SUPPORT_NAME_MAX}
          autoComplete="given-name"
          className="max-w-xs"
        />
        <p className="text-xs text-muted-foreground">
          {preview ? (
            <>
              Your replies show in the app as <span className="font-medium text-foreground">{signatureLabel(preview)}</span>.
            </>
          ) : (
            "Without a name you cannot reply to support messages."
          )}{" "}
          Users see it; use a first name only.
        </p>
      </div>
      <FormMessage state={state} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
