import { PageHeader } from "@/components/page-header";
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { requireAdmin } from "@/lib/auth/dal";

import { AddAdminForm } from "./add-admin-form";

export default async function AddAdminPage() {
  await requireAdmin();

  return (
    <div className="max-w-3xl">
      <PageHeader crumbs={[{ label: "Users", href: "/admin/users" }, { label: "Add admin" }]} title="Add admin" />
      <Frame>
        <FrameHeader>
          <FrameTitle>Email address</FrameTitle>
          <FrameDescription>
            The account is created if it does not exist; an existing account without access becomes an admin. No
            email is sent: tell them to sign in at /login with a code, then set up an authenticator.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <AddAdminForm />
        </FramePanel>
      </Frame>
    </div>
  );
}
