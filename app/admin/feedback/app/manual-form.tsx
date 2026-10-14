"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  APP_VERSION_MAX,
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_SOURCE_LABELS,
  isFeedbackCategory,
  isManualSource,
  isPlatform,
  MANUAL_SOURCES,
  MESSAGE_MAX,
  PLATFORM_LABELS,
  PLATFORMS,
  type FeedbackCategory,
  type ManualSource,
  type Platform,
} from "@/lib/feedback/validation";

import { saveManual, type FormState } from "./actions";

const SOURCE_ITEMS = MANUAL_SOURCES.map((value) => ({ value, label: FEEDBACK_SOURCE_LABELS[value] }));
const CATEGORY_ITEMS = FEEDBACK_CATEGORIES.map((value) => ({ value, label: FEEDBACK_CATEGORY_LABELS[value] }));
const PLATFORM_ITEMS = [
  { value: "", label: "Not known" },
  ...PLATFORMS.map((value) => ({ value, label: PLATFORM_LABELS[value] })),
];

export type ManualValues = {
  source: ManualSource;
  category: FeedbackCategory;
  message: string;
  receivedOn: string;
  appVersion: string | null;
  platform: Platform | null;
};

/** Create (no id) or edit a manual entry. */
export function ManualForm({ id, initial }: { id?: string; initial: ManualValues }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveManual, {});
  // Controlled, all of them: React resets a form after its action, and a
  // refused save must not wipe what was typed.
  const [source, setSource] = useState<ManualSource>(initial.source);
  const [category, setCategory] = useState<FeedbackCategory>(initial.category);
  const [text, setText] = useState(initial.message);
  const [receivedOn, setReceivedOn] = useState(initial.receivedOn);
  const [appVersion, setAppVersion] = useState(initial.appVersion ?? "");
  const [platform, setPlatform] = useState<Platform | "">(initial.platform ?? "");

  return (
    <form action={action} className="flex flex-col gap-5">
      {id && <input type="hidden" name="id" value={id} />}
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="platform" value={platform} />
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="source">Came in via</Label>
          <Select
            items={SOURCE_ITEMS}
            value={source}
            onValueChange={(value) => value && isManualSource(value) && setSource(value)}
          >
            <SelectTrigger id="source" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {SOURCE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="category">Category</Label>
          <Select
            items={CATEGORY_ITEMS}
            value={category}
            onValueChange={(value) => value && isFeedbackCategory(value) && setCategory(value)}
          >
            <SelectTrigger id="category" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {CATEGORY_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="received_on">Received on</Label>
          <Input
            id="received_on"
            name="received_on"
            type="date"
            required
            value={receivedOn}
            onChange={(event) => setReceivedOn(event.target.value)}
            className="w-44"
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="message">Feedback</Label>
        <Textarea
          id="message"
          name="message"
          required
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={MESSAGE_MAX}
          rows={6}
        />
        <p className="text-xs text-muted-foreground">
          What was said, in your words or theirs — but never who said it: no name, number or handle. That stays in
          WhatsApp or wherever it came from.
        </p>
      </div>
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="app_version">App version</Label>
          <Input
            id="app_version"
            name="app_version"
            value={appVersion}
            onChange={(event) => setAppVersion(event.target.value)}
            maxLength={APP_VERSION_MAX}
            placeholder="e.g. 1.1.0"
            autoComplete="off"
            spellCheck={false}
            className="w-44"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="platform">Platform</Label>
          <Select
            items={PLATFORM_ITEMS}
            value={platform}
            onValueChange={(value) => setPlatform(value && isPlatform(value) ? value : "")}
          >
            <SelectTrigger id="platform" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {PLATFORM_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
      <FormMessage state={state} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : id ? "Save changes" : "Add feedback"}
        </Button>
      </div>
    </form>
  );
}
