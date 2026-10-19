import { BotIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { requireAdmin } from "@/lib/auth/dal";
import { isUuid } from "@/lib/creators/validation";
import { deviceLabel } from "@/lib/feedback/validation";
import { formatDateTimeUtc } from "@/lib/format";
import { getThread, listMessages, type SupportMessage } from "@/lib/support/data";
import { splitConversation } from "@/lib/support/rows";
import { getSupportName } from "@/lib/support/signature";
import { signatureLabel, threadUserLabel } from "@/lib/support/validation";
import { cn } from "@/lib/utils";

import { EntitledBadge, SupportStatusBadge } from "../support-grid";
import { ReplyForm } from "./reply-form";
import { StatusButton } from "./status-button";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children ?? "—"}</dd>
    </div>
  );
}

function authorLabel(message: SupportMessage, user: string): string {
  if (message.author === "team") return message.teamName ? signatureLabel(message.teamName) : "Cyclea team";
  if (message.author === "assistant") return "AI assistant";
  return user;
}

function Message({ message, user }: { message: SupportMessage; user: string }) {
  const team = message.author === "team";
  return (
    <li className={cn("flex flex-col gap-1", team ? "items-end" : "items-start")}>
      <span className="text-xs text-muted-foreground">
        {authorLabel(message, user)} · {formatDateTimeUtc(message.createdAt)}
      </span>
      <p
        className={cn(
          "max-w-[85%] rounded-lg border px-3 py-2 text-sm whitespace-pre-wrap",
          team && "border-primary/20 bg-primary/5",
          message.fromTranscript && "border-dashed bg-muted/40 text-muted-foreground",
        )}
      >
        {message.body}
      </p>
    </li>
  );
}

export default async function SupportThreadPage({ params }: PageProps<"/admin/support/[id]">) {
  const admin = await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  // Gone once the account was deleted (cascade in the app) or 12 months after
  // closing.
  const [thread, messages, supportName] = await Promise.all([
    getThread(id),
    listMessages(id),
    getSupportName(admin.userId),
  ]);
  if (!thread) notFound();

  const user = threadUserLabel(thread);
  const { transcript, conversation } = splitConversation(messages);
  const closed = thread.status === "closed";

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader
        crumbs={[{ label: "Support", href: "/admin/support" }, { label: `${id.slice(0, 8)}…` }]}
        title={user}
        badges={
          <>
            <SupportStatusBadge status={thread.status} />
            <EntitledBadge entitled={thread.entitled} />
          </>
        }
        actions={<StatusButton id={thread.id} closed={closed} />}
      />

      <Frame>
        <FrameHeader>
          <FrameTitle>Conversation</FrameTitle>
          <FrameDescription>
            Started {formatDateTimeUtc(thread.createdAt)}. As the user wrote it — paraphrase, never copy it out of the
            admin.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="flex flex-col gap-6">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Fact label="Device">{deviceLabel(thread.platform, null)}</Fact>
            <Fact label="App version">{thread.appVersion}</Fact>
            <Fact label="Language">{thread.locale}</Fact>
            <Fact label="User last read">{thread.userReadAt ? formatDateTimeUtc(thread.userReadAt) : "Not yet"}</Fact>
          </dl>

          {transcript.length > 0 && (
            <section aria-label="Before handoff (AI chat)" className="flex flex-col gap-3">
              <h2 className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <BotIcon className="size-3.5" aria-hidden />
                Before handoff (AI chat)
              </h2>
              <ol className="flex flex-col gap-3">
                {transcript.map((message) => (
                  <Message key={message.id} message={message} user={user} />
                ))}
              </ol>
              <p className="border-t pt-3 text-xs text-muted-foreground">Handed over to the team.</p>
            </section>
          )}

          {conversation.length > 0 ? (
            <ol className="flex flex-col gap-3">
              {conversation.map((message) => (
                <Message key={message.id} message={message} user={user} />
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">No messages.</p>
          )}
        </FramePanel>
      </Frame>

      <Frame>
        <FrameHeader>
          <FrameTitle>Reply</FrameTitle>
          <FrameDescription>
            {supportName
              ? `Signed “${signatureLabel(supportName)}”. The user sees it in the app and gets an email note — without the text — if they have not read it within 10 minutes.`
              : "Replies are signed with your first name."}
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="flex flex-col gap-4">
          {!supportName ? (
            <Alert variant="warning">
              <AlertDescription>
                Set your signature name on{" "}
                <Link href="/admin/account/profile" className="font-medium underline underline-offset-4">
                  Profile
                </Link>{" "}
                before replying.
              </AlertDescription>
            </Alert>
          ) : closed ? (
            <p className="text-sm text-muted-foreground">This conversation is closed. Reopen it to reply.</p>
          ) : (
            <ReplyForm id={thread.id} />
          )}
        </FramePanel>
      </Frame>
    </div>
  );
}
