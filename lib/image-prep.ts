// Shrinks a photo for Directus, entirely in the browser: decode, resize on a
// canvas, re-encode. Used only by /image-prep, a public page -- nothing here
// may ever send the image anywhere.
//
// Why it exists: Directus Cloud refuses to transform any image with a side
// over 6000 px (ILLEGAL_ASSET_TRANSFORMATION), the app always asks for a
// transformed copy, and Cloud offers no way to resize on upload.

export type PrepSettings = {
  /** Longest side of the result, in px. Smaller images are not enlarged. */
  maxSide: number;
  /** JPEG quality, 0-1. */
  quality: number;
};

export type PrepResult = {
  blob: Blob;
  name: string;
  /** "image/jpeg" or "image/png". */
  type: string;
  before: { width: number; height: number; bytes: number };
  after: { width: number; height: number; bytes: number };
  /** Whether the image had to be scaled down. */
  resized: boolean;
  /** A small JPEG/PNG for the list, so the page never shows a full-size decode. */
  thumbnail: Blob;
};

/** Thrown when the browser cannot open the file; `heic` says why it most likely failed. */
export class DecodeError extends Error {
  constructor(readonly heic: boolean) {
    super("decode");
  }
}

const THUMB_SIDE = 128;

type Decoded = { source: CanvasImageSource; width: number; height: number; close: () => void };

async function decode(file: File): Promise<Decoded> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  } catch {
    // Safari opens HEIC through <img> but not always through createImageBitmap.
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      URL.revokeObjectURL(url);
      throw new DecodeError(/\.(heic|heif)$/i.test(file.name) || /hei[cf]/i.test(file.type));
    }
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  }
}

function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

function draw(target: HTMLCanvasElement, source: CanvasImageSource) {
  const ctx = target.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, target.width, target.height);
}

// Halve until close to the target, then one last pass: a single big jump in
// the canvas resampler leaves the result soft and aliased. Halving also keeps
// every canvas below the full-size image, which matters on iPad memory limits.
function resize(source: CanvasImageSource, width: number, height: number, toWidth: number, toHeight: number) {
  let current = source;
  let w = width;
  let h = height;
  while (w / 2 >= toWidth * 1.05) {
    const step = canvas(Math.round(w / 2), Math.round(h / 2));
    draw(step, current);
    current = step;
    w = step.width;
    h = step.height;
  }
  const out = canvas(toWidth, toHeight);
  draw(out, current);
  return out;
}

function hasTransparency(c: HTMLCanvasElement) {
  const data = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

function toBlob(c: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) =>
    c.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode"))), type, quality),
  );
}

const baseName = (name: string) => name.replace(/\.[^.]+$/, "");

/**
 * Shrinks one image. Transparent PNG/WebP/GIF/TIFF become PNG, everything
 * else JPEG; the base name stays, so the copy is easy to match to the file it
 * replaces in Directus. Re-encoding through a canvas drops all metadata
 * (EXIF location, camera data), and the result is always re-encoded.
 */
export async function prepareImage(file: File, settings: PrepSettings): Promise<PrepResult> {
  const img = await decode(file);
  try {
    const { width, height } = img;
    const scale = Math.min(1, settings.maxSide / Math.max(width, height));
    const toWidth = Math.max(1, Math.round(width * scale));
    const toHeight = Math.max(1, Math.round(height * scale));
    const out = resize(img.source, width, height, toWidth, toHeight);

    const mayHaveAlpha = /png|webp|gif|tiff/i.test(file.type) || /\.(png|webp|gif|tiff?)$/i.test(file.name);
    const png = mayHaveAlpha && hasTransparency(out);
    const type = png ? "image/png" : "image/jpeg";
    // Always the re-encoded copy, even when it comes out a little bigger
    // than a small original: only that one is sure to carry no metadata.
    const blob = await toBlob(out, type, png ? undefined : settings.quality);
    const name = `${baseName(file.name)}.${png ? "png" : "jpg"}`;

    const thumbScale = Math.min(1, THUMB_SIDE / Math.max(toWidth, toHeight));
    const thumbCanvas = resize(
      out,
      toWidth,
      toHeight,
      Math.max(1, Math.round(toWidth * thumbScale)),
      Math.max(1, Math.round(toHeight * thumbScale)),
    );
    const thumbnail = await toBlob(thumbCanvas, png ? "image/png" : "image/jpeg", 0.8);

    return {
      blob,
      name,
      type,
      before: { width, height, bytes: file.size },
      after: { width: toWidth, height: toHeight, bytes: blob.size },
      resized: scale < 1,
      thumbnail,
    };
  } finally {
    img.close();
  }
}
