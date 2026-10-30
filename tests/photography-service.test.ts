import assert from "node:assert/strict";
import test from "node:test";
import { createPhotographyService, photographyFiles, type PhotographyStorageStore } from "../src/lib/photography/service";
import type { PhotographyItem, PhotographyImportRequest } from "../src/lib/photography/types";
import type { MediaConfig } from "../src/lib/media/config";
import type { ObjectUpload, R2Head, R2Part } from "../src/lib/media/r2";
import type { PhotographyR2 } from "../src/lib/photography/storage";
import { stripWebpMetadata } from "../src/lib/photography/webp";

const config: MediaConfig = { accountId: "a".repeat(32), accessKeyId: "test", secretAccessKey: "test", bucket: "public", publicBaseUrl: "https://cdn.example", prefix: "u/", maxFileSize: 10000, multipartThreshold: 100, partSize: 50, signedUrlSeconds: 600, sessionSeconds: 86400 };
class Store implements PhotographyStorageStore {
  rows = new Map<string, PhotographyItem>();
  async get(id: string) { const row = this.rows.get(id); return row ? structuredClone(row) : null; }
  async insert(row: PhotographyItem) { this.rows.set(row.id, structuredClone(row)); }
  async update(id: string, patch: Partial<PhotographyItem>, statuses?: PhotographyItem["storage_status"][], at?: string) {
    const row = this.rows.get(id); if (!row || (statuses && !statuses.includes(row.storage_status)) || (at && at !== row.updated_at)) return null;
    const next = { ...row, ...patch }; this.rows.set(id, structuredClone(next)); return structuredClone(next);
  }
  async stale(before: string, limit: number) { return [...this.rows.values()].filter((row) => row.upload_expires_at < before && row.updated_at < before).slice(0, limit); }
}
class R2 implements PhotographyR2 {
  objects = new Map<string, R2Head>(); removed: string[] = []; copied: string[] = []; aborted: string[] = []; parts: R2Part[] = []; failCopy = false; failRemove = false; invalidSignature = false;
  async head(key: string) { return this.objects.get(key) || null; }
  async reserve(file: ObjectUpload) { this.objects.set(file.key, { size: 0, mimeType: file.mimeType, metadata: { "asset-id": file.assetId, reservation: "1" }, etag: null, lastModified: null }); }
  async signPut(file: ObjectUpload) { return { url: `https://r2.example/${file.key}`, headers: { "Cache-Control": "private, no-store" } }; }
  async initiateMultipart() { return "multipart-session"; }
  async signPart(_key: string, _id: string, partNumber: number, size: number) { return { url: `https://r2.example/${partNumber}/${size}`, headers: {} }; }
  async listParts() { return this.parts; }
  async completeMultipart(key: string) { const old = this.objects.get(key)!; this.objects.set(key, { ...old, size: this.parts.reduce((n, p) => n + p.size, 0), metadata: { "asset-id": old.metadata["asset-id"] } }); }
  async abortMultipart(_key: string, id: string) { this.aborted.push(id); }
  async remove(key: string) { if (this.failRemove) throw new Error("R2 unavailable"); this.removed.push(key); this.objects.delete(key); }
  async readSignature(key: string) { if (this.invalidSignature) return new Uint8Array(); return this.objects.get(key)?.mimeType === "image/png" ? new Uint8Array([137,80,78,71,13,10,26,10]) : new TextEncoder().encode("RIFF0000WEBP"); }
  async list(prefix = "") { return { objects: [], prefixes: [], nextCursor: null, prefix }; }
  async downloadUrl() { return "https://r2.example/signed-original"; }
  async previewUrl() { return "https://r2.example/signed-preview"; }
  async publishFrom(_bucket: string, _source: string, key: string, id: string, mime: string, size: number) { if (this.failCopy) throw new Error("copy unavailable"); this.copied.push(key); this.objects.set(key, { size, mimeType: mime, metadata: { "asset-id": id }, etag: "test", lastModified: null }); }
}
const request: PhotographyImportRequest = { original: { filename: "photo.png", mimeType: "image/png", sizeBytes: 24 }, preview: { filename: "preview.webp", mimeType: "image/webp", sizeBytes: 20 }, thumbnail: { filename: "thumbnail.webp", mimeType: "image/webp", sizeBytes: 20 }, fingerprint: "a".repeat(64), originalHasGps: true, metadata: { title: "My photograph" } };
function fixture(userId = "admin") {
  const store = new Store(), privateR2 = new R2(), publicR2 = new R2(); let date = new Date("2026-10-30T12:00:00Z");
  const service = createPhotographyService({ store, privateR2, publicR2, config, privateBucket: "private", userId, now: () => date });
  const upload = (row: PhotographyItem) => { for (const file of photographyFiles(row)) privateR2.objects.set(file.key, { size: file.size, mimeType: file.mimeType, metadata: { "asset-id": row.id }, etag: "test", lastModified: null }); };
  return { service, store, privateR2, publicR2, upload, advance: (ms: number) => { date = new Date(date.getTime() + ms); } };
}
async function ready(f: ReturnType<typeof fixture>) { const ticket = await f.service.initiate(request); f.upload((await f.store.get(ticket.id))!); return f.service.complete(ticket.id); }

