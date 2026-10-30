import { randomUUID } from "node:crypto";
import type { MediaConfig } from "./config";
import { assertManagedKey, createStorageKey, createThumbnailKey, publicUrl } from "./keys";
import type { ObjectUpload, R2Head, R2Operations } from "./r2";
import { MediaError, type MediaAsset, type MediaStatus, type UploadTicket } from "./types";
import { contentDisposition, matchesFileSignature, validateUpload } from "./validation";

export interface MediaStore {
  get(id: string): Promise<MediaAsset | null>;
  /** Throw MediaError with code collision on unique-key conflict. */
  insert(asset: MediaAsset): Promise<void>;
  update(id: string, patch: Partial<MediaAsset>, expectedStatuses?: MediaStatus[], expectedUpdatedAt?: string): Promise<MediaAsset | null>;
  /** Includes only pending/completing/failed/deleting/delete_failed rows older than before. */
  stale(before: string, limit: number): Promise<MediaAsset[]>;
}
export type MediaServiceDependencies = { store: MediaStore; r2: R2Operations; config: MediaConfig; userId: string; now?: () => Date };

export function createMediaService({ store, r2, config, userId, now = () => new Date() }: MediaServiceDependencies) {
  const get = async (id: string) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new MediaError("Invalid asset identifier.");
    const row = await store.get(id);
    if (!row) throw new MediaError("The media asset was not found.", 404);
    assertManagedKey(row.storage_key);
    if (row.thumbnail_key) assertManagedKey(row.thumbnail_key, true);
    return row;
  };
  const requireOwner = (row: MediaAsset) => { if (row.uploaded_by !== userId) throw new MediaError("Only the uploader may continue this upload.", 403); };
  const expired = (row: MediaAsset) => new Date(row.upload_expires_at).getTime() <= now().getTime();
  const objectInput = (row: MediaAsset, thumbnail = false): ObjectUpload => ({ key: thumbnail ? row.thumbnail_key! : row.storage_key, assetId: row.id, mimeType: thumbnail ? "image/webp" : row.mime_type, size: thumbnail ? row.thumbnail_size_bytes! : row.size_bytes, disposition: contentDisposition(thumbnail ? "thumbnail.webp" : row.original_filename, thumbnail ? "image" : row.media_type) });
  const ownsObject = (head: R2Head, row: MediaAsset) => {
    if (head.metadata["asset-id"] !== row.id) throw new MediaError("The R2 object ownership marker does not match this asset. No object was modified.", 409, "ownership_mismatch");
  };
  const verify = async (row: MediaAsset, thumbnail = false): Promise<R2Head> => {
    const input = objectInput(row, thumbnail);
    const head = await r2.head(input.key);
    if (!head) throw new MediaError("The uploaded object is not yet available. Retry completion.", 409, "upload_incomplete");
    ownsObject(head, row);
    if (head.size !== input.size || head.mimeType !== input.mimeType || head.metadata.reservation === "1") throw new MediaError("The uploaded file size or content type does not match the approved upload.", 422, "verification_failed");
    if (!matchesFileSignature(await r2.readSignature(input.key), input.mimeType)) throw new MediaError("The uploaded content does not match its approved file format.", 422, "verification_failed");
    return head;
  };
  const safeRemove = async (row: MediaAsset, key: string) => {
    assertManagedKey(key, key === row.thumbnail_key);
    const head = await r2.head(key);
    if (!head) return;
    ownsObject(head, row);
    await r2.remove(key);
  };
  const claim = async (row: MediaAsset, status: MediaStatus, allowed: MediaStatus[]) => {
    const next = await store.update(row.id, { status, updated_at: now().toISOString(), error_message: null }, allowed, row.updated_at);
    if (!next) throw new MediaError("Another operation is already handling this asset. Refresh and retry.", 409, "state_conflict");
    return next;
  };
  const markError = async (row: MediaAsset, status: MediaStatus, error: unknown, expected: MediaStatus[]) => {
    const message = error instanceof MediaError ? error.message : "The storage service could not finish the operation. Retry when it is available.";
    await store.update(row.id, { status, error_message: message, updated_at: now().toISOString() }, expected, row.updated_at);
  };

  return {
    async initiate(input: unknown): Promise<UploadTicket> {
      if (!userId) throw new MediaError("A verified administrator is required.", 403);
      const file = validateUpload(input, config.maxFileSize);
      const multipart = file.sizeBytes > config.multipartThreshold;
      let row: MediaAsset | null = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const date = now();
        const candidate: MediaAsset = {
          id: randomUUID(), storage_key: createStorageKey(file.filename, file.extension), original_filename: file.filename,
          display_name: file.displayName, description: file.description, alt_text: null, mime_type: file.mimeType,
          media_type: file.mediaType, size_bytes: file.sizeBytes, width: file.width, height: file.height, duration_ms: file.durationMs,
          thumbnail_key: file.thumbnailSizeBytes ? createThumbnailKey() : null, thumbnail_size_bytes: file.thumbnailSizeBytes,
          etag: null, status: "pending", uploaded_by: userId, upload_id: null,
          upload_expires_at: new Date(date.getTime() + config.sessionSeconds * 1000).toISOString(), error_message: null,
          created_at: date.toISOString(), updated_at: date.toISOString(),
        };
        if (await r2.head(candidate.storage_key) || (candidate.thumbnail_key && await r2.head(candidate.thumbnail_key))) continue;
        try { await store.insert(candidate); row = candidate; break; }
        catch (error) { if (!(error instanceof MediaError) || error.code !== "collision") throw error; }
      }
      if (!row) throw new MediaError("A unique upload destination could not be allocated. Please retry.", 503);
      try {
        let upload: UploadTicket["upload"];
        if (multipart) {
          // The conditional empty reservation prevents multipart completion replacing any pre-existing object.
          await r2.reserve(objectInput(row));
          const uploadId = await r2.initiateMultipart(objectInput(row));
          let updated: MediaAsset | null;
          try { updated = await store.update(row.id, { upload_id: uploadId }, ["pending"], row.updated_at); }
          catch (error) { await r2.abortMultipart(row.storage_key, uploadId).catch(() => undefined); throw error; }
          if (!updated) { await r2.abortMultipart(row.storage_key, uploadId); throw new MediaError("The upload session changed while starting.", 409); }
          row = updated;
        } else upload = await r2.signPut(objectInput(row));
        const thumbnail = row.thumbnail_key ? await r2.signPut(objectInput(row, true)) : undefined;
        return { asset: row, mode: multipart ? "multipart" : "single", upload, thumbnail, partSize: config.partSize, partCount: Math.ceil(row.size_bytes / config.partSize), publicUrl: publicUrl(config.publicBaseUrl, row.storage_key) };
      } catch (error) {
        await markError(row, "failed", error, ["pending"]);
        if (error instanceof MediaError) throw error;
        throw new MediaError("The upload could not be started. Check the R2 configuration and try again.", 502);
      }
    },
    async signPart(id: string, partNumber: number) {
      const row = await get(id); requireOwner(row);
      if (row.status !== "pending" || !row.upload_id || expired(row)) throw new MediaError("This multipart upload is no longer active. Start a new upload.", 409);
      const count = Math.ceil(row.size_bytes / config.partSize);
      if (!Number.isSafeInteger(partNumber) || partNumber < 1 || partNumber > count) throw new MediaError("Invalid multipart part number.");
      const size = partNumber === count ? row.size_bytes - config.partSize * (partNumber - 1) : config.partSize;
      return r2.signPart(row.storage_key, row.upload_id, partNumber, size);
    },
    async complete(id: string): Promise<MediaAsset> {
      let row = await get(id); requireOwner(row);
      if (row.status === "ready") return row;
      const staleCompletion = row.status === "completing" && new Date(row.updated_at).getTime() + 120000 <= now().getTime();
      if ((row.status !== "pending" && !staleCompletion) || expired(row)) throw new MediaError("This upload is no longer active or completion is still in progress. Retry after two minutes if completion was interrupted.", 409);
      row = await claim(row, "completing", [row.status]);
      try {
        if (row.upload_id) {
          const head = await r2.head(row.storage_key);
          if (!head) throw new MediaError("The multipart reservation is missing.", 409, "verification_failed");
          ownsObject(head, row);
          // A previous completion may have succeeded while its response was lost.
          if (head.metadata.reservation === "1") {
            const parts = await r2.listParts(row.storage_key, row.upload_id);
            const expectedCount = Math.ceil(row.size_bytes / config.partSize);
            if (parts.length !== expectedCount) throw new MediaError("Some upload parts are missing. Retry the incomplete parts.", 409, "upload_incomplete");
            for (let i = 0; i < parts.length; i++) {
              const expectedSize = i === parts.length - 1 ? row.size_bytes - config.partSize * i : config.partSize;
              if (parts[i].partNumber !== i + 1 || parts[i].size !== expectedSize) throw new MediaError("Multipart part sizes do not match the approved file.", 422, "verification_failed");
            }
            await r2.completeMultipart(row.storage_key, row.upload_id, parts);
          }
        }
        const head = await verify(row);
        if (row.thumbnail_key) await verify(row, true);
        const ready = await store.update(row.id, { status: "ready", etag: head.etag, error_message: null, updated_at: now().toISOString() }, ["completing"], row.updated_at);
        if (!ready) throw new MediaError("The upload state changed during completion.", 409, "state_conflict");
        return ready;
      } catch (error) {
        const terminal = error instanceof MediaError && ["verification_failed", "ownership_mismatch"].includes(error.code);
        await markError(row, terminal ? "failed" : "pending", error, ["completing"]);
        if (error instanceof MediaError) throw error;
        throw new MediaError("R2 could not verify the upload. Retry completion; already uploaded bytes are retained.", 502);
      }
    },
    async abort(id: string): Promise<MediaAsset> {
      const row = await get(id); requireOwner(row);
      if (row.status === "failed") return row;
      if (row.status !== "pending") throw new MediaError("Only a pending upload can be cancelled.", 409);
      const failed = await claim(row, "failed", ["pending"]);
      if (row.upload_id) {
        try { await r2.abortMultipart(row.storage_key, row.upload_id); }
        catch (error) { await markError(failed, "failed", error, ["failed"]); throw new MediaError("Upload cancelled. R2 abort needs a later cleanup retry.", 502); }
      }
      // Retain tracked objects until all signed URL/session permissions have expired.
      return failed;
    },
    async delete(id: string): Promise<MediaAsset> {
      let row = await get(id);
      if (row.status === "deleted") return row;
      if (!["ready", "failed", "delete_failed"].includes(row.status)) throw new MediaError("Wait for the upload to finish or cancel it before deleting.", 409);
      if (!row.etag && new Date(row.upload_expires_at).getTime() + config.signedUrlSeconds * 1000 > now().getTime()) throw new MediaError("Cancelled upload objects can be removed after the upload permissions expire. Cleanup will handle them safely.", 409);
      // Single PUTs use If-None-Match, so removing an object before their URL expiry would allow replay.
      if (row.status === "ready" && new Date(row.updated_at).getTime() + config.signedUrlSeconds * 1000 > now().getTime()) throw new MediaError("This file was recently uploaded or updated. Wait 10 minutes before deleting so its upload permission can expire.", 409);
      row = await claim(row, "deleting", ["ready", "failed", "delete_failed"]);
      try {
        if (row.upload_id) await r2.abortMultipart(row.storage_key, row.upload_id);
        if (row.thumbnail_key) await safeRemove(row, row.thumbnail_key);
        await safeRemove(row, row.storage_key);
        const deleted = await store.update(row.id, { status: "deleted", error_message: null, updated_at: now().toISOString() }, ["deleting"], row.updated_at);
        if (!deleted) throw new MediaError("Deletion finished in R2 but metadata needs a retry.", 409);
        return deleted;
      } catch (error) {
        await markError(row, "delete_failed", error, ["deleting"]);
        if (error instanceof MediaError) throw error;
        throw new MediaError("Some objects could not be deleted. The asset remains tracked; retry deletion.", 502);
      }
    },
    async cleanup(limit = 25): Promise<{ cleaned: number; failed: number }> {
      const before = new Date(now().getTime() - config.signedUrlSeconds * 1000).toISOString();
      const rows = await store.stale(before, Math.min(Math.max(Math.floor(limit), 1), 50));
      let cleaned = 0, failed = 0;
      for (const stale of rows) {
        let claimed: MediaAsset | undefined;
        try {
          let row = await get(stale.id);
          if (new Date(row.upload_expires_at).getTime() >= new Date(before).getTime() || new Date(row.updated_at).getTime() >= new Date(before).getTime()) continue;
          if (!["pending", "completing", "failed", "deleting", "delete_failed"].includes(row.status)) continue;
          row = await claim(row, "deleting", [row.status]);
          claimed = row;
          if (row.upload_id) await r2.abortMultipart(row.storage_key, row.upload_id);
          if (row.thumbnail_key) await safeRemove(row, row.thumbnail_key);
          await safeRemove(row, row.storage_key);
          const deleted = await store.update(row.id, { status: "deleted", error_message: null, updated_at: now().toISOString() }, ["deleting"], row.updated_at);
          if (!deleted) throw new MediaError("Cleanup metadata update failed.", 409);
          cleaned++;
        } catch (error) {
          failed++;
          // Keep a durable retryable row for partial failures, never silently discard it.
          await markError(claimed || stale, "delete_failed", error, ["deleting"]).catch(() => undefined);
        }
      }
      return { cleaned, failed };
    },
  };
}
