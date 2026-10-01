import {
  ListIcon,
  PlusIcon,
  ScrollTextIcon,
  ShieldIcon,
  UserPlusIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

// The admin's navigation, in one place: sections in the top bar, the current
// section's pages in the sidebar. Only routes that exist -- a link to a page
// that is not built yet is a broken promise, not a placeholder.

export type NavPage = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Whether this page is the current one for a pathname. */
  match: (pathname: string) => boolean;
};

export type NavSection = {
  title: string;
  href: string;
  icon: LucideIcon;
  pages: NavPage[];
};

const under = (base: string) => (pathname: string) =>
  pathname === base || pathname.startsWith(`${base}/`);

export const sections: NavSection[] = [
  {
    title: "Creators",
    href: "/admin/creators",
    icon: UsersIcon,
    pages: [
      {
        title: "All creators",
        href: "/admin/creators",
        icon: ListIcon,
        // A creator's own page belongs here too; only /new is its own page.
        match: (p) => under("/admin/creators")(p) && !under("/admin/creators/new")(p),
      },
      {
        title: "New creator",
        href: "/admin/creators/new",
        icon: PlusIcon,
        match: under("/admin/creators/new"),
      },
    ],
  },
  {
    title: "Admins",
    href: "/admin/admins",
    icon: ShieldIcon,
    pages: [
      {
        title: "All admins",
        href: "/admin/admins",
        icon: ListIcon,
        match: (p) =>
          under("/admin/admins")(p) && !under("/admin/admins/new")(p) && !under("/admin/admins/audit")(p),
      },
      {
        title: "Add admin",
        href: "/admin/admins/new",
        icon: UserPlusIcon,
        match: under("/admin/admins/new"),
      },
      {
        title: "Audit log",
        href: "/admin/admins/audit",
        icon: ScrollTextIcon,
        match: under("/admin/admins/audit"),
      },
    ],
  },
];

export function currentSection(pathname: string): NavSection | undefined {
  return sections.find((section) => under(section.href)(pathname));
}
