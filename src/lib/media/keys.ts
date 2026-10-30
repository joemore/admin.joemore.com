import { randomBytes } from "node:crypto";
import { MediaError } from "./types";

export function randomPublicId(): string { return randomBytes(9).toString("base64url"); }
export function sanitizeSlug(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48).replace(/-$/, "");
}
export function createStorageKey(filename: string, extension: string, prefix = "u/", id = randomPublicId()): string {
  if (prefix !== "u/" || !/^[A-Za-z0-9_-]{12}$/.test(id) || !/^[a-z0-9]{1,8}$/.test(extension)) throw new MediaError("Unsafe upload destination.");
  const slug = sanitizeSlug(filename.replace(/\.[^.]+$/, ""));
  return `${prefix}${id}${slug ? `-${slug}` : ""}.${extension}`;
}
export function createThumbnailKey(id = randomPublicId()): string {
  if (!/^[A-Za-z0-9_-]{12}$/.test(id)) throw new MediaError("Unsafe thumbnail identifier.");
  return `u/_thumbs/${id}.webp`;
}
export function isManagedKey(key: string, thumbnail = false): boolean {
  return thumbnail ? /^u\/_thumbs\/[A-Za-z0-9_-]{12}\.webp$/.test(key) : /^u\/[A-Za-z0-9_-]{12}(?:-[a-z0-9][a-z0-9-]{0,47})?\.[a-z0-9]{1,8}$/.test(key);
}
export function assertManagedKey(key: string, thumbnail = false): void {
  if (!isManagedKey(key, thumbnail)) throw new MediaError("This object is outside the managed media namespace.", 403, "unsafe_key");
}
export function publicUrl(base: string, key: string): string { return `${base.replace(/\/$/, "")}/${key.split("/").map(encodeURIComponent).join("/")}`; }
