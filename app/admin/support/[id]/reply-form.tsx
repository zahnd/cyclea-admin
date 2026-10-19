"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { charCount, SUPPORT_REPLY_MAX } from "@/lib/support/validation";

import { sendReply, type FormState } from "../actions";

export function ReplyForm({ id }: { id: string }) {
  // Controlled: React resets a form after its action, and a refused send must
  // not lose what was typed. Cleared only once the app took the reply.
  const [body, setBody] = useState("");
  const [state, action, pending] = useActionState<FormState, FormData>(async (previous, formData) => {
    const result = await sendReply(previous, formData);
    if (result.sent) setBody("");
    return result;
  }, {});
  const used = charCount(body.trim());

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="body">Your reply</Label>
        <Textarea
          id="body"
          name="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={SUPPORT_REPLY_MAX}
          rows={6}
          required
        />
        <p className="text-xs text-muted-foreground">
          {used} / {SUPPORT_REPLY_MAX} characters. Sent as written; the audit log records only that you replied.
        </p>
      </div>
      <FormMessage state={state} />
      <div>
        <Button type="submit" disabled={pending || used === 0}>
          {pending ? "Sending…" : "Send reply"}
        </Button>
      </div>
    </form>
  );
}
