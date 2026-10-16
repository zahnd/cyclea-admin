"use client";

import { DownloadIcon, ImageIcon, TriangleAlertIcon, UploadIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Alert, AlertDescription } from "@/components/reui/alert";
import { Badge } from "@/components/reui/badge";
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useFileUpload, type FileWithPreview } from "@/hooks/use-file-upload";
import { DecodeError, prepareImage, type PrepResult, type PrepSettings } from "@/lib/image-prep";

const SIDE_ITEMS = ["2000", "3000", "4000"].map((value) => ({ value, label: `${value} px` }));
const QUALITY_ITEMS = ["70", "80", "90"].map((value) => ({ value, label: value }));

/** Above this, a result gets "Still large": Directus copes, but the app loads it slowly. */
const LARGE_BYTES = 3_000_000;

type Entry =
  | { status: "waiting" }
  | { status: "working" }
  | { status: "done"; result: PrepResult; url: string; thumbUrl: string }
  | { status: "failed"; message: string };

const mb = (bytes: number) =>
  bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;

export function ImagePrep() {
  const [maxSide, setMaxSide] = useState("3000");
  const [quality, setQuality] = useState("80");
  const [entries, setEntries] = useState<Record<string, Entry>>({});

  // For the async queue, which outlives any one render: which rows still
  // exist, and the object URLs each one holds (freed on remove and unmount).
  const liveIds = useRef(new Set<string>());
  const urls = useRef(new Map<string, string[]>());
  // One image at a time: two 33 MP decodes at once can exhaust a tab's memory.
  const queue = useRef(Promise.resolve());

  const setEntry = (id: string, entry: Entry) => setEntries((prev) => ({ ...prev, [id]: entry }));

  const enqueue = useCallback((added: FileWithPreview[], settings: PrepSettings) => {
    for (const { id, file } of added) {
      if (!(file instanceof File)) continue;
      liveIds.current.add(id);
      setEntry(id, { status: "waiting" });
      queue.current = queue.current.then(async () => {
        if (!liveIds.current.has(id)) return; // removed while waiting
        setEntry(id, { status: "working" });
        try {
          const result = await prepareImage(file, settings);
          if (!liveIds.current.has(id)) return;
          const url = URL.createObjectURL(result.blob);
          const thumbUrl = URL.createObjectURL(result.thumbnail);
          urls.current.set(id, [url, thumbUrl]);
          setEntry(id, { status: "done", result, url, thumbUrl });
        } catch (error) {
          if (!liveIds.current.has(id)) return;
          setEntry(id, {
            status: "failed",
            message:
              error instanceof DecodeError
                ? error.heic
                  ? "This browser can't open HEIC photos. Open this page in Safari, or export the photo as JPEG first."
                  : "This file couldn't be opened as an image."
                : "This image is too large for this browser to process. Try Chrome or Safari on a computer.",
          });
        }
      });
    }
  }, []);

  const [{ files, isDragging, errors }, actions] = useFileUpload({
    accept: "image/*,.heic,.heif",
    multiple: true,
    onFilesAdded: (added) => enqueue(added, { maxSide: Number(maxSide), quality: Number(quality) / 100 }),
  });

  const release = (id: string) => {
    urls.current.get(id)?.forEach((url) => URL.revokeObjectURL(url));
    urls.current.delete(id);
  };

  const remove = (id: string) => {
    liveIds.current.delete(id);
    release(id);
    setEntries((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    actions.removeFile(id);
  };

  const clear = () => {
    liveIds.current.clear();
    [...urls.current.keys()].forEach(release);
    setEntries({});
    actions.clearFiles();
  };

  // Leaving the page: free every object URL still held.
  useEffect(() => {
    const held = urls.current;
    return () => held.forEach((list) => list.forEach((url) => URL.revokeObjectURL(url)));
  }, []);

  // Dropping beside the zone should not make the browser open the photo.
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  // Newest first, like the artifact this replaces.
  const rows = [...files].reverse();

  return (
    <div className="flex flex-col gap-4">
      <Frame>
        <FrameHeader>
          <FrameTitle>Settings</FrameTitle>
          <FrameDescription>
            They apply to the images you add next. Directus can&apos;t resize anything over 6000 px; 3000 px
            at quality 80 is usually 1–2 MB.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="max-side">Longest side</Label>
              <Select items={SIDE_ITEMS} value={maxSide} onValueChange={(value) => value && setMaxSide(value)}>
                <SelectTrigger id="max-side" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {SIDE_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="quality">JPEG quality</Label>
              <Select items={QUALITY_ITEMS} value={quality} onValueChange={(value) => value && setQuality(value)}>
                <SelectTrigger id="quality" className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {QUALITY_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div
            role="button"
            tabIndex={0}
            aria-label="Choose images or drop them here"
            onClick={actions.openFileDialog}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                actions.openFileDialog();
              }
            }}
            onDragEnter={actions.handleDragEnter}
            onDragLeave={actions.handleDragLeave}
            onDragOver={actions.handleDragOver}
            onDrop={actions.handleDrop}
            data-dragging={isDragging || undefined}
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input px-4 py-10 text-center transition-colors outline-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-dragging:bg-muted/50"
          >
            <input {...actions.getInputProps()} className="sr-only" aria-label="Choose images" />
            <div className="flex size-10 items-center justify-center rounded-full border bg-background">
              <UploadIcon className="size-4 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">Drop images here, or click to choose</p>
            <p className="text-xs text-muted-foreground">JPEG, PNG, WebP · HEIC only in Safari</p>
          </div>

          {errors.length > 0 && (
            <Alert variant="destructive">
              <TriangleAlertIcon />
              <AlertDescription>{errors[0]}</AlertDescription>
            </Alert>
          )}
        </FramePanel>
      </Frame>

      <Frame>
        <FrameHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <FrameTitle>Ready to upload</FrameTitle>
            <FrameDescription>Save each copy, then upload it to Directus.</FrameDescription>
          </div>
          {rows.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clear}>
              Clear list
            </Button>
          )}
        </FrameHeader>
        <FramePanel className="p-0">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-1 px-4 py-8 text-center">
              <ImageIcon className="size-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No images yet.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {rows.map(({ id, file }) => (
                <Row key={id} name={file.name} bytes={file.size} entry={entries[id]} onRemove={() => remove(id)} />
              ))}
            </ul>
          )}
        </FramePanel>
      </Frame>

      <div className="flex flex-col gap-2 px-1 text-sm text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Replacing an image already in Directus:</span> open the
          file in the File Library, choose “Replace File” and pick the saved copy. It keeps its ID, so every
          article that uses it updates by itself.
        </p>
        <p>
          Transparent PNGs stay PNG; everything else becomes JPEG. Every copy is re-encoded, so location and
          camera data are removed.
        </p>
      </div>
    </div>
  );
}

