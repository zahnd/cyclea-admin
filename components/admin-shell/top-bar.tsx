"use client";

import { LogOutIcon, UserIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { signOut } from "@/lib/auth/sign-out";
import { cn } from "@/lib/utils";
import { currentSection, sections } from "@/lib/nav";

export function TopBar({ email }: { email: string }) {
  const pathname = usePathname();
  const active = currentSection(pathname);
  const [signingOut, startSignOut] = useTransition();

  return (
    <header className="sticky top-0 z-50 flex w-full items-center border-b bg-background">
      <div className="flex h-(--header-height) w-full items-center gap-2 px-3 sm:px-4">
        {/* Collapses the sidebar to its icon rail on desktop; opens the drawer on phones. */}
        <SidebarTrigger />
        <Separator orientation="vertical" className="mr-1 data-vertical:h-4 data-vertical:self-auto" />
        <Link href="/admin" className="shrink-0 text-sm font-semibold">
          Cyclea Admin
        </Link>

        {/* Sections. Below md they live in the drawer instead. */}
        <nav aria-label="Sections" className="ml-4 hidden items-center gap-1 md:flex">
          {sections.map((section) => {
            const isActive = section === active;
            return (
              <Link
                key={section.href}
                href={section.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                  isActive ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {section.title}
              </Link>
            );
          })}
        </nav>

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
              <DropdownMenuItem
                disabled={signingOut}
                onClick={() => startSignOut(() => signOut())}
              >
                <LogOutIcon />
                {signingOut ? "Signing out…" : "Sign out"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
