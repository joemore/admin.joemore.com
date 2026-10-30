import assert from "node:assert/strict";
import test from "node:test";
import { metadataDefaults, parsePhotographyQuery, validateAlbum, validateIds, validatePhotographyMetadata, validateTag } from "../src/lib/photography/validation";

test("metadata has safe missing-EXIF and publishing defaults", () => {
  assert.equal(metadataDefaults.date_taken, null);
  assert.equal(metadataDefaults.capture_local, null);
  assert.equal(metadataDefaults.location_visibility, "hidden");
  assert.equal(metadataDefaults.allow_original_download, false);
  assert.deepEqual(validatePhotographyMetadata({}), {});
});
test("camera and GPS edits accept bounded numbers and preserve missing values", () => {
  assert.deepEqual(validatePhotographyMetadata({ camera_model: "  EOS R5  ", aperture: 2.8, shutter_speed: "1/250s", iso: 100, focal_length: 35, latitude: -23.5, longitude: -46.6, altitude: null }), { camera_model: "EOS R5", aperture: 2.8, shutter_speed: "1/250s", iso: 100, focal_length: 35, latitude: -23.5, longitude: -46.6, altitude: null });
  for (const patch of [{ latitude: 91 }, { longitude: -181 }, { iso: 1.2 }, { aperture: 0 }, { focal_length: Infinity }, { latitude: null, longitude: 5 }, { width: -1 }, { orientation: 9 }]) assert.throws(() => validatePhotographyMetadata(patch));
});
test("unknown EXIF timezones remain wall-clock values, explicit instants require offset", () => {
  assert.deepEqual(validatePhotographyMetadata({ capture_local: "2025-04-01T12:34:56", date_taken: null }), { capture_local: "2025-04-01T12:34:56", date_taken: null });
  assert.equal(validatePhotographyMetadata({ date_taken: "2025-04-01T12:34:56+01:00" }).date_taken, "2025-04-01T12:34:56+01:00");
  assert.throws(() => validatePhotographyMetadata({ date_taken: "2025-04-01T12:34:56" }));
  assert.throws(() => validatePhotographyMetadata({ capture_local: "2025-04-01T12:34:56Z" }));
  assert.throws(() => validatePhotographyMetadata({ capture_timezone: "MadeUp/Zone" }));
  assert.throws(() => validatePhotographyMetadata({ capture_local: "2025-02-31T12:34:56" }));
  assert.throws(() => validatePhotographyMetadata({ capture_local: "2025-02-01T24:00:00" }));
});
test("metadata edit cannot change internal object keys or publication state", () => {
  for (const key of ["original_key", "upload_state", "uploaded_by", "storage_status", "status", "published_at"]) assert.throws(() => validatePhotographyMetadata({ [key]: "anything" }));
  assert.throws(() => validatePhotographyMetadata({ title: " " }));
  assert.throws(() => validatePhotographyMetadata({ allow_original_download: "true" }));
});
test("normalized tags collapse case, whitespace, punctuation and diacritic near-duplicates", () => {
  assert.equal(validateTag("  São   Paulo ").slug, validateTag("sao-paulo").slug);
  assert.equal(validateTag("LANDSCAPE").slug, "landscape");
  assert.throws(() => validateTag("---"));
  assert.throws(() => validateTag("x".repeat(81)));
});
test("album validation and ordering accept explicit distinct item IDs only", () => {
  assert.deepEqual(validateAlbum({ title: " Coast ", slug: "coast", description: "" }), { title: "Coast", slug: "coast", description: null });
  assert.throws(() => validateAlbum({ title: "Coast", slug: "../coast" }));
  const ids = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"];
  assert.deepEqual(validateIds(ids), ids);
  assert.throws(() => validateIds([ids[0], ids[0]]));
  assert.throws(() => validateIds(["invalid"]));
});
test("library filters enforce bounded pagination and known sort modes", () => {
  assert.equal(parsePhotographyQuery(new URL("https://admin.example/api/photography?sort=date_taken")).sort, "taken");
  assert.equal(parsePhotographyQuery(new URL("https://admin.example/api/photography?camera=Canon&year=2024")).camera, "Canon");
  for (const q of ["page=0", "pageSize=999", "sort=storage_key", "tag=invalid", "year=abc", "status=deleted"]) assert.throws(() => parsePhotographyQuery(new URL(`https://admin.example/api/photography?${q}`)));
});
