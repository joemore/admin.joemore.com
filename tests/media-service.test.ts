import assert from "node:assert/strict";
import test from "node:test";
import type { MediaConfig } from "../src/lib/media/config";
import { createMediaService, type MediaStore } from "../src/lib/media/service";
import type { ObjectUpload, R2Head, R2Operations, R2Part } from "../src/lib/media/r2";
import { MediaError, type MediaAsset, type MediaStatus } from "../src/lib/media/types";

const adminId = "4bcd1dc4-2c03-4c94-8dfd-f2f795c9f254";
const config: MediaConfig = { accountId: "a".repeat(32), accessKeyId: "key", secretAccessKey: "secret", bucket: "bucket", publicBaseUrl: "https://cdn.example", prefix: "u/", maxFileSize: 2 * 1024 ** 3, multipartThreshold: 64 * 1024 ** 2, partSize: 16 * 1024 ** 2, signedUrlSeconds: 600, sessionSeconds: 86400 };
const png = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
class MemoryStore implements MediaStore {
  rows = new Map<string, MediaAsset>();
  collisionCount = 0;
  failUploadId = false;
  async get(id: string) { return this.rows.has(id) ? { ...this.rows.get(id)! } : null; }
  async insert(row: MediaAsset) { if (this.collisionCount-- > 0) throw new MediaError("collision", 409, "collision"); this.rows.set(row.id, { ...row }); }
  async update(id: string, patch: Partial<MediaAsset>, expected?: MediaStatus[], expectedUpdatedAt?: string) {
    if (this.failUploadId && patch.upload_id) throw new Error("database unavailable");
    const row = this.rows.get(id);
    if (!row || (expected && !expected.includes(row.status)) || (expectedUpdatedAt && expectedUpdatedAt !== row.updated_at)) return null;
    const next = { ...row, ...patch }; this.rows.set(id, next); return { ...next };
  }
  async stale(before: string, limit: number) { return [...this.rows.values()].filter((row) => row.status !== "ready" && row.status !== "deleted" && row.upload_expires_at < before).slice(0, limit); }
}
class MemoryR2 implements R2Operations {
  objects = new Map<string, R2Head>();
  removed: string[] = [];
  aborted: string[] = [];
  parts: R2Part[] = [];
  completeCount = 0;
  failRemove: string | null = null;
  signature: Uint8Array = png;
  async head(key: string) { return this.objects.get(key) || null; }
  async reserve(input: ObjectUpload) {
    if (this.objects.has(input.key)) throw new Error("collision");
    this.objects.set(input.key, { size: 0, mimeType: input.mimeType, etag: "reserve", metadata: { "asset-id": input.assetId, reservation: "1" }, lastModified: null });
  }
  async signPut(input: ObjectUpload) { return { url: `https://r2.example/${input.key}?secret=bearer`, headers: { "Content-Type": input.mimeType } }; }
  async initiateMultipart() { return "r2-upload-id"; }
  async signPart(_key: string, _uploadId: string, partNumber: number, size: number) { return { url: `https://r2.example/part/${partNumber}?size=${size}`, headers: {} }; }
  async listParts() { return this.parts; }
  async completeMultipart(key: string) { this.completeCount++; const head = this.objects.get(key)!; this.objects.set(key, { ...head, size: this.parts.reduce((n, part) => n + part.size, 0), etag: "multipart-etag", metadata: { "asset-id": head.metadata["asset-id"] } }); }
  async abortMultipart(_key: string, uploadId: string) { this.aborted.push(uploadId); }
  async remove(key: string) { if (this.failRemove === key) throw new Error("storage unavailable"); this.removed.push(key); this.objects.delete(key); }
  async readSignature() { return this.signature; }
  async list(prefix = "") { return { objects: [], prefixes: [], nextCursor: null, prefix }; }
  async downloadUrl() { return "https://r2.example/download"; }
  upload(row: MediaAsset, thumbnail = false) {
    this.objects.set(thumbnail ? row.thumbnail_key! : row.storage_key, { size: thumbnail ? row.thumbnail_size_bytes! : row.size_bytes, mimeType: thumbnail ? "image/webp" : row.mime_type, etag: "object-etag", metadata: { "asset-id": row.id }, lastModified: null });
  }
}
function fixture(userId = adminId) {
  const store = new MemoryStore(), r2 = new MemoryR2();
  let date = new Date("2026-10-30T12:00:00.000Z");
  const service = createMediaService({ store, r2, config, userId, now: () => date });
  return { store, r2, service, advance(ms: number) { date = new Date(date.getTime() + ms); } };
}
const request = { filename: "My Photo.png", mimeType: "image/png", sizeBytes: png.length };

