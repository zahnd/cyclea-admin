import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/reui/badge";
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { requireCreator } from "@/lib/auth/dal";
import { getAppCreator, listReferralCounts } from "@/lib/creators/data";

import { ReferralsGrid } from "./referrals-grid";

export default async function PortalHome() {
  // The creator id comes from the session's link, never from the request.
  const { creatorId } = await requireCreator();
  const [creator, months] = await Promise.all([getAppCreator(creatorId), listReferralCounts(creatorId)]);
  const total = months.reduce((sum, m) => sum + m.referrals, 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={creator ? `Hi ${creator.name}` : "Your creator code"}
        description="How your code is doing. Counts are per month, and never show who signed up."
      />

      <Frame>
        <FrameHeader>
          <FrameTitle>Your code</FrameTitle>
          <FrameDescription>
            People enter it in the Cyclea app when they sign up, or on the subscription screen.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-3xl font-semibold tracking-wide">{creator?.code ?? "—"}</span>
          {creator &&
            (creator.active ? (
              <Badge variant="success-outline">Active</Badge>
            ) : (
              <Badge variant="secondary">Inactive — new sign-ups can no longer use it</Badge>
            ))}
        </FramePanel>
      </Frame>

      <ReferralsGrid rows={months} total={total} />

      <Frame>
        <FrameHeader>
          <FrameTitle>Earnings</FrameTitle>
          <FrameDescription>
            Your share of what referred subscribers pay will appear here once the payout terms are final.
          </FrameDescription>
        </FrameHeader>
      </Frame>
    </div>
  );
}
