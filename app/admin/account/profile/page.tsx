import { PageHeader } from "@/components/page-header";
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { requireAdmin } from "@/lib/auth/dal";
import { getSupportName } from "@/lib/support/signature";

import { SupportNameForm } from "./support-name-form";

export default async function ProfilePage() {
  const admin = await requireAdmin();
  const supportName = await getSupportName(admin.userId);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader
        crumbs={[{ label: "Account" }, { label: "Profile" }]}
        title="Profile"
        description={`Settings for ${admin.email}.`}
      />
      <Frame>
        <FrameHeader>
          <FrameTitle>Support signature</FrameTitle>
          <FrameDescription>
            Every reply to a support message is signed with your first name. Changing it later does not change replies
            already sent.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <SupportNameForm initial={supportName} />
        </FramePanel>
      </Frame>
    </div>
  );
}
