import test from "node:test";
import assert from "node:assert/strict";
import { cameraSummary, captureTimestamp, exifContainsGps, finiteNumber, formatShutter, gpsCoordinate, normalizeExif, readPhotographyExif } from "../src/lib/photography/metadata";
import { photographyFileKind, photographyFingerprint, uploadFilename } from "../src/lib/photography/browser";

test("EXIF capture wall clock preserves absent timezone without creating an instant", () => {
  assert.deepEqual(captureTimestamp("2025:06:12 13:45:22"), { capture_local: "2025-06-12T13:45:22", capture_timezone: null, date_taken: null });
  assert.deepEqual(captureTimestamp(new Date("2025-06-12T13:45:22Z")), { capture_local: null, capture_timezone: null, date_taken: null });
});

test("EXIF explicit offset creates correct instant while retaining original wall clock", () => {
  assert.deepEqual(captureTimestamp("2025:06:12 13:45:22", "-03:00"), { capture_local: "2025-06-12T13:45:22", capture_timezone: "-03:00", date_taken: "2025-06-12T16:45:22.000Z" });
  assert.equal(captureTimestamp("2024-02-29T23:59:59.125+0530").date_taken, "2024-02-29T18:29:59.125Z");
  assert.equal(captureTimestamp("2024-02-29T23:59:59Z").capture_timezone, "+00:00");
});

test("invalid capture dates and unsupported offsets never invent metadata", () => {
  for (const input of ["2025:02:29 10:00:00", "2025:13:01 10:00:00", "2025:04:31 10:00:00", "2025:01:01 25:00:00", "not a date"]) assert.equal(captureTimestamp(input).capture_local, null);
  assert.equal(captureTimestamp("2025:01:01 10:00:00", "+15:00").date_taken, null);
  assert.equal(captureTimestamp("2025:01:01 10:00:00", "America/Sao_Paulo").date_taken, null);
});

test("missing EXIF leaves camera, location, and capture values empty", () => {
  const result = normalizeExif(undefined);
  assert.equal(result.camera_make, null);
  assert.equal(result.aperture, null);
  assert.equal(result.date_taken, null);
  assert.equal(result.latitude, null);
  assert.equal(result.longitude, null);
  assert.deepEqual(result.camera_settings, {});
  assert.equal(exifContainsGps(undefined), false);
});

test("exifr reads a real JPEG EXIF segment without reviving timezone-less date strings", async () => {
  const tiff = Buffer.alloc(83);
  tiff.write("II"); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x8769, 10); tiff.writeUInt16LE(4, 12); tiff.writeUInt32LE(1, 14); tiff.writeUInt32LE(26, 18);
  tiff.writeUInt16LE(2, 26);
  tiff.writeUInt16LE(0x9003, 28); tiff.writeUInt16LE(2, 30); tiff.writeUInt32LE(20, 32); tiff.writeUInt32LE(56, 36);
  tiff.writeUInt16LE(0x9011, 40); tiff.writeUInt16LE(2, 42); tiff.writeUInt32LE(7, 44); tiff.writeUInt32LE(76, 48);
  tiff.write("2025:06:12 13:45:22\0", 56, "ascii"); tiff.write("-03:00\0", 76, "ascii");
  const payload = Buffer.concat([Buffer.from("Exif\0\0"), tiff]);
  const segmentLength = Buffer.alloc(2); segmentLength.writeUInt16BE(payload.length + 2);
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), segmentLength, payload, Buffer.from([0xff, 0xd9])]);
  const result = await readPhotographyExif(jpeg);
  assert.equal(result.metadata.capture_local, "2025-06-12T13:45:22");
  assert.equal(result.metadata.capture_timezone, "-03:00");
  assert.equal(result.metadata.date_taken, "2025-06-12T16:45:22.000Z");
});

test("unsupported and empty image data returns editable empty metadata", async () => {
  const result = await readPhotographyExif(new Uint8Array());
  assert.equal(result.metadata.capture_local, null);
  assert.equal(result.metadata.camera_make, null);
  assert.equal(result.originalHasGps, false);
});

