"use client";

import Image from "next/image";
import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/reui/alert";
import { CodeField } from "@/components/code-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { signOut } from "@/lib/auth/sign-out";

import { mfa, type MfaState } from "./actions";

export function MfaForm({ initial }: { initial: MfaState }) {
  const [state, action, pending] = useActionState<MfaState, FormData>(mfa, initial);

  return (
    <div className="flex flex-col gap-4">
      {state.mode === "enroll-start" ? (
        <form action={action} className="flex flex-col gap-4">
          <p className="text-sm">
            Use an app such as 1Password, Google Authenticator or Authy. You will scan a QR code
            and confirm with the code it shows.
          </p>
          {state.error && <FormError message={state.error} />}
          <Button type="submit" name="intent" value="enroll" disabled={pending}>
            {pending ? "Preparing…" : "Set up authenticator"}
          </Button>
        </form>
      ) : (
        <form action={action} className="flex flex-col gap-4">
          {state.mode === "enroll" && (
            <div className="flex flex-col items-center gap-3">
              {/* An SVG data URI from Supabase; nothing for the image optimizer to fetch. */}
              <Image src={state.qrCode} alt="QR code for your authenticator app" width={180} height={180} unoptimized />
              <p className="text-center text-xs text-muted-foreground">
                Cannot scan? Enter this key instead:
                <br />
                <code className="font-mono break-all">{state.secret}</code>
              </p>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="code">Code from your authenticator</Label>
            <CodeField id="code" name="code" autoFocus />
          </div>
          {state.error && <FormError message={state.error} />}
          <Button type="submit" name="intent" value="verify" disabled={pending}>
            {pending ? "Checking…" : state.mode === "enroll" ? "Confirm and continue" : "Continue"}
          </Button>
        </form>
      )}
      <form action={signOut}>
        <Button type="submit" variant="ghost" className="w-full">
          Sign out
        </Button>
      </form>
    </div>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
