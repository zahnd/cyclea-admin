import { notFound } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { Badge } from "@/components/reui/badge";
import { PageHeader } from "@/components/page-header";
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { requireAdmin } from "@/lib/auth/dal";
import { getAppCreator, getCreatorLogin, getCreatorRecord } from "@/lib/creators/data";
import { isUuid } from "@/lib/creators/validation";
import { formatDateLong } from "@/lib/format";

import { ActiveForm, AdoptForm, InviteLoginForm, RecordForm, RemoveLoginForm, RenameForm } from "./forms";


export default async function CreatorPage({ params }: PageProps<"/admin/creators/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const [creator, record, login] = await Promise.all([getAppCreator(id), getCreatorRecord(id), getCreatorLogin(id)]);
  if (!creator) notFound();

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader
        crumbs={[{ label: "Creators", href: "/admin/creators" }, { label: creator.code }]}
        title={<span className="font-mono">{creator.code}</span>}
        description={creator.name}
        badges={
          <>
            {creator.active ? (
              <Badge variant="success-outline">Active</Badge>
            ) : (
              <Badge variant="secondary">Inactive</Badge>
            )}
            {!record && <Badge variant="warning-outline">No admin record</Badge>}
          </>
        }
      />

      <Frame>
        <FrameHeader>
          <FrameTitle>In the app</FrameTitle>
          <FrameDescription>
            Created {formatDateLong(creator.createdAt)}. The code cannot be changed.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="flex flex-col gap-6">
          <RenameForm id={creator.id} name={creator.name} />
          <ActiveForm id={creator.id} active={creator.active} />
          {creator.appNote && (
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Note in the app project</span>
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{creator.appNote}</p>
            </div>
          )}
        </FramePanel>
      </Frame>

      <Frame>
        <FrameHeader>
          <FrameTitle>Business record</FrameTitle>
          <FrameDescription>Kept in the admin database only. No revenue share until the contract terms are decided.</FrameDescription>
        </FrameHeader>
        <FramePanel>
          {record ? (
            <RecordForm
              id={creator.id}
              contractSignedOn={record.contractSignedOn}
              payeeReference={record.payeeReference}
              internalNote={record.internalNote}
            />
          ) : (
            <AdoptForm id={creator.id} />
          )}
        </FramePanel>
      </Frame>

      <Frame>
        <FrameHeader>
          <FrameTitle>Portal access</FrameTitle>
          <FrameDescription>Every change here needs a current code from your own authenticator.</FrameDescription>
        </FrameHeader>
        <FramePanel>
          {!record ? (
            <p className="text-sm text-muted-foreground">Add the business record first; portal access needs it.</p>
          ) : login ? (
            <RemoveLoginForm id={creator.id} email={login.email} />
          ) : (
            <InviteLoginForm id={creator.id} />
          )}
        </FramePanel>
      </Frame>

      <Alert variant="info">
        <AlertTitle>iOS needs the code in App Store Connect too</AlertTitle>
        <AlertDescription>
          Add <span className="font-mono">{creator.code}</span> as a custom code on the shared creator offer, or iOS
          users get no discount when they redeem it. Android needs nothing per creator.
        </AlertDescription>
      </Alert>
    </div>
  );
}
