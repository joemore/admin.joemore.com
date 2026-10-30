import assert from "node:assert/strict";
import test from "node:test";
import { getMediaConfig } from "../src/lib/media/config";
import { createStorageKey, createThumbnailKey, isManagedKey, randomPublicId, sanitizeSlug } from "../src/lib/media/keys";
import { contentDisposition, matchesFileSignature, validateMetadata, validateUpload } from "../src/lib/media/validation";

const env = { R2_ACCOUNT_ID: "a".repeat(32), R2_ACCESS_KEY_ID: "key", R2_SECRET_ACCESS_KEY: "secret", SUPABASE_SECRET_KEY: "database-secret" };
test("configuration is safe to inspect with absent secrets and validates namespace", () => {
  const missing = getMediaConfig({});
  assert.equal(missing.configured, false);
  assert.ok(missing.missing.includes("R2_ACCESS_KEY_ID"));
  assert.equal(getMediaConfig({ ...env, R2_UPLOAD_PREFIX: "../" }).configured, false);
  assert.equal(getMediaConfig({ ...env, R2_ACCOUNT_ID: "https://evil.example" }).configured, false);
  assert.equal(getMediaConfig({ ...env, R2_PUBLIC_BASE_URL: "http://cdn.example" }).configured, false);
  const valid = getMediaConfig(env);
  assert.equal(valid.configured, true);
  if (valid.configured) { assert.equal(valid.config.maxFileSize, 2 * 1024 ** 3); assert.equal(valid.config.prefix, "u/"); }
});
test("public identifiers have 72 random bits and twelve URL-safe characters", () => {
  const ids = Array.from({ length: 2000 }, randomPublicId);
  assert.ok(ids.every((id) => /^[A-Za-z0-9_-]{12}$/.test(id)));
  assert.equal(new Set(ids).size, ids.length);
});
test("slug normalization removes paths, controls, diacritics, and excessive length", () => {
  assert.equal(sanitizeSlug("  Héllø / WORLD <script>!  "), "hell-world-script");
  assert.equal(sanitizeSlug("../.."), "");
  assert.ok(sanitizeSlug("x".repeat(200)).length <= 48);
  assert.equal(createStorageKey("Blue Smiley.PNG", "png", "u/", "abcdefghijkl"), "u/abcdefghijkl-blue-smiley.png");
  assert.equal(createStorageKey("💙.jpg", "jpg", "u/", "abcdefghijkl"), "u/abcdefghijkl.jpg");
});
test("only exact managed object and thumbnail key structures pass deletion guards", () => {
  assert.ok(isManagedKey("u/abcdefghijkl-blue-smiley.png"));
  assert.ok(isManagedKey(createThumbnailKey(), true));
  for (const key of ["welcome.webp", "creations/file.png", "u/../welcome.webp", "u/x.png", "u/abcdefghijkl.webp/other", "u/abcdefghijkl--.png", "u/_thumbs/abcdefghijkl.webp"]) assert.equal(isManagedKey(key), false, key);
  assert.throws(() => createStorageKey("ok.jpg", "../jpg"));
  assert.throws(() => createStorageKey("ok.jpg", "jpg", "legacy/"));
});
test("format and size validation rejects active content, mismatches, and oversized files", () => {
  const valid = { filename: "photo.PNG", mimeType: "image/png", sizeBytes: 42 };
  assert.equal(validateUpload(valid, 100).extension, "png");
  for (const input of [ { ...valid, filename: "bad.svg", mimeType: "image/svg+xml" }, { ...valid, filename: "bad.html", mimeType: "text/html" }, { ...valid, filename: "bad.js", mimeType: "text/javascript" }, { ...valid, filename: "../photo.png" }, { ...valid, mimeType: "image/jpeg" }, { ...valid, sizeBytes: 101 }, { ...valid, sizeBytes: 0 }, { ...valid, sizeBytes: "42" }, { ...valid, width: -1 }, { ...valid, thumbnailSizeBytes: 1024 ** 2 + 1 } ]) assert.throws(() => validateUpload(input, 100));
  assert.equal(validateUpload({ filename: `${"a".repeat(200)}.png`, mimeType: "image/png", sizeBytes: 1 }, 100).displayName.length, 160);
});
test("metadata editing permits only bounded human-readable fields", () => {
  const patch = validateMetadata({ displayName: " New name ", description: "Description", altText: "Alt", storage_key: "legacy/object" });
  assert.deepEqual(patch, { display_name: "New name", description: "Description", alt_text: "Alt" });
  assert.throws(() => validateMetadata({ displayName: "  " }));
});
test("documents download as attachments and disposition cannot inject headers", () => {
  assert.ok(contentDisposition("Résumé.pdf", "document").startsWith("attachment;"));
  assert.ok(contentDisposition('x"\r\ny.png', "image").startsWith("inline;"));
  assert.ok(!contentDisposition('x"\r\ny.png', "image").includes("\r"));
});
test("bounded content signatures reject disguised active content", () => {
  assert.ok(matchesFileSignature(new Uint8Array([137,80,78,71,13,10,26,10]), "image/png"));
  assert.equal(matchesFileSignature(new TextEncoder().encode("<html>fake image</html>"), "image/png"), false);
  assert.ok(matchesFileSignature(new TextEncoder().encode("%PDF-1.7"), "application/pdf"));
});
