import { MediaError, type MediaType, type UploadRequest, type MediaStatus } from "./types";

export const SUPPORTED_FORMATS: Record<string, { mime: string; aliases?: string[]; type: MediaType }> = {
  jpg: { mime: "image/jpeg", type: "image" }, jpeg: { mime: "image/jpeg", type: "image" },
  png: { mime: "image/png", type: "image" }, webp: { mime: "image/webp", type: "image" }, gif: { mime: "image/gif", type: "image" }, avif: { mime: "image/avif", type: "image" },
  mp4: { mime: "video/mp4", type: "video" }, webm: { mime: "video/webm", type: "video" }, mov: { mime: "video/quicktime", type: "video" },
  mp3: { mime: "audio/mpeg", aliases: ["audio/mp3"], type: "audio" }, wav: { mime: "audio/wav", aliases: ["audio/x-wav", "audio/wave"], type: "audio" },
  m4a: { mime: "audio/mp4", aliases: ["audio/x-m4a"], type: "audio" }, ogg: { mime: "audio/ogg", aliases: ["application/ogg"], type: "audio" },
  pdf: { mime: "application/pdf", type: "document" }, txt: { mime: "text/plain", type: "document" }, zip: { mime: "application/zip", aliases: ["application/x-zip-compressed"], type: "document" },
};
export const ACCEPTED_FILES = Object.keys(SUPPORTED_FORMATS).map((extension) => `.${extension}`).join(",");
export const MAX_THUMBNAIL_BYTES = 1024 ** 2;
export type ValidatedUpload = Required<Pick<UploadRequest, "filename" | "mimeType" | "sizeBytes" | "displayName">> & {
  description: string | null; extension: string; mediaType: MediaType; width: number | null; height: number | null; durationMs: number | null; thumbnailSizeBytes: number | null;
};
function optionalNumber(value: unknown, label: string, max: number): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || Number(value) <= 0 || Number(value) > max) throw new MediaError(`${label} is invalid.`);
  return Number(value);
}
export function boundedText(value: unknown, label: string, max: number, required = false): string | null {
  if (value === undefined || value === null || value === "") { if (required) throw new MediaError(`${label} is required.`); return null; }
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new MediaError(`${label} must contain at most ${max} characters.`);
  const text = value.trim();
  if (required && !text) throw new MediaError(`${label} is required.`);
  return text || null;
}
export function validateUpload(input: unknown, maxFileSize: number): ValidatedUpload {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new MediaError("Provide valid file metadata.");
  const raw = input as Record<string, unknown>;
  const filename = boundedText(raw.filename, "Filename", 255, true)!;
  if (/[\\/\r\n]/.test(filename) || filename === "." || filename === ".." || filename.startsWith(".")) throw new MediaError("Use a plain filename without paths or hidden names.");
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  const format = SUPPORTED_FORMATS[extension];
  if (!format) throw new MediaError("This file type is not allowed. HTML, SVG, scripts and executable files are blocked.");
  if (typeof raw.mimeType !== "string" || ![format.mime, ...(format.aliases || [])].includes(raw.mimeType.toLowerCase())) throw new MediaError("The file extension and MIME type must match an allowed format.");
  const sizeBytes = Number(raw.sizeBytes);
  if (typeof raw.sizeBytes !== "number" || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxFileSize) throw new MediaError(`File size must be between 1 and ${maxFileSize} bytes.`);
  const width = optionalNumber(raw.width, "Width", 100000);
  const height = optionalNumber(raw.height, "Height", 100000);
  const durationMs = optionalNumber(raw.durationMs, "Duration", 2 ** 31 - 1);
  const thumbnailSizeBytes = optionalNumber(raw.thumbnailSizeBytes, "Thumbnail size", MAX_THUMBNAIL_BYTES);
  if (thumbnailSizeBytes && format.type !== "image") throw new MediaError("Only images may include a generated thumbnail.");
  return { filename, extension, mimeType: format.mime, mediaType: format.type, sizeBytes, displayName: boundedText(raw.displayName, "Display name", 160) || filename.slice(0, 160), description: boundedText(raw.description, "Description", 4000), width, height, durationMs, thumbnailSizeBytes };
}
export function validateMetadata(input: unknown): { display_name: string; description: string | null; alt_text: string | null } {
  if (!input || typeof input !== "object") throw new MediaError("Provide valid metadata.");
  const raw = input as Record<string, unknown>;
  return { display_name: boundedText(raw.displayName, "Display name", 160, true)!, description: boundedText(raw.description, "Description", 4000), alt_text: boundedText(raw.altText, "Alt text", 2000) };
}
export function contentDisposition(filename: string, mediaType: MediaType): string {
  const escaped = filename.replace(/[^\x20-\x7E]|["\\\r\n]/g, "_");
  return `${mediaType === "document" ? "attachment" : "inline"}; filename="${escaped}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}
export function canTransition(from: MediaStatus, to: MediaStatus): boolean {
  const transitions: Record<MediaStatus, MediaStatus[]> = { pending: ["completing", "failed"], completing: ["ready", "pending", "failed"], ready: ["deleting"], failed: ["deleting"], deleting: ["deleted", "delete_failed"], delete_failed: ["deleting"], deleted: [] };
  return transitions[from].includes(to);
}
/** Reject obvious masquerading files using a bounded R2 range read, not original-file processing. */
export function matchesFileSignature(bytes: Uint8Array, mime: string): boolean {
  const ascii = (start: number, end: number) => new TextDecoder("latin1").decode(bytes.slice(start, end));
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") return [137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n);
  if (mime === "image/gif") return ["GIF87a", "GIF89a"].includes(ascii(0,6));
  if (mime === "image/webp") return ascii(0,4) === "RIFF" && ascii(8,12) === "WEBP";
  if (mime === "audio/wav") return ascii(0,4) === "RIFF" && ascii(8,12) === "WAVE";
  if (["image/avif", "video/mp4", "video/quicktime", "audio/mp4"].includes(mime)) {
    if (mime === "video/quicktime" && ["wide", "mdat", "moov"].includes(ascii(4,8))) return true;
    if (ascii(4,8) !== "ftyp") return false;
    return mime !== "image/avif" || /avif|avis/.test(ascii(8,64));
  }
  if (mime === "video/webm") return [26,69,223,163].every((n,i) => bytes[i] === n);
  if (mime === "audio/ogg") return ascii(0,4) === "OggS";
  if (mime === "audio/mpeg") return ascii(0,3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  if (mime === "application/pdf") return ascii(0,5) === "%PDF-";
  if (mime === "application/zip") return bytes[0] === 80 && bytes[1] === 75 && [3,5,7].includes(bytes[2]);
  if (mime === "text/plain") return !bytes.includes(0);
  return false;
}
