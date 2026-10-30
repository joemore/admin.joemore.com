import { randomUUID } from "node:crypto";
import type { MediaConfig } from "../media/config";
import { assertAssetId } from "../media/http-policy";
import { MediaError } from "../media/types";
import { contentDisposition, matchesFileSignature, validateUpload } from "../media/validation";
import type { ObjectUpload } from "../media/r2";
import type { PhotographyR2 } from "./storage";
import type { PhotographyImportRequest, PhotographyItem, PhotographyUploadRole, PhotographyUploadTicket } from "./types";
import { metadataDefaults, validatePhotographyMetadata } from "./validation";

export interface PhotographyStorageStore {
  get(id: string): Promise<PhotographyItem | null>;
  insert(item: PhotographyItem): Promise<void>;
  update(id: string, patch: Partial<PhotographyItem>, statuses?: PhotographyItem["storage_status"][], updatedAt?: string): Promise<PhotographyItem | null>;
  stale(before: string, limit: number): Promise<PhotographyItem[]>;
}
type Dependencies = { store: PhotographyStorageStore; config: MediaConfig; privateBucket: string; privateR2: PhotographyR2; publicR2: PhotographyR2; userId: string; now?: () => Date };
type FileEntry = ObjectUpload & { role: PhotographyUploadRole };
const roles: PhotographyUploadRole[] = ["original", "preview", "thumbnail", "poster"];

export function photographyFiles(row: PhotographyItem): FileEntry[] {
  const result: FileEntry[] = [
    { role: "original", key: row.original_key, mimeType: row.original_mime_type, size: row.original_size, assetId: row.id, disposition: contentDisposition(row.original_filename, "document") },
    { role: "preview", key: row.preview_key, mimeType: row.preview_mime_type, size: row.preview_size, assetId: row.id, disposition: "inline" },
    { role: "thumbnail", key: row.thumbnail_key, mimeType: "image/webp", size: row.thumbnail_size, assetId: row.id, disposition: "inline" },
  ];
  if (row.poster_key && row.poster_size) result.push({ role: "poster", key: row.poster_key, mimeType: "image/webp", size: row.poster_size, assetId: row.id, disposition: "inline" });
  for (const file of result) {
    const prefix = file.role === "original" ? `originals/${row.id}/` : `staging/${row.id}/`;
    if (!file.key.startsWith(prefix) || !/^[a-zA-Z0-9_./-]+$/.test(file.key) || file.key.includes("..")) throw new MediaError("Unsafe photography storage key.", 403);
  }
  return result;
}

