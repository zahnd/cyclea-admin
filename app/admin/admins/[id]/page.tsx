import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { Badge } from "@/components/reui/badge";
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { getAdmin } from "@/lib/admins/data";
import { requireAdmin } from "@/lib/auth/dal";
import { isUuid } from "@/lib/creators/validation";
import { formatDateLong } from "@/lib/format";

import { ResetAuthenticatorForm, RevokeForm } from "./forms";

export default async function AdminPage({ params }: PageProps<"/admin/admins/[id]">) {
  const me = await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const admin = await getAdmin(id);
  if (!admin) notFound();
  const isYou = admin.userId === me.userId;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader
        crumbs={[{ label: "Admins", href: "/admin/admins" }, { label: admin.email }]}
        title={admin.email}
        badges={
          <>
            {isYou && <Badge variant="info-outline">You</Badge>}
            {admin.hasAuthenticator ? (
              <Badge variant="success-outline">Authenticator set up</Badge>
            ) : (
              <Badge variant="warning-outline">No authenticator yet</Badge>
            )}
          </>
        }
        description={
          <>
            Added {formatDateLong(admin.addedAt)}
            {admin.addedBy ? ` by ${admin.addedBy}` : ""}.{" "}
            {admin.lastSignInAt ? `Last signed in ${formatDateLong(admin.lastSignInAt)}.` : "Has not signed in yet."}
          </>
        }
      />

      {isYou ? (
        <Alert variant="info">
          <AlertDescription>
            You cannot revoke yourself or reset your own authenticator here — that would lock you out mid-session.
            Another admin can, or use <span className="font-mono">npm run admin -- reset-mfa</span> on a trusted
            machine.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {admin.hasAuthenticator && (
            <Frame>
              <FrameHeader>
                <FrameTitle>Authenticator</FrameTitle>
                <FrameDescription>Requires a current code from your own authenticator.</FrameDescription>
              </FrameHeader>
              <FramePanel>
                <ResetAuthenticatorForm id={admin.userId} email={admin.email} />
              </FramePanel>
            </Frame>
          )}
          <Frame>
            <FrameHeader>
              <FrameTitle>Admin access</FrameTitle>
              <FrameDescription>
                The last admin cannot be revoked. Requires a current code from your own authenticator.
              </FrameDescription>
            </FrameHeader>
            <FramePanel>
              <RevokeForm id={admin.userId} email={admin.email} />
            </FramePanel>
          </Frame>
        </>
      )}
    </div>
  );
}
