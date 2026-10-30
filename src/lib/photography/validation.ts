import { MediaError } from "../media/types";
import { assertAssetId } from "../media/http-policy";
import type { PhotographyMetadata } from "./types";

export const metadataDefaults: PhotographyMetadata = {
  title: "Untitled", caption: null, description: null, alt_text: null, date_taken: null,
  capture_local: null, capture_timezone: null, camera_make: null, camera_model: null,
  lens_model: null, aperture: null, shutter_speed: null, iso: null, focal_length: null,
  exposure_compensation: null, camera_settings: {}, latitude: null, longitude: null,
  altitude: null, location_name: null, country: null, region: null,
  location_visibility: "hidden", featured: false, allow_original_download: false,
  display_order: null, width: null, height: null, duration_ms: null, orientation: null,
};
const strings: Record<string, number> = { title: 160, caption: 5000, description: 20000, alt_text: 2000, camera_make: 160, camera_model: 160, lens_model: 200, shutter_speed: 80, location_name: 240, country: 100, region: 200, capture_timezone: 80 };
const numbers: Record<string, [number, number, boolean?]> = { aperture: [0.1, 256], iso: [1, 10000000, true], focal_length: [0.1, 100000], exposure_compensation: [-30, 30], latitude: [-90, 90], longitude: [-180, 180], altitude: [-15000, 100000], display_order: [-2147483648, 2147483647, true], width: [1, 100000, true], height: [1, 100000, true], duration_ms: [0, 2147483647, true], orientation: [1, 8, true] };
export function validatePhotographyMetadata(input: unknown): Partial<PhotographyMetadata> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new MediaError("Metadata must be an object.");
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(metadataDefaults, key)) throw new MediaError(`The metadata field ${key} cannot be edited.`);
    if (key in strings) {
      if (value === null && key !== "title") { patch[key] = null; continue; }
      if (typeof value !== "string" || value.length > strings[key] || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new MediaError(`Invalid ${key.replaceAll("_", " ")}.`);
      const text = value.trim();
      if (key === "title" && !text) throw new MediaError("A title is required.");
      if (key === "capture_timezone" && text && !/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(text)) {
        try { new Intl.DateTimeFormat("en", { timeZone: text }); } catch { throw new MediaError("Use an IANA capture timezone or UTC offset such as +01:00."); }
      }
      patch[key] = text || null;
    } else if (key in numbers) {
      const [min, max, integer] = numbers[key];
      if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value)))) throw new MediaError(`Invalid ${key.replaceAll("_", " ")}.`);
      patch[key] = value;
    } else if (["featured", "allow_original_download"].includes(key)) {
      if (typeof value !== "boolean") throw new MediaError(`Invalid ${key.replaceAll("_", " ")}.`);
      patch[key] = value;
    } else if (key === "location_visibility") {
      if (!["hidden", "approximate", "exact"].includes(String(value))) throw new MediaError("Choose hidden, approximate or exact location visibility.");
      patch[key] = value;
    } else if (key === "camera_settings") {
      if (!value || typeof value !== "object" || Array.isArray(value) || JSON.stringify(value).length > 8000) throw new MediaError("Camera settings must be an object of at most 8,000 characters.");
      patch[key] = value;
    } else if (key === "date_taken" || key === "capture_local") {
      if (value === null || value === "") { patch[key] = null; continue; }
      if (typeof value !== "string") throw new MediaError("Invalid capture date.");
      const pattern = key === "date_taken" ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/ : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?$/;
      const calendarDay = value.slice(0, 10), midnight = Date.parse(`${calendarDay}T00:00:00Z`);
      const validDay = Number.isFinite(midnight) && new Date(midnight).toISOString().slice(0, 10) === calendarDay;
      const validClock = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?/.test(value);
      if (!pattern.test(value) || !validDay || !validClock || !Number.isFinite(Date.parse(key === "capture_local" ? `${value}Z` : value))) throw new MediaError(key === "date_taken" ? "Date taken must include an explicit UTC offset; keep unknown-zone dates in local capture time." : "Local capture time must not contain a timezone.");
      patch[key] = value;
    }
  }
  const latitude = patch.latitude, longitude = patch.longitude;
  if ((latitude === null && typeof longitude === "number") || (longitude === null && typeof latitude === "number")) throw new MediaError("Latitude and longitude must both be supplied or cleared together.");
  return patch as Partial<PhotographyMetadata>;
}
export function validateIds(input: unknown, max = 100): string[] {
  if (!Array.isArray(input) || input.length > max || input.some((id) => typeof id !== "string")) throw new MediaError(`Choose at most ${max} items.`);
  const values = input.map((id) => assertAssetId(id));
  if (new Set(values).size !== values.length) throw new MediaError("Duplicate identifiers are not allowed.");
  return values;
}
export function validateTag(input: unknown): { name: string; slug: string } {
  if (typeof input !== "string") throw new MediaError("A tag name is required.");
  const name = input.normalize("NFKC").trim().replace(/\s+/g, " ");
  const slug = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  if (!name || name.length > 80 || !slug || slug.length > 100 || /[\u0000-\u001f]/.test(name)) throw new MediaError("Use a tag name of 1–80 characters containing letters or numbers.");
  return { name, slug };
}
export function validateAlbum(input: Record<string, unknown>, partial = false) {
  const patch: Record<string, unknown> = {};
  if (!partial || "title" in input) {
    if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 160) throw new MediaError("Use an album title of 1–160 characters.");
    patch.title = input.title.trim();
  }
  if (!partial || "slug" in input) {
    const slug = typeof input.slug === "string" ? input.slug.trim() : "";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) throw new MediaError("Use a lowercase album slug with letters, numbers and hyphens.");
    patch.slug = slug;
  }
  if ("description" in input) {
    if (input.description !== null && (typeof input.description !== "string" || input.description.length > 10000)) throw new MediaError("Album description is too long.");
    patch.description = typeof input.description === "string" ? input.description.trim() || null : null;
  }
  if ("cover_item_id" in input) patch.cover_item_id = input.cover_item_id === null ? null : assertAssetId(String(input.cover_item_id));
  if ("display_order" in input) {
    if (!Number.isInteger(input.display_order) || Number(input.display_order) < -2147483648 || Number(input.display_order) > 2147483647) throw new MediaError("Invalid album display order.");
    patch.display_order = input.display_order;
  }
  if ("status" in input) {
    if (!["draft", "published"].includes(String(input.status))) throw new MediaError("Invalid album status.");
    patch.status = input.status;
    patch.published_at = input.status === "published" ? new Date().toISOString() : null;
  }
  return patch;
}
export function parsePhotographyQuery(url: URL) {
  const p = url.searchParams;
  const page = Number(p.get("page") || 1), pageSize = Number(p.get("pageSize") || 36);
  if (!Number.isInteger(page) || page < 1 || page > 100000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 60) throw new MediaError("Invalid photography page.");
  const type = p.get("type") || "all", status = p.get("status") || "all", sortValue = p.get("sort") || "newest", sort = sortValue === "date_taken" ? "taken" : sortValue;
  if (!["all", "photo", "video"].includes(type) || !["all", "draft", "published"].includes(status) || !["newest", "oldest", "title", "taken", "taken_oldest"].includes(sort)) throw new MediaError("Invalid library filter.");
  const q = (p.get("q") || p.get("search") || "").trim();
  const camera = (p.get("camera") || "").trim();
  if (q.length > 120 || camera.length > 160) throw new MediaError("Filter text is too long.");
  const year = p.get("year") || "";
  if (year && (!/^\d{4}$/.test(year) || Number(year) < 1)) throw new MediaError("Invalid capture year.");
  return { page, pageSize, type, status, sort, q, camera, year, tag: p.get("tag") ? assertAssetId(p.get("tag")!) : "", album: p.get("album") ? assertAssetId(p.get("album")!) : "" };
}
export type PhotographyQuery = ReturnType<typeof parsePhotographyQuery>;
