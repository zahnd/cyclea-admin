"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_STATUSES,
  isFeedbackStatus,
  LINK_MAX,
  NOTE_MAX,
  type FeedbackKind,
  type FeedbackStatus,
} from "@/lib/feedback/validation";

import { updateTriage, type FormState } from "../actions";

const STATUS_ITEMS = FEEDBACK_STATUSES.map((value) => ({ value, label: FEEDBACK_STATUS_LABELS[value] }));

export function TriageForm({
  kind,
  id,
  status: savedStatus,
  note: savedNote,
  link: savedLink,
}: {
  kind: FeedbackKind;
  id: string;
  status: FeedbackStatus;
  note: string | null;
  link: string | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateTriage, {});
  // Controlled, all of them: React resets a form after its action, and a
  // refused save (an http:// link) must not wipe what was typed.
  const [status, setStatus] = useState<FeedbackStatus>(savedStatus);
  const [note, setNote] = useState(savedNote ?? "");
  const [link, setLink] = useState(savedLink ?? "");
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="status">Status</Label>
        <Select
          items={STATUS_ITEMS}
          value={status}
          onValueChange={(value) => value && isFeedbackStatus(value) && setStatus(value)}
        >
          <SelectTrigger id="status" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {STATUS_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="note">Note</Label>
        <Textarea
          id="note"
          name="note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={NOTE_MAX}
          rows={4}
        />
        <p className="text-xs text-muted-foreground">
          What we did or decided — never a quote of what the user wrote. Feedback from the app is deleted with its
          account; this note is not. Changes are logged, the text itself is not.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="link">Link</Label>
        <Input
          id="link"
          name="link"
          type="url"
          value={link}
          onChange={(event) => setLink(event.target.value)}
          maxLength={LINK_MAX}
          placeholder="https://github.com/…"
          autoComplete="off"
          spellCheck={false}
        />
        <p className="text-xs text-muted-foreground">The commit, pull request or issue that deals with it.</p>
      </div>
      <FormMessage state={state} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
