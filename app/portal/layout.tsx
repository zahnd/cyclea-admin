import type { Metadata } from "next";

import { PortalShell } from "@/components/portal-shell";
import { requireCreator } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Cyclea Creators" };

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  // The page calls requireCreator() too: a layout does not re-render on client
  // navigation, so on its own it would not re-check.
  const creator = await requireCreator();
  return <PortalShell email={creator.email}>{children}</PortalShell>;
}
