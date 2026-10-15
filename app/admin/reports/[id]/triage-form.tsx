"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  isReportAction,
  isReportStatus,
  REPORT_ACTION_LABELS,
  REPORT_ACTIONS,
  REPORT_NOTE_MAX,
  REPORT_STATUS_LABELS,
  REPORT_STATUSES,
  type ReportAction,
  type ReportStatus,
} from "@/lib/reports/validation";

import { updateReportTriage, type FormState } from "../actions";

const STATUS_ITEMS = REPORT_STATUSES.map((value) => ({ value, label: REPORT_STATUS_LABELS[value] }));
const ACTION_ITEMS = [
  { value: "", label: "Not decided" },
  ...REPORT_ACTIONS.map((value) => ({ value, label: REPORT_ACTION_LABELS[value] })),
];

export function ReportTriageForm({
  id,
  status: savedStatus,
  action: savedAction,
  note: savedNote,
}: {
  id: string;
  status: ReportStatus;
  action: ReportAction | null;
  note: string | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateReportTriage, {});
  // Controlled, all of them: React resets a form after its action, and a
  // refused save (closed without an action) must not wipe what was typed.
  const [status, setStatus] = useState<ReportStatus>(savedStatus);
  const [taken, setTaken] = useState<ReportAction | "">(savedAction ?? "");
  const [note, setNote] = useState(savedNote ?? "");

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="action" value={taken} />
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="status">Status</Label>
          <Select
            items={STATUS_ITEMS}
            value={status}
            onValueChange={(value) => value && isReportStatus(value) && setStatus(value)}
          >
            <SelectTrigger id="status" className="w-44">
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
          <Label htmlFor="action">What was done</Label>
          <Select
            items={ACTION_ITEMS}
            value={taken}
            onValueChange={(value) => setTaken(value && isReportAction(value) ? value : "")}
          >
            <SelectTrigger id="action" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {ACTION_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Closing needs an action. <span className="font-medium">Account deleted</span> records that you ran{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">make delete-user</code> in cyclea-app with the username —
        this admin never deletes accounts itself.
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="note">Note</Label>
        <Textarea
          id="note"
          name="note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={REPORT_NOTE_MAX}
          rows={4}
        />
        <p className="text-xs text-muted-foreground">
          What we checked and decided, in our words — not the reporter&apos;s. Deleted with the report after 12 months;
          the audit log keeps only that it changed.
        </p>
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
