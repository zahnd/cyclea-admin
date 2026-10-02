"use client";

import { CodeField } from "@/components/code-field";
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
      <CodeField id="totp" name="totp" autoFocus />
    </div>
  );
}