test("draft import signs only private files and completion verifies every derivative", async () => {
  const f = fixture(), ticket = await f.service.initiate(request);
  assert.equal(ticket.files.length, 3); assert.equal(f.publicR2.copied.length, 0);
  await assert.rejects(f.service.complete(ticket.id), /missing/);
  f.upload((await f.store.get(ticket.id))!); const row = await f.service.complete(ticket.id);
  assert.equal(row.status, "draft"); assert.equal(row.storage_status, "ready"); assert.equal(row.public_key, null);
  assert.equal((await f.service.complete(ticket.id)).storage_status, "ready");
});
test("missing identity, unsafe originals and unreviewed downloads are rejected at import", async () => {
  await assert.rejects(fixture("").service.initiate(request), /administrator/);
  await assert.rejects(fixture().service.initiate({ ...request, original: { filename: "x.svg", mimeType: "image/svg+xml", sizeBytes: 20 } }), /not allowed/);
  await assert.rejects(fixture().service.initiate({ ...request, metadata: { allow_original_download: true } }), /Review/);
});
test("owner isolation and exact MIME/signature verification protect completion", async () => {
  const f = fixture(), ticket = await f.service.initiate(request);
  const other = createPhotographyService({ ...f, config, privateBucket: "private", userId: "other" });
  await assert.rejects(other.complete(ticket.id), /Only the uploader/); await assert.rejects(other.abort(ticket.id), /Only the uploader/);
  f.upload((await f.store.get(ticket.id))!); f.privateR2.invalidSignature = true;
  await assert.rejects(f.service.complete(ticket.id), /approved/); assert.equal((await f.store.get(ticket.id))?.storage_status, "failed");
});
test("multipart signing and completion validate server-known part count and size", async () => {
  const f = fixture(), ticket = await f.service.initiate({ ...request, original: { ...request.original, sizeBytes: 101 } });
  assert.equal(ticket.files[0].mode, "multipart");
  await assert.rejects(f.service.signParts(ticket.id, "original", [0]), /part number/);
  await assert.rejects(f.service.signParts(ticket.id, "original", [1,1]), /Invalid multipart/);
  const parts = await f.service.signParts(ticket.id, "original", [3]); assert.match(parts[0].upload.url, /3\/1$/);
  f.privateR2.parts = [{ partNumber: 1, size: 50, etag: "1" }, { partNumber: 2, size: 1, etag: "2" }];
  await assert.rejects(f.service.complete(ticket.id), /parts are missing/);
});
test("publication tracks retryable partial operations and publishes only derivatives", async () => {
  const f = fixture(), row = await ready(f); f.publicR2.failCopy = true;
  await assert.rejects(f.service.publish(row.id), /unavailable/);
  const interrupted = (await f.store.get(row.id))!;
  assert.equal(interrupted.status, "draft"); assert.equal(interrupted.storage_status, "publishing"); assert.ok(interrupted.public_key);
  f.publicR2.failCopy = false; const published = await f.service.publish(row.id);
  assert.equal(published.status, "published"); assert.equal(f.publicR2.copied.length, 2);
  assert.ok(f.publicR2.copied.every((key) => key.startsWith(`u/photography/${row.id}/`) && !key.includes("original")));
});
test("unpublish hides metadata before deletion and retains originals through failures", async () => {
  const f = fixture(), row = await ready(f); await f.service.publish(row.id); f.publicR2.failRemove = true;
  await assert.rejects(f.service.unpublish(row.id), /unavailable/);
  assert.equal((await f.store.get(row.id))?.status, "draft"); assert.equal(f.privateR2.removed.length, 0);
  f.publicR2.failRemove = false; const hidden = await f.service.unpublish(row.id);
  assert.equal(hidden.public_key, null); assert.equal(hidden.storage_status, "ready"); assert.ok(f.privateR2.objects.has(row.original_key));
});
test("private original download requires published, reviewed, explicit permission", async () => {
  const f = fixture(), row = await ready(f);
  await assert.rejects(f.service.download(row.id), /individually reviewed/);
  await f.service.publish(row.id); await assert.rejects(f.service.download(row.id), /individually reviewed/);
  await f.store.update(row.id, { allow_original_download: true, original_gps_reviewed: true });
  assert.equal(await f.service.download(row.id), "https://r2.example/signed-original");
  await f.service.unpublish(row.id); await assert.rejects(f.service.download(row.id), /individually reviewed/);
});
test("cleanup waits until bearer permissions expire and never deletes ready originals", async () => {
  const f = fixture(), retained = await ready(f), ticket = await f.service.initiate({ ...request, fingerprint: "b".repeat(64) });
  f.upload((await f.store.get(ticket.id))!); await f.service.abort(ticket.id);
  assert.equal((await f.service.cleanup()).cleaned, 0); f.advance((86400 + 721) * 1000);
  assert.equal((await f.service.cleanup()).cleaned, 1); assert.ok(f.privateR2.objects.has(retained.original_key));
  assert.equal((await f.service.cleanup()).cleaned, 0);
});
test("object ownership markers prevent deleting unrelated objects", async () => {
  const f = fixture(), row = await ready(f); const published = await f.service.publish(row.id);
  f.publicR2.objects.get(published.public_key!)!.metadata = { "asset-id": "unrelated" };
  await assert.rejects(f.service.unpublish(row.id), /ownership marker/); assert.equal(f.publicR2.removed.length, 0);
});
test("a slow publication copy finishing after unpublish is compensated without touching originals", async () => {
  const f = fixture(), row = await ready(f), copy = f.publicR2.publishFrom.bind(f.publicR2);
  let interrupted = false;
  f.publicR2.publishFrom = async (...args: Parameters<PhotographyR2["publishFrom"]>) => {
    if (!interrupted) { interrupted = true; f.advance(120001); await f.service.unpublish(row.id); }
    await copy(...args);
  };
  await assert.rejects(f.service.publish(row.id), /changed during/);
  assert.equal((await f.store.get(row.id))?.status, "draft"); assert.equal(f.publicR2.objects.size, 0);
  assert.ok(f.privateR2.objects.has(row.original_key));
});
test("public WebP sanitizer removes EXIF/XMP and updates RIFF flags and sizes", () => {
  const chunk = (type: string, body: number[]) => { const bytes = new Uint8Array(8 + body.length + body.length % 2); bytes.set(new TextEncoder().encode(type)); new DataView(bytes.buffer).setUint32(4, body.length, true); bytes.set(body, 8); return bytes; };
  const chunks = [chunk("VP8X", [12,0,0,0,0,0,0,0,0,0]), chunk("EXIF", [1,2]), chunk("XMP ", [3,4]), chunk("VP8 ", [5,6])];
  const input = new Uint8Array(12 + chunks.reduce((n,c) => n+c.length,0)); input.set(new TextEncoder().encode("RIFF0000WEBP")); new DataView(input.buffer).setUint32(4,input.length-8,true); let offset=12; for(const c of chunks){input.set(c,offset);offset+=c.length;}
  const output = stripWebpMetadata(input), text = new TextDecoder().decode(output);
  assert.ok(!text.includes("EXIF") && !text.includes("XMP ")); assert.equal(output[20], 0); assert.equal(new DataView(output.buffer).getUint32(4,true),output.length-8);
  assert.throws(()=>stripWebpMetadata(input.slice(0,20)),/Incomplete/);
});
