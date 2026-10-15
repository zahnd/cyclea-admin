import { redirect } from "next/navigation";

import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import { getClaims, getRole, hasFreshTotp } from "@/lib/auth/dal";
import { isAuthorizationId } from "@/lib/auth/oauth-return";
import { adminDbAsUser } from "@/lib/db/admin-as-user";
import { alignSupabaseConsents, redirectHost } from "@/lib/mcp/consent";
import { MCP_GRANT_DAYS } from "@/lib/mcp/grants";

import { approve, deny } from "./actions";

// An AI client (Claude Code, a claude.ai connector) asks to use the admin's
// MCP endpoint. Supabase Auth runs the OAuth flow and sends the admin here to
// decide. Approving needs an admin with a fresh authenticator code; anyone
// signed in may decline.

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg">{children}</div>
    </main>
  );
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <Shell>
      <Frame>
        <FrameHeader>
          <FrameTitle>{title}</FrameTitle>
          <FrameDescription>{text}</FrameDescription>
        </FrameHeader>
      </Frame>
    </Shell>
  );
}

const MAY = [
  "Read app feedback (sent from the app and entered here), with what users wrote, its category, app version, device and screen.",
  "Read content ratings and their notes, and a summary per article or class.",
  "Set a feedback item's status, note and link. Every change is in the audit log as yours, via this client.",
];
const MAY_NOT = [
  "See who sent feedback, any screenshot or image, or any user report.",
  "Create, edit or delete feedback, or do anything else in the admin.",
];

export default async function ConsentPage({ searchParams }: PageProps<"/oauth/consent">) {
  const raw = (await searchParams).authorization_id;
  const id = typeof raw === "string" ? raw : "";
  if (!isAuthorizationId(id)) {
    return <Message title="Incomplete request" text="This sign-in link is incomplete. Start the connection from the AI client again." />;
  }

  const claims = await getClaims();
  if (!claims?.sub) redirect(`/oauth/park?to=login&authorization_id=${encodeURIComponent(id)}`);

  const role = await getRole(claims.sub);
  if (role.kind !== "admin") {
    return (
      <Shell>
        <Frame>
          <FrameHeader>
            <FrameTitle>Not available</FrameTitle>
            <FrameDescription>Only admins can connect an AI client to Cyclea Admin.</FrameDescription>
          </FrameHeader>
          <FramePanel>
            <form action={deny}>
              <input type="hidden" name="authorization_id" value={id} />
              <Button type="submit" variant="outline">
                Decline and return
              </Button>
            </form>
          </FramePanel>
        </Frame>
      </Shell>
    );
  }
  if (!hasFreshTotp(claims)) redirect(`/oauth/park?to=mfa&authorization_id=${encodeURIComponent(id)}`);

  const supabase = await adminDbAsUser();
  await alignSupabaseConsents(supabase, claims.sub);
  const { data: details, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
  if (error || !details) {
    return <Message title="Request expired" text="This sign-in request is no longer valid. Start the connection from the AI client again." />;
  }
  // Still approved (within 30 days): Supabase answers with the redirect.
  if ("redirect_url" in details) redirect(details.redirect_url);

  const name = details.client.name?.trim() || "Unnamed client";
  const host = redirectHost(details.redirect_uri);

  return (
    <Shell>
      <Frame>
        <FrameHeader>
          <FrameTitle>Connect “{name}” to Cyclea Admin?</FrameTitle>
          <FrameDescription>
            It will act as you ({details.user.email}) for {MCP_GRANT_DAYS} days, then ask again.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="flex flex-col gap-5 text-sm">
          <div className="rounded-md border px-3 py-2">
            <div className="text-xs text-muted-foreground">Sends you back to</div>
            <div className="font-mono font-medium break-all">{host}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              A client chooses its own name; this address it cannot fake. Claude Code uses localhost.
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="font-medium">It may</div>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {MAY.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="font-medium">It may not</div>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {MAY_NOT.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">
            What users wrote is personal data and can mention health. The client is told to paraphrase it and never
            copy it into issues, commits or anywhere else. You can revoke it any time under AI clients in the account
            menu.
          </p>
          <div className="flex gap-2">
            <form action={approve}>
              <input type="hidden" name="authorization_id" value={id} />
              <Button type="submit">Approve</Button>
            </form>
            <form action={deny}>
              <input type="hidden" name="authorization_id" value={id} />
              <Button type="submit" variant="outline">
                Decline
              </Button>
            </form>
          </div>
        </FramePanel>
      </Frame>
    </Shell>
  );
}
