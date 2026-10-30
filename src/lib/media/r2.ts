import "server-only";

import {
  AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand,
  DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command,
  ListPartsCommand, PutObjectCommand, S3Client, UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { MediaConfig } from "./config";
import { publicUrl } from "./keys";
import type { ExistingR2Page, SignedUpload } from "./types";
import { MediaError } from "./types";
import { contentDisposition } from "./validation";

export type R2Head = { size: number; mimeType: string; etag: string | null; metadata: Record<string, string>; lastModified: string | null };
export type R2Part = { partNumber: number; size: number; etag: string };
export type ObjectUpload = { key: string; assetId: string; mimeType: string; disposition: string; size: number };
export interface R2Operations {
  head(key: string): Promise<R2Head | null>;
  reserve(input: ObjectUpload): Promise<void>;
  signPut(input: ObjectUpload): Promise<SignedUpload>;
  initiateMultipart(input: ObjectUpload): Promise<string>;
  signPart(key: string, uploadId: string, partNumber: number, size: number): Promise<SignedUpload>;
  listParts(key: string, uploadId: string): Promise<R2Part[]>;
  completeMultipart(key: string, uploadId: string, parts: R2Part[]): Promise<void>;
  abortMultipart(key: string, uploadId: string): Promise<void>;
  remove(key: string): Promise<void>;
  readSignature(key: string): Promise<Uint8Array>;
  list(prefix?: string, cursor?: string): Promise<ExistingR2Page>;
  downloadUrl(key: string, filename: string): Promise<string>;
}
export function isR2Collision(error: unknown): boolean { return statusCode(error) === 412 || statusCode(error) === 409; }
function statusCode(error: unknown): number | undefined { return (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode; }
export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

export function createR2Operations(config: MediaConfig, options: { cacheControl?: string } = {}): R2Operations {
  const client = new S3Client({
    region: "auto", endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
  });
  const object = (key: string) => ({ Bucket: config.bucket, Key: key });
  const cacheControl = options.cacheControl ?? IMMUTABLE_CACHE_CONTROL;
  const upload = (input: ObjectUpload) => ({ ...object(input.key), ContentType: input.mimeType, ContentDisposition: input.disposition, CacheControl: cacheControl, Metadata: { "asset-id": input.assetId } });
  return {
    async head(key) {
      try {
        const data = await client.send(new HeadObjectCommand(object(key)));
        return { size: data.ContentLength ?? -1, mimeType: data.ContentType || "", etag: data.ETag || null, metadata: data.Metadata || {}, lastModified: data.LastModified?.toISOString() || null };
      } catch (error) { if (statusCode(error) === 404) return null; throw error; }
    },
    async reserve(input) {
      await client.send(new PutObjectCommand({ ...upload(input), Body: new Uint8Array(), IfNoneMatch: "*", CacheControl: "no-store", Metadata: { "asset-id": input.assetId, reservation: "1" } }));
    },
    async signPut(input) {
      const headers = { "Content-Type": input.mimeType, "Content-Disposition": input.disposition, "Cache-Control": cacheControl, "If-None-Match": "*", "x-amz-meta-asset-id": input.assetId };
      const names = new Set([...Object.keys(headers).map((key) => key.toLowerCase()), "content-length"]);
      const url = await getSignedUrl(client, new PutObjectCommand({ ...upload(input), IfNoneMatch: "*", ContentLength: input.size }), { expiresIn: config.signedUrlSeconds, unhoistableHeaders: names, signableHeaders: names });
      return { url, headers };
    },
    async initiateMultipart(input) {
      const result = await client.send(new CreateMultipartUploadCommand(upload(input)));
      if (!result.UploadId) throw new MediaError("R2 did not start the multipart upload.", 502);
      return result.UploadId;
    },
    async signPart(key, uploadId, partNumber, size) {
      const url = await getSignedUrl(client, new UploadPartCommand({ ...object(key), UploadId: uploadId, PartNumber: partNumber, ContentLength: size }), { expiresIn: config.signedUrlSeconds, signableHeaders: new Set(["content-length"]) });
      return { url, headers: {} };
    },
    async listParts(key, uploadId) {
      const parts: R2Part[] = [];
      let marker: string | undefined;
      do {
        const result = await client.send(new ListPartsCommand({ ...object(key), UploadId: uploadId, PartNumberMarker: marker, MaxParts: 1000 }));
        for (const part of result.Parts || []) {
          if (!part.PartNumber || part.Size === undefined || !part.ETag) throw new MediaError("R2 returned an incomplete part description.", 502);
          parts.push({ partNumber: part.PartNumber, size: part.Size, etag: part.ETag });
        }
        marker = result.IsTruncated ? result.NextPartNumberMarker : undefined;
        if (result.IsTruncated && !marker) throw new MediaError("R2 could not paginate the multipart upload.", 502);
      } while (marker);
      return parts;
    },
    async completeMultipart(key, uploadId, parts) {
      await client.send(new CompleteMultipartUploadCommand({ ...object(key), UploadId: uploadId, MultipartUpload: { Parts: parts.map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })) } }));
    },
    async abortMultipart(key, uploadId) {
      try { await client.send(new AbortMultipartUploadCommand({ ...object(key), UploadId: uploadId })); }
      catch (error) { if (statusCode(error) !== 404) throw error; }
    },
    async remove(key) { await client.send(new DeleteObjectCommand(object(key))); },
    async readSignature(key) {
      const result = await client.send(new GetObjectCommand({ ...object(key), Range: "bytes=0-511" }));
      if (!result.Body) throw new MediaError("R2 could not verify the uploaded content.", 502);
      return result.Body.transformToByteArray();
    },
    async list(prefix = "", cursor) {
      if (prefix.length > 1024 || /[\u0000-\u001f\u007f\\]/.test(prefix) || prefix.split("/").some((part) => part === "." || part === "..")) throw new MediaError("Invalid folder prefix.");
      if (cursor && cursor.length > 4096) throw new MediaError("Invalid listing cursor.");
      const result = await client.send(new ListObjectsV2Command({ Bucket: config.bucket, Prefix: prefix, Delimiter: "/", MaxKeys: 50, ContinuationToken: cursor || undefined }));
      return { prefix, prefixes: (result.CommonPrefixes || []).flatMap((entry) => entry.Prefix ? [entry.Prefix] : []), objects: (result.Contents || []).flatMap((entry) => entry.Key ? [{ key: entry.Key, size: entry.Size || 0, lastModified: entry.LastModified?.toISOString() || null, etag: entry.ETag || null, publicUrl: publicUrl(config.publicBaseUrl, entry.Key) }] : []), nextCursor: result.IsTruncated ? result.NextContinuationToken || null : null };
    },
    async downloadUrl(key, filename) {
      return getSignedUrl(client, new GetObjectCommand({ ...object(key), ResponseContentDisposition: contentDisposition(filename, "document") }), { expiresIn: 300 });
    },
  };
}
