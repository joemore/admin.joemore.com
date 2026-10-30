import type { PhotographyMetadata, PhotographyUploadRole } from "./types";
import { readPhotographyExif } from "./metadata";

export const PHOTO_INPUT_ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/gif,video/mp4,video/webm";
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm"]);
const MAX_PIXELS = 80_000_000;
const MAX_IMAGE_BYTES = 120 * 1024 ** 2;

export type PreparedPhotography = {
  files: Record<"original" | "preview" | "thumbnail", File | Blob> & Partial<Record<"poster", Blob>>;
  metadata: Partial<PhotographyMetadata>;
  originalHasGps: boolean;
  fingerprint: string;
};

export function photographyFileKind(file: Pick<File, "type" | "size">): "photo" | "video" {
  if (!file.size || file.size > 2 * 1024 ** 3) throw new Error("Choose a non-empty file no larger than 2 GB.");
  if (PHOTO_TYPES.has(file.type)) return "photo";
  if (VIDEO_TYPES.has(file.type)) return "video";
  throw new Error("Choose a JPEG, PNG, WebP, AVIF, GIF, MP4 or WebM file. Convert HEIC and RAW photos to a supported image before importing.");
}

/** Large masters use bounded samples; this is duplicate detection, not content integrity verification. */
export async function photographyFingerprint(file: Blob): Promise<string> {
  let bytes: ArrayBuffer;
  if (file.size <= 64 * 1024 ** 2) bytes = await file.arrayBuffer();
  else {
    const sampleSize = 1024 ** 2;
    const middle = Math.floor(file.size / 2);
    bytes = await new Blob([`photography-sampled-v1:${file.size}:`, file.slice(0, sampleSize), file.slice(middle, middle + sampleSize), file.slice(-sampleSize)]).arrayBuffer();
  }
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (value) => value.toString(16).padStart(2, "0")).join("");
}

function validateDimensions(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width > 24000 || height > 24000 || width * height > MAX_PIXELS) throw new Error("This image is too large to process safely in the browser. Supply a smaller supported photograph.");
}

async function canvasWebp(source: CanvasImageSource, width: number, height: number, maximum: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maximum / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable in this browser.");
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (!blob || blob.type !== "image/webp") throw new Error("This browser cannot generate WebP images. Try a current browser.");
    return blob;
  } finally { canvas.width = 1; canvas.height = 1; }
}

async function photoDerivatives(file: File, metadata: Partial<PhotographyMetadata>) {
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Images larger than 120 MB need to be reduced before browser processing.");
  if (metadata.width && metadata.height) validateDimensions(metadata.width, metadata.height);
  if (typeof createImageBitmap !== "function") throw new Error("Image processing is unavailable. Use a current browser.");
  // Explicit from-image applies EXIF rotation once, including mirrored orientations.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    validateDimensions(bitmap.width, bitmap.height);
    const preview = await canvasWebp(bitmap, bitmap.width, bitmap.height, 2560, 0.86);
    const thumbnail = await canvasWebp(bitmap, bitmap.width, bitmap.height, 480, 0.76);
    if (preview.size > 24 * 1024 ** 2 || thumbnail.size > 1024 ** 2) throw new Error("The generated image exceeds the upload limit.");
    // EXIF dimensions are the original sensor dimensions, before orientation.
    return { preview, thumbnail, width: metadata.width || bitmap.width, height: metadata.height || bitmap.height };
  } finally { bitmap.close(); }
}

function waitForVideo(video: HTMLVideoElement, event: "loadedmetadata" | "loadeddata" | "seeked"): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error("The video could not be read. Supply a browser-compatible MP4 or WebM.")), 20_000);
    const success = () => finish();
    const failure = () => finish(new Error("The browser cannot decode this video. Supply an optimised MP4 or WebM."));
    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      video.removeEventListener(event, success);
      video.removeEventListener("error", failure);
      if (error) reject(error); else resolve();
    };
    video.addEventListener(event, success, { once: true });
    video.addEventListener("error", failure, { once: true });
  });
}

async function videoDerivatives(variant: File) {
  if (!VIDEO_TYPES.has(variant.type) || !variant.size || variant.size > 2 * 1024 ** 3) throw new Error("Supply a web-ready MP4 or WebM no larger than 2 GB.");
  const url = URL.createObjectURL(variant);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  try {
    const metadataReady = waitForVideo(video, "loadedmetadata");
    video.src = url;
    await metadataReady;
    validateDimensions(video.videoWidth, video.videoHeight);
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error("The browser could not determine the video duration.");
    if (video.readyState < 2) await waitForVideo(video, "loadeddata");
    const position = Math.min(1, video.duration / 4);
    if (position > 0) {
      const frameReady = waitForVideo(video, "seeked");
      video.currentTime = position;
      await frameReady;
    }
    const poster = await canvasWebp(video, video.videoWidth, video.videoHeight, 2560, 0.84);
    const thumbnail = await canvasWebp(video, video.videoWidth, video.videoHeight, 480, 0.76);
    return { poster, thumbnail, width: video.videoWidth, height: video.videoHeight, duration_ms: Math.round(video.duration * 1000) };
  } finally { video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); }
}

async function originalVideoMetadata(file: File): Promise<Partial<PhotographyMetadata>> {
  const video = document.createElement("video");
  const url = URL.createObjectURL(file);
  video.preload = "metadata";
  try {
    const ready = waitForVideo(video, "loadedmetadata");
    video.src = url;
    await ready;
    return {
      width: video.videoWidth > 0 ? video.videoWidth : null,
      height: video.videoHeight > 0 ? video.videoHeight : null,
      duration_ms: Number.isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration * 1000) : null,
    };
  } catch { return {}; }
  finally { video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); }
}

export async function preparePhotography(file: File, webVideo?: File, manual: Partial<PhotographyMetadata> = {}): Promise<PreparedPhotography> {
  const kind = photographyFileKind(file);
  const fingerprint = await photographyFingerprint(file);
  if (kind === "video") {
    if (!webVideo) throw new Error("Choose a web-ready video, or confirm that this original is already ready for public playback.");
    const derivatives = await videoDerivatives(webVideo);
    const originalMetadata = webVideo === file
      ? { width: derivatives.width, height: derivatives.height, duration_ms: derivatives.duration_ms }
      : await originalVideoMetadata(file);
    return {
      fingerprint, originalHasGps: false,
      metadata: { title: file.name.replace(/\.[^.]+$/, ""), ...originalMetadata, ...manual },
      files: { original: file, preview: webVideo, thumbnail: derivatives.thumbnail, poster: derivatives.poster },
    };
  }
  const extracted = await readPhotographyExif(file);
  const metadata = { ...extracted.metadata, ...manual };
  const derivatives = await photoDerivatives(file, metadata);
  return {
    fingerprint, originalHasGps: extracted.originalHasGps,
    metadata: { title: file.name.replace(/\.[^.]+$/, ""), ...metadata, width: derivatives.width, height: derivatives.height, ...manual },
    files: { original: file, preview: derivatives.preview, thumbnail: derivatives.thumbnail },
  };
}

export function uploadFilename(original: File, role: PhotographyUploadRole, blob: Blob): string {
  if (role === "original") return original.name;
  if (blob instanceof File && (blob.type === "video/mp4" || blob.type === "video/webm")) return blob.name;
  return `${original.name.replace(/\.[^.]+$/, "")}-${role}.webp`;
}
