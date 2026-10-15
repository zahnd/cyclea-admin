import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/reui/badge";
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { requireAdmin } from "@/lib/auth/dal";
import { formatDateTimeUtc } from "@/lib/format";
import { grantState, listGrants, MCP_GRANT_DAYS, type McpGrantState } from "@/lib/mcp/grants";

import { RevokeButton } from "./revoke-button";

const STATE_LABELS: Record<McpGrantState, string> = { active: "Active", expired: "Expired", revoked: "Revoked" };
const STATE_VARIANTS = { active: "success-light", expired: "secondary", revoked: "outline" } as const;

export default async function AiClientsPage() {
  const admin = await requireAdmin();
  const grants = await listGrants(admin.userId);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader
        crumbs={[{ label: "Account" }, { label: "AI clients" }]}
        title="AI clients"
        description={`AI clients you connected to the MCP endpoint (https://admin.cyclea.app/mcp). Each approval lasts ${MCP_GRANT_DAYS} days; after that, or once revoked, the client asks you to approve it again when it next connects.`}
      />
      <Frame>
        <FrameHeader>
          <FrameTitle>{grants.length === 0 ? "None yet" : grants.length === 1 ? "1 client" : `${grants.length} clients`}</FrameTitle>
          <FrameDescription>
            They can read feedback and set its status, note and link as you — never reports, screenshots or who sent
            anything. Every change they make is in the audit log as yours, via the client.
          </FrameDescription>
        </FrameHeader>
        {grants.length > 0 && (
          <FramePanel className="flex flex-col divide-y p-0">
            {grants.map((grant) => {
              const state = grantState(grant);
              return (
                <div key={grant.clientId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{grant.clientName}</span>
                      <Badge variant={STATE_VARIANTS[state]}>{STATE_LABELS[state]}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-mono">{grant.redirectHost}</span> · approved{" "}
                      {formatDateTimeUtc(grant.approvedAt)} ·{" "}
                      {state === "revoked"
                        ? `revoked ${formatDateTimeUtc(grant.revokedAt!)}`
                        : `${state === "expired" ? "expired" : "expires"} ${formatDateTimeUtc(grant.expiresAt)}`}
                    </div>
                  </div>
                  {state === "active" && <RevokeButton clientId={grant.clientId} />}
                </div>
              );
            })}
          </FramePanel>
        )}
      </Frame>
    </div>
  );
}
