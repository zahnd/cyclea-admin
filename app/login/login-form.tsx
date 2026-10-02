"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/reui/alert";
import { CodeField } from "@/components/code-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { login, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {
    step: "email",
  });

  if (state.step === "email") {
    return (
      <form action={action} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
        </div>
        {state.error && <FormError message={state.error} />}
        <Button type="submit" name="intent" value="send" disabled={pending}>
          {pending ? "Sending…" : "Send code"}
        </Button>
      </form>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="email" value={state.email} />
      <Alert>
        <AlertDescription>
          If {state.email} has access, a 6-digit code is on its way. It expires in 10 minutes.
        </AlertDescription>
      </Alert>
      <div className="flex flex-col gap-2">
        <Label htmlFor="code">Code</Label>
        <CodeField id="code" name="code" autoFocus />
      </div>
      {state.error && <FormError message={state.error} />}
      <Button type="submit" name="intent" value="verify" disabled={pending}>
        {pending ? "Checking…" : "Sign in"}
      </Button>
      <div className="flex justify-between">
        <Button type="submit" name="intent" value="send" variant="ghost" formNoValidate disabled={pending}>
          Send a new code
        </Button>
        <Button type="submit" name="intent" value="back" variant="ghost" formNoValidate disabled={pending}>
          Use a different email
        </Button>
      </div>
    </form>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
