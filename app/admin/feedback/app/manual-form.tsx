"use client";

import { ImageIcon, TriangleAlertIcon } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";

import { FormMessage } from "@/components/form-message";
import { Alert, AlertDescription } from "@/components/reui/alert";
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
  IMAGE_ACCEPT,
  IMAGE_MAX_BYTES,
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
  /** The stored image's version (Feedback.imageVersion), or null. */
  imageVersion: string | null;
};

/** Create (no id) or edit a manual entry. */
export function ManualForm({ id, initial }: { id?: string; initial: ManualValues }) {
  // The image waits in state rather than in the file input, so a refused save
  // keeps it like every other field; after a save it is the stored one.
  // With a local preview URL, which is revoked whenever the file goes.
  const [picked, setPickedState] = useState<{ file: File; url: string } | null>(null);
  const pickedRef = useRef(picked);
  const setPicked = (file: File | null) => {
    if (pickedRef.current) URL.revokeObjectURL(pickedRef.current.url);
    pickedRef.current = file ? { file, url: URL.createObjectURL(file) } : null;
    setPickedState(pickedRef.current);
  };
  useEffect(() => () => {
    if (pickedRef.current) URL.revokeObjectURL(pickedRef.current.url);
  }, []);
  const file = picked?.file ?? null;
  const [removeImage, setRemoveImage] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(async (previous, formData) => {
    const result = await saveManual(previous, formData);
    if (result.ok) {
      setPicked(null);
      setRemoveImage(false);
    }
    return result;
  }, {});
  // Controlled, all of them: React resets a form after its action, and a
  // refused save must not wipe what was typed.
  const [source, setSource] = useState<ManualSource>(initial.source);
  const [category, setCategory] = useState<FeedbackCategory>(initial.category);
  const [text, setText] = useState(initial.message);
  const [receivedOn, setReceivedOn] = useState(initial.receivedOn);
  const [appVersion, setAppVersion] = useState(initial.appVersion ?? "");
  const [platform, setPlatform] = useState<Platform | "">(initial.platform ?? "");
  const [imageError, setImageError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const storedImage = id && initial.imageVersion && !removeImage
    ? `/admin/feedback/app/${id}/image?v=${initial.imageVersion}`
    : null;
  // The chosen file first: it is not uploaded until the form is saved.
  const shown = picked?.url ?? storedImage;

  function choose(chosen: File | undefined) {
    if (picker.current) picker.current.value = "";
    if (!chosen) return;
    if (chosen.size > IMAGE_MAX_BYTES) {
      setImageError(`That image is larger than ${IMAGE_MAX_BYTES / 1024 / 1024} MB.`);
      return;
    }
    setImageError(null);
    setPicked(chosen);
  }

  function dropImage() {
    setImageError(null);
    if (file) setPicked(null);
    else setRemoveImage(true);
  }

  // Submitted by hand, so the form is not reset and the chosen image goes with it.
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (file) formData.set("image", file);
    if (removeImage && !file) formData.set("remove_image", "1");
    startTransition(() => action(formData));
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
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
      <div className="flex flex-col gap-2">
        <Label htmlFor="image">Image (optional)</Label>
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertDescription>
            No personal or sensitive data in the image: no names, faces, phone numbers, profile pictures or chat
            headers, and no cycle or health data. Crop or blur it before uploading. Location and camera details are
            removed automatically; what the picture shows is not.
          </AlertDescription>
        </Alert>
        {shown ? (
          <div className="flex flex-wrap items-end gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- a private image behind requireAdmin(), or a local preview; next/image would cache it */}
            <img src={shown} alt="Image attached to this feedback" className="max-h-64 max-w-full rounded-md border object-contain" />
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => picker.current?.click()}>
                Replace
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={dropImage}>
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <Button type="button" variant="outline" onClick={() => picker.current?.click()}>
              <ImageIcon />
              Choose image
            </Button>
          </div>
        )}
        <input
          ref={picker}
          id="image"
          type="file"
          accept={IMAGE_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => choose(event.target.files?.[0])}
        />
        {imageError ? (
          <p className="text-xs text-destructive">{imageError}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            JPEG, PNG, WebP or GIF, up to {IMAGE_MAX_BYTES / 1024 / 1024} MB. One image per entry
            {removeImage && !file ? "; the current one is removed when you save." : "."}
          </p>
        )}
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
