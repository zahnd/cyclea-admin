import { cn } from "cn";

import { Input } from "@/components/ui/input";

/**
 * A 6-digit code (email sign-in code, authenticator code) as one plain,
 * visible input. Not shadcn's six-box `input-otp`: Bitwarden's inline
 * suggestion cannot fill that field, only its keyboard shortcut can (tested
 * 2026-10-01; guilhermerodz/input-otp#152). A plain input fills both ways.
 *
 * No `maxLength` or `pattern`: a pasted " 123 456" must arrive whole. The
 * server actions strip whitespace and check for six digits.
 */
export function CodeField({ className, ...props }: React.ComponentProps<typeof Input>) {
  return (
    <Input
      autoComplete="one-time-code"
      inputMode="numeric"
      autoCapitalize="off"
      spellCheck={false}
      className={cn("w-36 text-center font-mono text-base tracking-[0.3em] md:text-base", className)}
      {...props}
    />
  );
}
