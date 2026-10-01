"use client";

import { LogOutIcon, UserIcon } from "lucide-react";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth/sign-out";

// The creator portal's frame: one page, so a top bar and no sidebar. Shares the
// app, the sign-in and the theme with /admin, nothing else.
export function PortalShell({ email, children }: { email: string; children: React.ReactNode }) {
  const [signingOut, startSignOut] = useTransition();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-50 border-b bg-background">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center gap-2 px-4">
          <span className="text-sm font-semibold">Cyclea Creators</span>
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="sm" aria-label="Account menu">
                    <UserIcon />
                    <span className="hidden max-w-48 truncate sm:inline">{email}</span>
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="min-w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={signingOut} onClick={() => startSignOut(() => signOut())}>
                  <LogOutIcon />
                  {signingOut ? "Signing out…" : "Sign out"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main id="content" className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