test("camera metadata normalises numbers and produces friendly exposure labels", () => {
  const result = normalizeExif({ Make: "  Sony\0 ", Model: "ILCE-7RM5", FNumber: "28/10", ExposureTime: "1/250", ISO: 100, FocalLength: 35, Orientation: 6, ExposureBiasValue: "-1/3", ExifImageWidth: 9504, ExifImageHeight: 6336 });
  assert.equal(result.camera_make, "Sony");
  assert.equal(result.aperture, 2.8);
  assert.equal(result.shutter_speed, "1/250s");
  assert.equal(result.iso, 100);
  assert.equal(result.orientation, 6);
  assert.equal(result.exposure_compensation, -1 / 3);
  assert.equal(result.width, 9504);
  assert.equal(cameraSummary(result), "f/2.8 · 1/250s · ISO 100 · 35 mm");
  assert.equal(formatShutter(2.5), "2.5s");
  assert.equal(formatShutter(0), null);
  assert.equal(finiteNumber("1/0"), null);
  assert.equal(finiteNumber(Infinity), null);
});

test("GPS DMS coordinates honour hemispheres and valid bounds", () => {
  assert.equal(gpsCoordinate([23, 30, 0], "S", true), -23.5);
  assert.equal(gpsCoordinate([46, 37, 30], "W", false), -46.625);
  assert.equal(gpsCoordinate(-46.625, undefined, false), -46.625);
  assert.equal(gpsCoordinate([90, 0, 1], "N", true), null);
  assert.equal(gpsCoordinate([1, 60, 0], "N", true), null);
  assert.equal(gpsCoordinate(180.1, "E", false), null);
  assert.equal(gpsCoordinate(30, "W", true), null);
});

test("partial and invalid coordinate pairs are not saved as a usable location", () => {
  assert.equal(normalizeExif({ latitude: 24 }).latitude, null);
  assert.equal(normalizeExif({ latitude: 99, longitude: 20 }).longitude, null);
  const result = normalizeExif({ GPSLatitude: [23, 30, 0], GPSLatitudeRef: "S", GPSLongitude: [46, 37, 30], GPSLongitudeRef: "W", GPSAltitude: 120, GPSAltitudeRef: 1 });
  assert.equal(result.latitude, -23.5);
  assert.equal(result.longitude, -46.625);
  assert.equal(result.altitude, -120);
  assert.equal(exifContainsGps({ GPSLatitude: "broken" }), true);
});

test("manually corrected values including removals survive reprocessing", () => {
  const result = normalizeExif({ Make: "Canon", FNumber: 2.8, DateTimeOriginal: "2025:01:01 10:00:00" }, { camera_make: "Sony", aperture: null, capture_local: "2025-01-02T11:00:00", latitude: null, longitude: null });
  assert.equal(result.camera_make, "Sony");
  assert.equal(result.aperture, null);
  assert.equal(result.capture_local, "2025-01-02T11:00:00");
  assert.equal(result.latitude, null);
});

test("media selection rejects unsafe and unsupported source formats", () => {
  assert.equal(photographyFileKind({ type: "image/jpeg", size: 1024 }), "photo");
  assert.equal(photographyFileKind({ type: "video/webm", size: 1024 }), "video");
  assert.throws(() => photographyFileKind({ type: "image/svg+xml", size: 1024 }), /Choose a JPEG/);
  assert.throws(() => photographyFileKind({ type: "image/heic", size: 1024 }), /Convert HEIC/);
  assert.throws(() => photographyFileKind({ type: "image/jpeg", size: 0 }), /non-empty/);
  assert.throws(() => photographyFileKind({ type: "video/mp4", size: 3 * 1024 ** 3 }), /2 GB/);
});

test("fingerprints detect identical small files independently of filename", async () => {
  const a = await photographyFingerprint(new File(["photo bytes"], "a.jpg"));
  const b = await photographyFingerprint(new File(["photo bytes"], "renamed.jpg"));
  const c = await photographyFingerprint(new File(["different"], "a.jpg"));
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("derivative filenames match output content rather than the original extension", () => {
  const original = new File(["x"], "sunrise.jpeg", { type: "image/jpeg" });
  assert.equal(uploadFilename(original, "original", original), "sunrise.jpeg");
  assert.equal(uploadFilename(original, "preview", new Blob(["x"], { type: "image/webp" })), "sunrise-preview.webp");
  const video = new File(["x"], "optimised.webm", { type: "video/webm" });
  assert.equal(uploadFilename(original, "preview", video), "optimised.webm");
});
