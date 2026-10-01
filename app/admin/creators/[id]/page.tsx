import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { Badge } from "@/components/reui/badge";
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/dal";
import { getAppCreator, getCreatorRecord } from "@/lib/creators/data";
import { isUuid } from "@/lib/creators/validation";

import { ActiveForm, AdoptForm, RecordForm, RenameForm } from "./forms";

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });

export default async function CreatorPage({ params }: PageProps<"/admin/creators/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const [creator, record] = await Promise.all([getAppCreator(id), getCreatorRecord(id)]);
  if (!creator) notFound();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/admin/creators" />}>
          <ArrowLeftIcon />
          Creators
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-xl font-semibold">{creator.code}</h1>
        {creator.active ? (
          <Badge variant="success-outline">Active</Badge>
        ) : (
          <Badge variant="secondary">Inactive</Badge>
        )}
        {!record && <Badge variant="warning-outline">No admin record</Badge>}
      </div>

      <Frame>
        <FrameHeader>
          <FrameTitle>In the app</FrameTitle>
          <FrameDescription>
            Created {dateFormat.format(new Date(creator.createdAt))}. The code cannot be changed.
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
