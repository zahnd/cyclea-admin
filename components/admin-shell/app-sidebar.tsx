"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { currentSection, sections } from "@/lib/nav";

export function AppSidebar() {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const section = currentSection(pathname);
  // A link tap in the phone drawer should close it.
  const close = () => isMobile && setOpenMobile(false);

  return (
    // Offset below the sticky top bar, as in shadcn's sidebar-16 block.
    <Sidebar collapsible="icon" className="top-(--header-height) h-[calc(100svh-var(--header-height))]!">
      <SidebarContent>
        {isMobile && (
          // The top bar's section links are hidden on phones; they live here.
          <SidebarGroup>
            <SidebarGroupLabel>Sections</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {sections.map((s) => (
                  <SidebarMenuItem key={s.href}>
                    <SidebarMenuButton
                      isActive={s === section}
                      render={<Link href={s.href} onClick={close} aria-current={s === section ? "page" : undefined} />}
                    >
                      <s.icon />
                      <span>{s.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {section && (
          <SidebarGroup>
            <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.pages.map((page) => {
                  const isActive = page.match(pathname);
                  return (
                    <SidebarMenuItem key={page.href}>
                      <SidebarMenuButton
                        isActive={isActive}
                        tooltip={page.title}
                        render={<Link href={page.href} onClick={close} aria-current={isActive ? "page" : undefined} />}
                      >
                        <page.icon />
                        <span>{page.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
