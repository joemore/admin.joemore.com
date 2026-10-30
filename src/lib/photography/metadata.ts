import type { PhotographyMetadata } from "./types";

export type ExifRecord = Record<string, unknown>;

export function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const fraction = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    if (fraction) return Number(fraction[2]) ? finiteNumber(Number(fraction[1]) / Number(fraction[2])) : null;
    if (/^-?\d+(?:\.\d+)?$/.test(value.trim())) return finiteNumber(Number(value));
  }
  return null;
}

function positive(value: unknown): number | null {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.replace(/\0/g, "").trim().slice(0, 500) : null;
}

/** EXIF coordinates can be decimal degrees or degrees/minutes/seconds. */
export function gpsCoordinate(value: unknown, reference: unknown, latitude: boolean): number | null {
  let number: number | null;
  if (Array.isArray(value) && value.length === 3) {
    const [degrees, minutes, seconds] = value.map(finiteNumber);
    if (degrees === null || minutes === null || seconds === null || degrees < 0 || minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) return null;
    number = degrees + minutes / 60 + seconds / 3600;
  } else number = finiteNumber(value);
  if (number === null) return null;
  const ref = typeof reference === "string" ? reference.toUpperCase().trim() : "";
  if (ref && !(latitude ? ["N", "S"] : ["E", "W"]).includes(ref)) return null;
  if (ref === "S" || ref === "W") number = -Math.abs(number);
  if (ref === "N" || ref === "E") number = Math.abs(number);
  return Math.abs(number) <= (latitude ? 90 : 180) ? number : null;
}

export function formatShutter(value: unknown): string | null {
  const seconds = positive(value);
  if (seconds === null) return null;
  if (seconds < 1) {
    const reciprocal = 1 / seconds;
    if (Math.abs(reciprocal - Math.round(reciprocal)) < 0.03) return `1/${Math.round(reciprocal)}s`;
  }
  return `${Number(seconds.toPrecision(5))}s`;
}

/** Never convert a timezone-less wall clock through the machine's local timezone. */
export function captureTimestamp(value: unknown, offsetValue?: unknown): Pick<PhotographyMetadata, "capture_local" | "capture_timezone" | "date_taken"> {
  const empty = { capture_local: null, capture_timezone: null, date_taken: null };
  if (typeof value !== "string") return empty;
  const match = value.trim().match(/^(\d{4})[:-](\d{2})[:-](\d{2})[T ](\d{2}):(\d{2}):(\d{2})(\.\d{1,6})?(Z|[+-]\d{2}:?\d{2})?$/);
  if (!match) return empty;
  const [, year, month, day, hour, minute, second, fraction = "", inlineOffset] = match;
  const wall = `${year}-${month}-${day}T${hour}:${minute}:${second}${fraction}`;
  const check = new Date(`${wall}Z`);
  if (Number(year) < 1 || Number(year) > 9999 || Number(month) < 1 || Number(month) > 12 || !Number.isFinite(check.getTime()) || check.getUTCFullYear() !== Number(year) || check.getUTCMonth() + 1 !== Number(month) || check.getUTCDate() !== Number(day) || check.getUTCHours() !== Number(hour) || check.getUTCMinutes() !== Number(minute) || check.getUTCSeconds() !== Number(second)) return empty;
  const rawOffset = inlineOffset || (typeof offsetValue === "string" ? offsetValue.trim() : "");
  if (!rawOffset) return { ...empty, capture_local: wall };
  const offset = rawOffset === "Z" ? "+00:00" : rawOffset.replace(/^([+-]\d{2})(\d{2})$/, "$1:$2");
  if (!/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(offset) || (offset.slice(1, 3) === "14" && offset.slice(4) !== "00")) return { ...empty, capture_local: wall };
  return { capture_local: wall, capture_timezone: offset, date_taken: new Date(`${wall}${offset}`).toISOString() };
}

/** Manual values, including explicit nulls, always win on subsequent extraction. */
export function normalizeExif(raw: ExifRecord | null | undefined, manual: Partial<PhotographyMetadata> = {}): Partial<PhotographyMetadata> {
  const value = raw || {};
  const latitude = gpsCoordinate(value.latitude ?? value.GPSLatitude, value.GPSLatitudeRef, true);
  const longitude = gpsCoordinate(value.longitude ?? value.GPSLongitude, value.GPSLongitudeRef, false);
  const iso = positive(value.ISO ?? value.ISOSpeedRatings ?? value.PhotographicSensitivity);
  const orientation = positive(value.Orientation);
  const altitude = finiteNumber(value.GPSAltitude);
  const cameraSettings: Record<string, unknown> = {};
  for (const key of ["ExposureProgram", "MeteringMode", "WhiteBalance", "Flash", "ExposureMode"]) {
    const number = finiteNumber(value[key]);
    if (number !== null) cameraSettings[key] = number;
  }
  const extracted: Partial<PhotographyMetadata> = {
    ...captureTimestamp(value.DateTimeOriginal ?? value.CreateDate, value.OffsetTimeOriginal ?? value.OffsetTimeDigitized),
    camera_make: text(value.Make), camera_model: text(value.Model), lens_model: text(value.LensModel),
    aperture: positive(value.FNumber), shutter_speed: formatShutter(value.ExposureTime),
    iso: iso !== null && Number.isSafeInteger(iso) ? iso : null,
    focal_length: positive(value.FocalLength), exposure_compensation: finiteNumber(value.ExposureCompensation ?? value.ExposureBiasValue),
    latitude: latitude !== null && longitude !== null ? latitude : null,
    longitude: latitude !== null && longitude !== null ? longitude : null,
    altitude: altitude !== null ? (value.GPSAltitudeRef === 1 || value.GPSAltitudeRef === "1" ? -Math.abs(altitude) : altitude) : null,
    orientation: orientation !== null && Number.isInteger(orientation) && orientation <= 8 ? orientation : null,
    width: positive(value.ExifImageWidth ?? value.PixelXDimension ?? value.ImageWidth),
    height: positive(value.ExifImageHeight ?? value.PixelYDimension ?? value.ImageHeight),
    camera_settings: cameraSettings,
  };
  return { ...extracted, ...manual };
}

export function exifContainsGps(raw: ExifRecord | null | undefined): boolean {
  return Boolean(raw && Object.keys(raw).some((key) => /^GPS/i.test(key) || key === "latitude" || key === "longitude"));
}

/** Retain EXIF date strings so the browser's timezone cannot alter capture time. */
export async function readPhotographyExif(file: Blob | Uint8Array): Promise<{ metadata: Partial<PhotographyMetadata>; originalHasGps: boolean }> {
  let raw: ExifRecord | undefined;
  try {
    const exifr = await import("exifr");
    raw = await exifr.parse(file, { reviveValues: false, translateValues: false, tiff: true, gps: true, exif: true, ihdr: true });
  } catch { /* Missing or damaged EXIF must not prevent importing the photograph. */ }
  return { metadata: normalizeExif(raw), originalHasGps: exifContainsGps(raw) };
}

export function cameraSummary(metadata: Partial<PhotographyMetadata>): string {
  return [metadata.aperture ? `f/${metadata.aperture}` : null, metadata.shutter_speed, metadata.iso ? `ISO ${metadata.iso}` : null, metadata.focal_length ? `${metadata.focal_length} mm` : null].filter(Boolean).join(" · ");
}
