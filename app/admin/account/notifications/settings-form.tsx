"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  isNotificationMode,
  NOTIFICATION_KIND_HINTS,
  NOTIFICATION_KIND_LABELS,
  NOTIFICATION_KINDS,
  NOTIFICATION_MODE_LABELS,
  NOTIFICATION_MODES,
  type NotificationSettings,
} from "@/lib/notifications/validation";

import { updateNotificationSettings, type FormState } from "./actions";

const MODE_ITEMS = NOTIFICATION_MODES.map((value) => ({ value, label: NOTIFICATION_MODE_LABELS[value] }));

export function SettingsForm({ initial }: { initial: NotificationSettings }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateNotificationSettings, {});
  // Controlled: React resets a form after its action, and a refused save must
  // not show settings that were not saved.
  const [settings, setSettings] = useState<NotificationSettings>(initial);

  return (
    <form action={action} className="flex flex-col gap-5">
      {NOTIFICATION_KINDS.map((kind) => (
        <div key={kind} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor={`mode-${kind}`}>{NOTIFICATION_KIND_LABELS[kind]}</Label>
            <p className="text-xs text-muted-foreground">{NOTIFICATION_KIND_HINTS[kind]}</p>
          </div>
          <input type="hidden" name={kind} value={settings[kind]} />
          <Select
            items={MODE_ITEMS}
            value={settings[kind]}
            onValueChange={(value) =>
              value && isNotificationMode(value) && setSettings((current) => ({ ...current, [kind]: value }))
            }
          >
            <SelectTrigger id={`mode-${kind}`} className="w-44 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {MODE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      ))}
      <FormMessage state={state} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
