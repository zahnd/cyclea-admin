import { PageHeader } from "@/components/page-header";
import { Frame, FramePanel } from "@/components/reui/frame";
import { requireAdmin } from "@/lib/auth/dal";

import { ManualForm } from "../app/manual-form";

/** Today in Zürich, as YYYY-MM-DD -- computed on the server and passed down, so nothing differs at hydration. */
function todayInZurich(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(new Date());
}

export default async function AddFeedbackPage() {
  await requireAdmin();

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader
        crumbs={[{ label: "Feedback" }, { label: "Add feedback" }]}
        title="Add feedback"
        description="Feedback about the app that reached us outside it — WhatsApp, in person, email. It joins App feedback, where it is triaged like everything else."
      />
      <Frame>
        <FramePanel>
          <ManualForm
            initial={{
              source: "whatsapp",
              category: "bug",
              message: "",
              receivedOn: todayInZurich(),
              appVersion: null,
              platform: null,
            }}
          />
        </FramePanel>
      </Frame>
    </div>
  );
}
