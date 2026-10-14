import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A public host does not need to advertise its framework.
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // The default is 1 MB. A manual feedback entry can carry an image of up
      // to 5 MB (IMAGE_MAX_BYTES), plus the form's other fields and the
      // multipart overhead. The proxy buffers up to 10 MB, so it is not the
      // limit.
      bodySizeLimit: "6mb",
    },
  },
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
