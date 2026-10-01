"use client";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

import { AppSidebar } from "./app-sidebar";
import { TopBar } from "./top-bar";

// The signed-in frame: a sticky top bar for sections and the account, the
// current section's pages in a sidebar below it (an icon rail when collapsed,
// a drawer on phones). Knows nothing about auth -- the admin layout checks
// that and passes the email in.
export function AdminShell({
  email,
  defaultOpen,
  children,
}: {
  email: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="[--header-height:calc(--spacing(14))]">
      <a
        href="#content"
        // not-sr-only resets padding, so the visible styles are all focus: ones.
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow-md focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <SidebarProvider defaultOpen={defaultOpen} className="flex flex-col">
        <TopBar email={email} />
        <div className="flex flex-1">
          <AppSidebar />
          <SidebarInset id="content" className="min-w-0 p-4 sm:p-6">
            {children}
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}
