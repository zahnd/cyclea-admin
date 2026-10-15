import { PageHeader } from "@/components/page-header";
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { requireAdmin } from "@/lib/auth/dal";
import { getSettings } from "@/lib/notifications/settings";

import { SettingsForm } from "./settings-form";

export default async function NotificationSettingsPage() {
  const admin = await requireAdmin();
  const settings = await getSettings(admin.userId);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader
        crumbs={[{ label: "Account" }, { label: "Notification settings" }]}
        title="Notification settings"
        description={`Emails to ${admin.email} when something new arrives. They say what arrived and link here; they never contain what users wrote.`}
      />
      <Frame>
        <FrameHeader>
          <FrameTitle>Email me</FrameTitle>
          <FrameDescription>
            Immediately means within about five minutes, one email for everything new. The daily summary comes at 08:00
            Zürich time, only when there is something in it. Each item is sent once.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <SettingsForm initial={settings} />
        </FramePanel>
      </Frame>
    </div>
  );
}
