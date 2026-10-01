import { PageHeader } from "@/components/page-header";
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { requireAdmin } from "@/lib/auth/dal";

import { NewCreatorForm } from "./new-creator-form";

export default async function NewCreatorPage() {
  await requireAdmin();

  return (
    <div className="max-w-3xl">
      <PageHeader crumbs={[{ label: "Creators", href: "/admin/creators" }, { label: "New creator" }]} title="New creator" />
      <Frame>
        <FrameHeader>
          <FrameTitle>Code and name</FrameTitle>
          <FrameDescription>
            The code works in the app as soon as it is created. On iOS it must also exist as a custom offer code in
            App Store Connect.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <NewCreatorForm />
        </FramePanel>
      </Frame>
    </div>
  );
}
