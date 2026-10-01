"use client";

import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";

/**
 * The authenticator code a sensitive action asks for when the last one is
 * older than five minutes (lib/auth/step-up.ts). Rendered only when the
 * action answered `needsCode`; the form then submits again with it.
 */
export function StepUpField({ show }: { show?: boolean }) {
  if (!show) return null;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
      <Label htmlFor="totp">Confirm with your authenticator</Label>
      <p className="text-xs text-muted-foreground">
        This action changes who can administer Cyclea, so it needs a current code.
      </p>
      <InputOTP id="totp" name="totp" maxLength={6} autoComplete="one-time-code" inputMode="numeric" pattern="^\d+$" autoFocus>
        <InputOTPGroup>
          {Array.from({ length: 6 }, (_, i) => (
            <InputOTPSlot key={i} index={i} />
          ))}
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
}
