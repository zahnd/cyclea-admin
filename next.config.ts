import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A public host does not need to advertise its framework.
  poweredByHeader: false,
  // Admins became a role inside Users, and the audit log its own section
  // (2026-10-01). Old links and bookmarks still land on the right page.
  async redirects() {
    return [
      { source: "/admin/admins/audit", destination: "/admin/audit", permanent: true },
      { source: "/admin/admins/new", destination: "/admin/users/new", permanent: true },
      { source: "/admin/admins/:id", destination: "/admin/users/:id", permanent: true },
      { source: "/admin/admins", destination: "/admin/users", permanent: true },
    ];
  },
};

export default nextConfig;