test("initiation reserves independent UUID/key and retries database collisions", async () => {
  const { service, store } = fixture(); store.collisionCount = 2;
  const ticket = await service.initiate(request);
  assert.equal(ticket.asset.status, "pending"); assert.equal(ticket.mode, "single"); assert.ok(ticket.upload);
  assert.match(ticket.asset.id, /^[0-9a-f-]{36}$/); assert.match(ticket.asset.storage_key, /^u\/[A-Za-z0-9_-]{12}-my-photo\.png$/);
  assert.equal(store.rows.size, 1); assert.equal(ticket.asset.uploaded_by, adminId);
});
test("missing verified identity cannot initiate privileged storage writes", async () => {
  const { service, store } = fixture("");
  await assert.rejects(service.initiate(request), /verified administrator/); assert.equal(store.rows.size, 0);
});
test("an existing R2 key collision is skipped before database insertion", async () => {
  const { service, r2 } = fixture(); const original = r2.head.bind(r2); let checks = 0;
  r2.head = async (key) => ++checks === 1 ? { size: 5, mimeType: "image/png", etag: "legacy", metadata: {}, lastModified: null } : original(key);
  await service.initiate(request); assert.equal(checks, 2); assert.deepEqual(r2.removed, []);
});
test("ready state requires successful R2 existence, metadata, size, and signature verification", async () => {
  const { service, r2, store } = fixture(); const { asset } = await service.initiate(request);
  await assert.rejects(service.complete(asset.id), /not yet available/); assert.equal((await store.get(asset.id))?.status, "pending");
  r2.upload(asset); const ready = await service.complete(asset.id); assert.equal(ready.status, "ready"); assert.equal(ready.etag, "object-etag");
  assert.equal((await service.complete(asset.id)).status, "ready");
});
test("content mismatch fails permanently without publishing ready metadata", async () => {
  const { service, r2, store } = fixture(); const { asset } = await service.initiate(request); r2.upload(asset); r2.signature = new TextEncoder().encode("<svg></svg>");
  await assert.rejects(service.complete(asset.id), /approved file format/); assert.equal((await store.get(asset.id))?.status, "failed");
});
test("another administrator cannot sign, finalize, or cancel an uploader's session", async () => {
  const { service, store, r2 } = fixture(); const { asset } = await service.initiate(request);
  const other = createMediaService({ store, r2, config, userId: "different-admin" });
  await assert.rejects(other.complete(asset.id), /Only the uploader/); await assert.rejects(other.abort(asset.id), /Only the uploader/); await assert.rejects(other.signPart(asset.id, 1), /Only the uploader/);
});
test("multipart completion uses server-fetched part sizes and order", async () => {
  const { service, r2, store } = fixture(); const sizeBytes = config.multipartThreshold + 1;
  const { asset, mode } = await service.initiate({ ...request, sizeBytes }); assert.equal(mode, "multipart"); assert.equal(asset.upload_id, "r2-upload-id");
  await assert.rejects(service.signPart(asset.id, 0), /part number/); await assert.rejects(service.signPart(asset.id, 6), /part number/);
  assert.match((await service.signPart(asset.id, 5)).url, /size=1$/);
  await assert.rejects(service.complete(asset.id), /parts are missing/); assert.equal((await store.get(asset.id))?.status, "pending");
  r2.parts = Array.from({ length: 5 }, (_, i) => ({ partNumber: i + 1, size: i === 4 ? 1 : config.partSize, etag: `part-${i}` }));
  assert.equal((await service.complete(asset.id)).status, "ready"); assert.equal(r2.completeCount, 1);
});
test("multipart rejects wrong lengths and does not commit any object", async () => {
  const { service, r2 } = fixture(); const { asset } = await service.initiate({ ...request, sizeBytes: config.multipartThreshold + 1 });
  r2.parts = Array.from({ length: 5 }, (_, i) => ({ partNumber: i + 1, size: 1, etag: `part-${i}` }));
  await assert.rejects(service.complete(asset.id), /sizes do not match/); assert.equal(r2.completeCount, 0);
});
test("multipart persistence failure immediately aborts the R2 session", async () => {
  const { service, r2, store } = fixture(); store.failUploadId = true;
  await assert.rejects(service.initiate({ ...request, sizeBytes: config.multipartThreshold + 1 }), /could not be started/);
  assert.deepEqual(r2.aborted, ["r2-upload-id"]); assert.equal([...store.rows.values()][0].status, "failed");
});
test("interrupted completion can reclaim an expired lease but not an active lease", async () => {
  const { service, r2, store, advance } = fixture(); const { asset } = await service.initiate(request); r2.upload(asset);
  await store.update(asset.id, { status: "completing" });
  await assert.rejects(service.complete(asset.id), /still in progress/); advance(120001);
  assert.equal((await service.complete(asset.id)).status, "ready");
});
test("safe deletion prevents bearer URL replay and keeps retryable partial failure state", async () => {
  const { service, r2, store, advance } = fixture(); const { asset } = await service.initiate(request); r2.upload(asset); await service.complete(asset.id);
  await assert.rejects(service.delete(asset.id), /Wait 10 minutes/); advance(600001); r2.failRemove = asset.storage_key;
  await assert.rejects(service.delete(asset.id), /remains tracked/); assert.equal((await store.get(asset.id))?.status, "delete_failed");
  r2.failRemove = null; assert.equal((await service.delete(asset.id)).status, "deleted"); assert.deepEqual(r2.removed, [asset.storage_key]);
});
test("deletion never touches an unowned object or a legacy key", async () => {
  const { service, r2, store, advance } = fixture(); const { asset } = await service.initiate(request); r2.upload(asset); await service.complete(asset.id); advance(600001);
  r2.objects.get(asset.storage_key)!.metadata = { "asset-id": "someone-else" };
  await assert.rejects(service.delete(asset.id), /ownership marker/); assert.deepEqual(r2.removed, []);
  await store.update(asset.id, { storage_key: "welcome.webp" }); await assert.rejects(service.delete(asset.id), /outside the managed/); assert.deepEqual(r2.removed, []);
});
test("abandonment cleanup waits for all permissions to expire and handles partial failures", async () => {
  const { service, r2, store, advance } = fixture(); const { asset } = await service.initiate(request); r2.upload(asset);
  await service.abort(asset.id); assert.deepEqual(r2.removed, []); assert.equal((await service.cleanup()).cleaned, 0);
  advance((86400 + 601) * 1000); r2.failRemove = asset.storage_key;
  assert.deepEqual(await service.cleanup(), { cleaned: 0, failed: 1 }); assert.equal((await store.get(asset.id))?.status, "delete_failed");
  r2.failRemove = null; advance(601000); assert.deepEqual(await service.cleanup(), { cleaned: 1, failed: 0 }); assert.equal((await store.get(asset.id))?.status, "deleted");
});