export function createPhotographyService({ store, config, privateBucket, privateR2, publicR2, userId, now = () => new Date() }: Dependencies) {
  const verified = () => { if (!userId) throw new MediaError("A verified administrator is required.", 403); };
  const get = async (id: string) => { verified(); assertAssetId(id); const row = await store.get(id); if (!row) throw new MediaError("Photography item not found.", 404); return row; };
  const owner = (row: PhotographyItem) => { if (row.uploaded_by !== userId) throw new MediaError("Only the uploader can manage this import session.", 403); };
  const expired = (row: PhotographyItem) => Date.parse(row.upload_expires_at) <= now().getTime();
  const available = (row: PhotographyItem) => now().getTime() - Date.parse(row.updated_at) > 120000 || !!row.error_message;
  const update = async (row: PhotographyItem, patch: Partial<PhotographyItem>) => {
    const saved = await store.update(row.id, { ...patch, updated_at: now().toISOString() }, [row.storage_status], row.updated_at);
    if (!saved) throw new MediaError("This item changed in another operation. Reload and retry.", 409, "state_conflict");
    return saved;
  };
  const owns = (id: string, metadata: Record<string, string>) => { if (metadata["asset-id"] !== id) throw new MediaError("The object ownership marker does not match.", 409, "ownership_mismatch"); };
  const safeRemove = async (r2: PhotographyR2, row: PhotographyItem, key: string, publicObject = false) => {
    if (publicObject ? !new RegExp(`^u/photography/${row.id}/[A-Za-z0-9_-]+\\.(webp|mp4|webm)$`).test(key) : !photographyFiles(row).some((entry) => entry.key === key)) throw new MediaError("Unsafe photography cleanup key.", 403);
    const head = await r2.head(key); if (!head) return;
    owns(row.id, head.metadata); await r2.remove(key);
  };
  const recordError = async (row: PhotographyItem, error: unknown, storage_status = row.storage_status) => {
    const message = error instanceof MediaError ? error.message : "Storage operation interrupted. Retry to finish safely.";
    await update(row, { storage_status, error_message: message }).catch(() => undefined);
  };
  const abortParts = async (row: PhotographyItem) => {
    for (const file of photographyFiles(row)) if (row.upload_state[file.role]) await privateR2.abortMultipart(file.key, row.upload_state[file.role]);
  };
  const compensateSupersededPublication = async (row: PhotographyItem) => {
    const current = await store.get(row.id);
    if (!current) return;
    const retained = current.storage_status === "publishing" || current.status === "published";
    const currentKeys = retained ? [current.public_key, current.public_thumbnail_key, current.public_poster_key] : [];
    for (const key of [row.public_key, row.public_thumbnail_key, row.public_poster_key]) {
      if (key && !currentKeys.includes(key)) await safeRemove(publicR2, row, key, true);
    }
  };
  return {
    async initiate(input: unknown): Promise<PhotographyUploadTicket> {
      verified();
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new MediaError("Provide import metadata.");
      const raw = input as PhotographyImportRequest;
      const original = validateUpload(raw.original, config.maxFileSize);
      if (!["image", "video"].includes(original.mediaType)) throw new MediaError("Choose an allowed photograph or video.");
      const preview = validateUpload(raw.preview, original.mediaType === "image" ? 24 * 1024 ** 2 : config.maxFileSize);
      const thumbnail = validateUpload(raw.thumbnail, 1024 ** 2);
      const poster = raw.poster ? validateUpload(raw.poster, 10 * 1024 ** 2) : null;
      if (original.mediaType === "image" ? preview.mimeType !== "image/webp" : !["video/mp4", "video/webm"].includes(preview.mimeType)) throw new MediaError("Supply a WebP display image or a web-ready MP4/WebM video.");
      if (thumbnail.mimeType !== "image/webp" || (poster && poster.mimeType !== "image/webp") || (original.mediaType === "video" && !poster)) throw new MediaError("Supply WebP thumbnails and a poster for videos.");
      if (typeof raw.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(raw.fingerprint)) throw new MediaError("Invalid import fingerprint.");
      const metadata = validatePhotographyMetadata(raw.metadata || {});
      if (metadata.allow_original_download) throw new MediaError("Review the original after importing before enabling downloads.");
      const id = randomUUID(), date = now().toISOString();
      let row: PhotographyItem = {
        ...metadataDefaults, ...metadata, id, media_asset_id: null, media_type: original.mediaType === "image" ? "photo" : "video", original_filename: original.filename,
        original_key: `originals/${id}/original.${original.extension}`, original_mime_type: original.mimeType, original_size: original.sizeBytes, fingerprint: raw.fingerprint,
        original_has_gps: raw.originalHasGps === true || metadata.latitude != null || metadata.longitude != null, original_gps_reviewed: false,
        preview_key: `staging/${id}/preview.${preview.extension}`, preview_mime_type: preview.mimeType, preview_size: preview.sizeBytes,
        thumbnail_key: `staging/${id}/thumbnail.webp`, thumbnail_size: thumbnail.sizeBytes, poster_key: poster ? `staging/${id}/poster.webp` : null, poster_size: poster?.sizeBytes ?? null,
        public_key: null, public_thumbnail_key: null, public_poster_key: null, status: "draft", storage_status: "pending", upload_state: {},
        upload_expires_at: new Date(now().getTime() + config.sessionSeconds * 1000).toISOString(), error_message: null, published_at: null, uploaded_by: userId, created_at: date, updated_at: date,
      };
      await store.insert(row);
      const files: PhotographyUploadTicket["files"] = [];
      try {
        for (const file of photographyFiles(row)) {
          if (await privateR2.head(file.key)) throw new MediaError("Upload destination already exists.", 409);
          const multipart = file.size > config.multipartThreshold;
          if (multipart) {
            await privateR2.reserve(file);
            const uploadId = await privateR2.initiateMultipart(file);
            try { row = await update(row, { upload_state: { ...row.upload_state, [file.role]: uploadId } }); }
            catch (error) { await privateR2.abortMultipart(file.key, uploadId).catch(() => undefined); throw error; }
          }
          files.push({ role: file.role, mode: multipart ? "multipart" : "single", upload: multipart ? undefined : await privateR2.signPut(file), partSize: config.partSize, partCount: Math.ceil(file.size / config.partSize) });
        }
        return { id, files };
      } catch (error) { await abortParts(row).catch(() => undefined); await recordError(row, error, "failed"); throw error; }
    },
    async signParts(id: string, role: unknown, numbers: unknown) {
      const row = await get(id); owner(row);
      if (row.storage_status !== "pending" || expired(row)) throw new MediaError("This import session expired or is being completed.", 409);
      if (!roles.includes(role as PhotographyUploadRole) || !Array.isArray(numbers) || !numbers.length || numbers.length > 20 || new Set(numbers).size !== numbers.length) throw new MediaError("Invalid multipart request.");
      const file = photographyFiles(row).find((entry) => entry.role === role); const uploadId = row.upload_state[String(role)];
      if (!file || !uploadId) throw new MediaError("No multipart upload exists for this file.");
      const count = Math.ceil(file.size / config.partSize);
      return Promise.all(numbers.map(async (partNumber) => {
        if (!Number.isSafeInteger(partNumber) || partNumber < 1 || partNumber > count) throw new MediaError("Invalid multipart part number.");
        const size = Math.min(config.partSize, file.size - (partNumber - 1) * config.partSize);
        return { partNumber, upload: await privateR2.signPart(file.key, uploadId, partNumber, size) };
      }));
    },
    async complete(id: string) {
      let row = await get(id); owner(row);
      if (row.storage_status === "ready") return row;
      if (expired(row) || (row.storage_status !== "pending" && !(row.storage_status === "uploading" && available(row)))) throw new MediaError("Completion is in progress or the import expired. Retry after two minutes if interrupted.", 409);
      row = await update(row, { storage_status: "uploading", error_message: null });
      try {
        for (const file of photographyFiles(row)) {
          let head = await privateR2.head(file.key);
          const uploadId = row.upload_state[file.role];
          if (head && uploadId && head.metadata.reservation === "1") {
            owns(row.id, head.metadata);
            const parts = await privateR2.listParts(file.key, uploadId), count = Math.ceil(file.size / config.partSize);
            if (parts.length !== count || parts.some((part, i) => part.partNumber !== i + 1 || part.size !== Math.min(config.partSize, file.size - i * config.partSize))) throw new MediaError("Upload parts are missing or their sizes differ. Retry this import.", 409, "upload_incomplete");
            await privateR2.completeMultipart(file.key, uploadId, parts); head = await privateR2.head(file.key);
          }
          if (!head) throw new MediaError("An uploaded file is missing. Retry completion or import again.", 409, "upload_incomplete");
          owns(row.id, head.metadata);
          if (head.size !== file.size || head.mimeType !== file.mimeType || head.metadata.reservation === "1" || !matchesFileSignature(await privateR2.readSignature(file.key), file.mimeType)) throw new MediaError("The uploaded file does not match the approved size or media format.", 422, "verification_failed");
        }
        return await update(row, { storage_status: "ready", error_message: null, upload_state: {} });
      } catch (error) { await recordError(row, error, error instanceof MediaError && error.code === "verification_failed" ? "failed" : "pending"); throw error; }
    },
    async abort(id: string) {
      let row = await get(id); owner(row);
      if (row.storage_status === "failed") return row;
      if (row.storage_status !== "pending") throw new MediaError("Only a pending import can be cancelled.", 409);
      row = await update(row, { storage_status: "failed", error_message: "Import cancelled; abandoned files remain tracked until upload permissions expire." });
      await abortParts(row); return row;
    },
    async publish(id: string) {
      let row = await get(id);
      if (row.status === "published" && row.storage_status === "ready") return row;
      if (row.storage_status !== "ready" && !(row.storage_status === "publishing" && available(row))) throw new MediaError("Finish or recover the current storage operation first.", 409);
      const version = randomUUID(), prefix = `u/photography/${row.id}/${version}`;
      row = await update(row, { storage_status: "publishing", error_message: null, public_key: row.public_key || `${prefix}.${row.preview_key.split(".").pop()}`, public_thumbnail_key: row.public_thumbnail_key || `${prefix}-thumb.webp`, public_poster_key: row.poster_key ? row.public_poster_key || `${prefix}-poster.webp` : null });
      try {
        for (const file of photographyFiles(row).filter((file) => file.role !== "original")) {
          const destination = file.role === "preview" ? row.public_key! : file.role === "thumbnail" ? row.public_thumbnail_key! : row.public_poster_key!;
          if (!new RegExp(`^u/photography/${row.id}/[A-Za-z0-9_-]+\\.(webp|mp4|webm)$`).test(destination)) throw new MediaError("Unsafe publication destination.", 403);
          const existing = await publicR2.head(destination);
          if (existing) { owns(row.id, existing.metadata); if (existing.mimeType !== file.mimeType || existing.size <= 0 || (file.mimeType !== "image/webp" && existing.size !== file.size)) throw new MediaError("A publication object does not match this item.", 409); continue; }
          const source = await privateR2.head(file.key);
          if (!source || source.size !== file.size || source.mimeType !== file.mimeType) throw new MediaError("A private derivative is missing or changed.", 409);
          owns(row.id, source.metadata);
          await publicR2.publishFrom(privateBucket, file.key, destination, row.id, file.mimeType, file.size);
          // A slow provider copy may outlive a recovered/unpublish operation.
          // Recheck its lease after the copy and remove superseded owned output.
          const current = await store.get(row.id);
          if (!current || current.storage_status !== "publishing" || current.updated_at !== row.updated_at) throw new MediaError("Publication changed during storage copy. Reload to recover.", 409, "state_conflict");
        }
        return await update(row, { status: "published", storage_status: "ready", published_at: now().toISOString(), error_message: null });
      } catch (error) { await compensateSupersededPublication(row).catch(() => undefined); await recordError(row, error); throw error; }
    },
    async unpublish(id: string) {
      let row = await get(id);
      if (row.status === "draft" && row.storage_status === "ready" && !row.public_key) return row;
      if (!["ready", "publishing", "unpublishing"].includes(row.storage_status) || (row.storage_status !== "ready" && !available(row))) throw new MediaError("Publication is still in progress. Retry in two minutes if interrupted.", 409);
      row = await update(row, { status: "draft", storage_status: "unpublishing", published_at: null, error_message: null });
      try {
        for (const key of [row.public_key, row.public_thumbnail_key, row.public_poster_key]) if (key) await safeRemove(publicR2, row, key, true);
        return await update(row, { storage_status: "ready", public_key: null, public_thumbnail_key: null, public_poster_key: null, error_message: null });
      } catch (error) { await recordError(row, error); throw error; }
    },
    async download(id: string) {
      const row = await get(id);
      if (row.status !== "published" || row.storage_status !== "ready" || !row.allow_original_download || !row.original_gps_reviewed) throw new MediaError("Original downloads require a published item and individually reviewed permission.", 403);
      const original = photographyFiles(row)[0], head = await privateR2.head(original.key);
      if (!head || head.size !== original.size || head.mimeType !== original.mimeType) throw new MediaError("The private original is unavailable.", 409);
      owns(row.id, head.metadata); return privateR2.downloadUrl(original.key, row.original_filename);
    },
    async cleanup() {
      verified(); let cleaned = 0, failed = 0;
      const cutoff = new Date(now().getTime() - (config.signedUrlSeconds + 120) * 1000).toISOString();
      for (const candidate of await store.stale(cutoff, 30)) {
        if (!["pending", "uploading", "failed", "cleanup"].includes(candidate.storage_status) || candidate.status !== "draft" || candidate.public_key || candidate.upload_expires_at >= cutoff) continue;
        let row = candidate;
        try {
          row = await update(row, { storage_status: "cleanup", error_message: null });
          await abortParts(row);
          for (const file of photographyFiles(row)) await safeRemove(privateR2, row, file.key);
          await update(row, { storage_status: "failed", upload_state: {}, upload_expires_at: "9999-01-01T00:00:00Z", error_message: "Abandoned import cleaned. Ready originals are never deleted by cleanup." }); cleaned++;
        } catch (error) { failed++; await recordError(row, error, "cleanup"); }
      }
      return { cleaned, failed };
    },
  };
}