function Row({
  name,
  bytes,
  entry,
  onRemove,
}: {
  name: string;
  bytes: number;
  entry: Entry | undefined;
  onRemove: () => void;
}) {
  const done = entry?.status === "done" ? entry : null;
  const result = done?.result;

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
      <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
        {done ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local object URL, not an optimisable asset
          <img src={done.thumbUrl} alt="" className="size-full object-cover" />
        ) : entry?.status === "failed" ? (
          <TriangleAlertIcon className="size-4 text-destructive" />
        ) : (
          <ImageIcon className="size-4 text-muted-foreground" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{result?.name ?? name}</span>
          {result &&
            (result.after.bytes > LARGE_BYTES ? (
              <Badge variant="warning-light">Still large</Badge>
            ) : result.resized ? (
              <Badge variant="success-light">Resized</Badge>
            ) : (
              <Badge variant="secondary">Size kept</Badge>
            ))}
          {entry?.status === "failed" && <Badge variant="destructive-light">Failed</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground tabular-nums">
          <span>{result ? `${result.before.width} × ${result.before.height} · ${mb(bytes)}` : mb(bytes)}</span>
          <span aria-hidden>→</span>
          {result ? (
            <span className="font-medium text-foreground">
              {result.after.width} × {result.after.height} · {mb(result.after.bytes)}
            </span>
          ) : entry?.status === "failed" ? (
            <span>Not converted</span>
          ) : (
            <span className="inline-flex items-center gap-1">
              {entry?.status === "working" && <Spinner className="size-3" />}
              {entry?.status === "working" ? "Working…" : "Waiting…"}
            </span>
          )}
        </div>
        {entry?.status === "failed" && <p className="text-xs text-destructive">{entry.message}</p>}
        {result && result.after.bytes > LARGE_BYTES && (
          <p className="text-xs text-muted-foreground">Try a lower quality or a smaller longest side.</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {done && (
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<a href={done.url} download={done.result.name} />}
          >
            <DownloadIcon />
            Save
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" aria-label={`Remove ${name}`} onClick={onRemove}>
          <XIcon />
        </Button>
      </div>
    </li>
  );
}
