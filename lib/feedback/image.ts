import "server-only";

import { randomUUID } from "node:crypto";

import sharp from "sharp";

import { adminDb } from "@/lib/db/admin";

import type { FeedbackActor } from "./data";
import { IMAGE_MAX_BYTES } from "./validation";

// The one image a manual feedback entry can carry (migration 0009). Private
// bucket in this project; read and written only here, with the secret key,
// and shown only through the admin's own route after requireAdmin().
//
// Every upload is decoded and re-encoded to WebP. That drops the metadata a
// phone photo carries -- GPS position, camera, time -- and anything appended
// behind a valid header, and it means the bucket only ever holds pictures this
// server produced. What the picture SHOWS is the admin's responsibility; the
// form asks for nothing personal in it.

const BUCKET = "manual-feedback";

/** What the server decodes. By content, never by the browser's claim; no SVG, which is a script container. */
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "gif"]);

/** Longest side after re-encoding: sharp enough to read a phone screenshot, small enough to load fast. */
const MAX_SIDE = 2400;

/** Refuse decompression bombs: a few kB of PNG can claim gigapixels. */
const MAX_INPUT_PIXELS = 40_000_000;

export class ImageRejected extends Error {}

/**
 * Decodes an upload and re-encodes it as WebP without metadata, upright and at
 * most MAX_SIDE on its longest side. Throws ImageRejected, with a message fit
 * for the form, for anything that is not a usable image.
 */
export async function sanitizeImage(file: File): Promise<Buffer> {
  if (file.size > IMAGE_MAX_BYTES) {
    throw new ImageRejected(`The image is larger than ${IMAGE_MAX_BYTES / 1024 / 1024} MB.`);
  }
  const input = Buffer.from(await file.arrayBuffer());

  let format: string | undefined;
  try {
    format = (await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()).format;
  } catch {
    throw new ImageRejected("That file is not an image this page can read. Use JPEG, PNG, WebP or GIF.");
  }
  if (!format || !ACCEPTED_FORMATS.has(format)) {
    throw new ImageRejected("Use a JPEG, PNG, WebP or GIF image.");
  }

  try {
    return await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, animated: false })
      // Applies the EXIF orientation before the EXIF goes, so photos stay upright.
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      // sharp writes no metadata unless asked to (withMetadata), which is the point.
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new ImageRejected("That image could not be processed. Try another file or a screenshot of it.");
  }
}

function newPath(entryId: string): string {
  return `${entryId}/${randomUUID()}.webp`;
}

async function removeObject(path: string): Promise<void> {
  const { error } = await adminDb().storage.from(BUCKET).remove([path]);
  // Logged, not thrown: the entry is already right, and an orphan holds no
  // more than the entry it belonged to. The bucket listing shows it by id.
  if (error) console.error(`[feedback] could not delete image object ${path}: ${error.message}`);
}

/**
 * Stores a sanitized image as the entry's image, replacing any earlier one,
 * and writes the audit entry (set_manual_feedback_image, 0009). Upload first,
 * then the row; the object it replaced is deleted last, and the new one again
 * if the row could not be written.
 */
export async function setManualImage(entryId: string, webp: Buffer, actor: FeedbackActor): Promise<void> {
  const path = newPath(entryId);
  const upload = await adminDb()
    .storage.from(BUCKET)
    .upload(path, webp, { contentType: "image/webp", upsert: false });
  if (upload.error) throw new Error(`image upload: ${upload.error.message}`);

  let replaced: string | null;
  try {
    replaced = await writeImagePath(entryId, path, actor);
  } catch (error) {
    await removeObject(path);
    throw error;
  }
  if (replaced && replaced !== path) await removeObject(replaced);
}

/** Clears the entry's image and deletes the object. Nothing happens when there is none. */
export async function removeManualImage(entryId: string, actor: FeedbackActor): Promise<void> {
  const replaced = await writeImagePath(entryId, null, actor);
  if (replaced) await removeObject(replaced);
}

async function writeImagePath(entryId: string, path: string | null, actor: FeedbackActor): Promise<string | null> {
  const { data, error } = await adminDb().rpc("set_manual_feedback_image", {
    p_id: entryId,
    p_image_path: path,
    p_actor_id: actor.id,
    p_actor_label: actor.label,
  });
  if (error) throw new Error(`set_manual_feedback_image: ${error.message}`);
  return (data as string | null) ?? null;
}

/** The entry's image as stored, or null when it has none or it is missing. */
export async function readManualImage(entryId: string): Promise<Blob | null> {
  const row = await adminDb().from("manual_feedback").select("image_path").eq("id", entryId).maybeSingle();
  if (row.error) throw new Error(`manual feedback: ${row.error.message}`);
  const path = (row.data as { image_path: string | null } | null)?.image_path;
  if (!path) return null;

  const { data, error } = await adminDb().storage.from(BUCKET).download(path);
  if (error) {
    console.error(`[feedback] image object for ${entryId} could not be read: ${error.message}`);
    return null;
  }
  return data;
}
