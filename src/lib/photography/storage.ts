import "server-only";
import { CopyObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getMediaConfig, type MediaConfig } from "../media/config";
import { createR2Operations, type R2Operations } from "../media/r2";
import { MediaError } from "../media/types";
import { stripWebpMetadata } from "./webp";

export const PHOTOGRAPHY_PUBLIC_CACHE = "public, max-age=0, s-maxage=0, must-revalidate";
export type PhotographyR2 = R2Operations & {
  previewUrl(key: string): Promise<string>;
  publishFrom(sourceBucket: string, sourceKey: string, key: string, itemId: string, mime: string, size: number): Promise<void>;
};
export type PhotographyStorage = { config: MediaConfig; privateBucket: string; privateR2: PhotographyR2; publicR2: PhotographyR2 };

export function photographyStorage(): PhotographyStorage {
  const settings = getMediaConfig();
  if (!settings.configured) throw new MediaError(`Media configuration required: ${settings.missing.join(", ")}.`, 503);
  const bucket = process.env.R2_PHOTOGRAPHY_ORIGINALS_BUCKET?.trim();
  if (bucket !== "joemore-com-photography-originals" || bucket === settings.config.bucket) {
    throw new MediaError("Configure the private joemore-com-photography-originals bucket and R2_PHOTOGRAPHY_ORIGINALS_BUCKET. See docs/photography-setup.md.", 503, "photography_configuration");
  }
  const config = { ...settings.config, signedUrlSeconds: 600 };
  return { config, privateBucket: bucket, privateR2: adapter({ ...config, bucket }, "private, no-store"), publicR2: adapter(config, PHOTOGRAPHY_PUBLIC_CACHE) };
}

function adapter(config: MediaConfig, cacheControl: string): PhotographyR2 {
  const client = new S3Client({ region: "auto", endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }, requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" });
  return {
    ...createR2Operations(config, { cacheControl }),
    async previewUrl(key) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucket, Key: key, ResponseCacheControl: "private, no-store" }), { expiresIn: 600 });
    },
    async publishFrom(sourceBucket, sourceKey, key, itemId, mime, size) {
      const input = { Bucket: config.bucket, Key: key, ContentType: mime, ContentDisposition: "inline", CacheControl: cacheControl, Metadata: { "asset-id": itemId } };
      if (mime === "image/webp") {
        if (size > 24 * 1024 ** 2) throw new MediaError("The display image is too large.");
        const result = await client.send(new GetObjectCommand({ Bucket: sourceBucket, Key: sourceKey }));
        if (!result.Body || result.ContentLength !== size) throw new MediaError("The private derivative changed. Retry the import.", 409);
        const bytes = stripWebpMetadata(await result.Body.transformToByteArray());
        await client.send(new PutObjectCommand({ ...input, Body: bytes, ContentLength: bytes.length, IfNoneMatch: "*" }));
      } else {
        // Versioned random destinations are generated only by the publication service.
        const occupied = await this.head(key);
        if (occupied) throw new MediaError("Publication destination is already occupied. Retry.", 409);
        await client.send(new CopyObjectCommand({ ...input, CopySource: `${sourceBucket}/${sourceKey.split("/").map(encodeURIComponent).join("/")}`, MetadataDirective: "REPLACE" }));
      }
    },
  };
}
