"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { FormMessage } from "@/components/form-message";
import { StepUpField } from "@/components/step-up-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { addAdmin, type UserFormState } from "../actions";

export function AddAdminForm() {
  const [state, action, pending] = useActionState<UserFormState, FormData>(addAdmin, {});
  // Controlled: React resets a form after its action, and the email must
  // survive the round trip that asks for an authenticator code.
  const [email, setEmail] = useState("");

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="off"
          autoFocus={!state.needsCode}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <StepUpField show={state.needsCode} />
      <FormMessage state={state} />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add admin"}
        </Button>
        <Button variant="ghost" nativeButton={false} render={<Link href="/admin/users" />}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
