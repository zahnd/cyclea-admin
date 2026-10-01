"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeCode } from "@/lib/creators/validation";

import { createCreator, type FormState } from "../actions";
import { FormMessage } from "../form-message";

export function NewCreatorForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createCreator, {});
  const [code, setCode] = useState("");

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="code">Code</Label>
        <Input
          id="code"
          name="code"
          required
          autoFocus
          autoComplete="off"
          spellCheck={false}
          maxLength={80}
          className="font-mono uppercase"
          value={code}
          // Shown the way it will be stored, so nobody is surprised later.
          onChange={(event) => setCode(normalizeCode(event.target.value))}
        />
        <p className="text-xs text-muted-foreground">
          What the creator says and users type: letters A–Z and digits 0–9, 2–64 characters. It cannot be
          changed later.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required maxLength={200} autoComplete="off" />
      </div>
      <FormMessage state={state} />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create creator"}
        </Button>
        <Button variant="ghost" nativeButton={false} render={<Link href="/admin/creators" />}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
