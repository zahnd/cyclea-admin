import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { Badge } from "@/components/reui/badge";
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { requireAdmin } from "@/lib/auth/dal";
import { isUuid } from "@/lib/creators/validation";
import { formatDateLong } from "@/lib/format";
import { getUser } from "@/lib/users/data";

import { RoleBadge } from "../users-grid";
import { DeleteForm, GrantForm, ResetAuthenticatorForm, RevokeForm } from "./forms";

export default async function UserPage({ params }: PageProps<"/admin/users/[id]">) {
  const me = await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const user = await getUser(id);
  if (!user) notFound();
  const isYou = user.userId === me.userId;
  const isAdmin = user.role === "admin";
  const isCreator = user.role === "creator";

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader
        crumbs={[{ label: "Users", href: "/admin/users" }, { label: user.email }]}
        title={user.email}
        badges={
          <>
            <RoleBadge role={user.role} creatorCode={user.creatorCode} />
            {isYou && <Badge variant="info-outline">You</Badge>}
            {user.hasAuthenticator ? (
              <Badge variant="success-outline">Authenticator set up</Badge>
            ) : isCreator ? null : (
              <Badge variant="warning-outline">No authenticator</Badge>
            )}
          </>
        }
        description={
          <>
            Account created {formatDateLong(user.createdAt)}.{" "}
            {isAdmin && user.adminSince
              ? `Admin since ${formatDateLong(user.adminSince)}${user.adminGrantedBy ? `, granted by ${user.adminGrantedBy}` : ""}. `
              : ""}
            {user.lastSignInAt ? `Last signed in ${formatDateLong(user.lastSignInAt)}.` : "Has not signed in yet."}
          </>
        }
      />

      {isYou ? (
        <Alert variant="info">
          <AlertDescription>
            You cannot revoke, reset or delete your own account here — that would lock you out mid-session. Another
            admin can, or use <span className="font-mono">npm run admin -- reset-mfa</span> on a trusted machine.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <Frame>
            <FrameHeader>
              <FrameTitle>Role</FrameTitle>
              <FrameDescription>Every change here needs a current code from your own authenticator.</FrameDescription>
            </FrameHeader>
            <FramePanel>
              {isAdmin ? (
                <RevokeForm id={user.userId} email={user.email} />
              ) : isCreator && user.creatorId ? (
                <p className="text-sm text-muted-foreground">
                  Signs in to the portal as creator{" "}
                  <Link href={`/admin/creators/${user.creatorId}`} className="font-mono font-medium text-foreground underline underline-offset-4">
                    {user.creatorCode ?? "(unknown)"}
                  </Link>
                  . Portal access is managed on the creator&apos;s page. An account cannot be both creator and admin.
                </p>
              ) : (
                <GrantForm id={user.userId} email={user.email} />
              )}
            </FramePanel>
          </Frame>

          {user.hasAuthenticator && (
            <Frame>
              <FrameHeader>
                <FrameTitle>Authenticator</FrameTitle>
              </FrameHeader>
              <FramePanel>
                <ResetAuthenticatorForm id={user.userId} email={user.email} />
              </FramePanel>
            </Frame>
          )}

          <Frame>
            <FrameHeader>
              <FrameTitle>Delete account</FrameTitle>
              <FrameDescription>Only for accounts without a role.</FrameDescription>
            </FrameHeader>
            <FramePanel>
              {isAdmin || isCreator ? (
                <p className="text-sm text-muted-foreground">
                  {isAdmin
                    ? "This account is an admin. Revoke admin access first; then it can be deleted."
                    : "This account is a creator login. Remove its portal access first, on the creator's page."}
                </p>
              ) : (
                <DeleteForm id={user.userId} email={user.email} />
              )}
            </FramePanel>
          </Frame>
        </>
      )}
    </div>
  );
}
