# Photography Manager · v0.0.3

Implementation is local only. No live SQL, bucket creation, Cloudflare changes, deployment or Git push is performed. The public website is unchanged.

## Install

1. Run `npm ci` using Node 22 or later. `exifr` is the only new dependency.
2. Review and manually install `supabase/schemas/004_photography.sql` after existing schemas 001–003, once, using the trusted SQL Editor. The transaction creates five photography tables and three service-only RPCs. Do not rerun the foundation schemas. Keep `private` outside the Data API's exposed schemas. No anonymous photography grants or public views are installed.
3. Manually create the **private** R2 bucket `joemore-com-photography-originals` in the same account as `joemore-com-cdn`. Disable r2.dev public access and do not attach a custom domain. It holds `originals/<item UUID>/` and `staging/<item UUID>/`.
4. Set `R2_PHOTOGRAPHY_ORIGINALS_BUCKET=joemore-com-photography-originals` on the admin server. Existing `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_BASE_URL`, `SUPABASE_SECRET_KEY`, and public Supabase settings remain in use. Use a server-only Object Read & Write key restricted to these **two** buckets; server-side derivative copies need access to both. Never use a `NEXT_PUBLIC_` prefix for credentials. See `.env.example` and the existing Media Library setup guide.
5. Apply the private bucket CORS rule below manually, replacing/adding only the actual admin origins you use. No CDN upload CORS change is required for photography; browsers upload exclusively to private staging/originals. Preserve existing public-bucket rules.
6. Restart the local admin app and open `/photography`. Cloudflare Access continues to protect the deployed admin origin; every API separately verifies the Supabase user and current active membership.

```json
[
  {
    "AllowedOrigins": ["https://admin.joemore.com", "http://localhost:3000"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type", "content-disposition", "cache-control", "if-none-match", "x-amz-meta-asset-id", "range"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
    "MaxAgeSeconds": 600
  }
]
```

Browser-set signed headers must be allowed by CORS. Browsers compute Content-Length from the Blob; application code must not set that forbidden header. Signed upload links last ten minutes, and multipart part links are issued just before each part. Import sessions last 24 hours. Private preview links last ten minutes; reload the library/editor to refresh an expired preview.

## First import and publication

Open Photography → Import, drop photographs or videos, then choose **Import items**. Each item shows its own progress and retry action. Image originals upload without recompression; browser-generated, orientation-corrected WebP display images (maximum longest edge 2560, no upscaling) and 480px thumbnails upload privately. Publication independently removes EXIF/XMP from every WebP derivative. Thumbnails, never originals, power the grid.

For a video, supply a separate web-ready MP4/WebM, or explicitly confirm the original is already optimized and its embedded location metadata reviewed. Browser decoding generates a poster and thumbnail. There is no FFmpeg or automatic video transcoding. Supplied video bytes may contain metadata: review/sanitize them before publishing.

Choose **Edit imported items** to work through a batch using the filmstrip or Left/Right keys. Fields in focus retain normal arrow-key behavior. Edits remain attached to each item while navigating; save each changed item. Closing warns about unsaved edits. Metadata with no EXIF stays blank and can be entered manually. `capture_local` stores the original wall-clock time without a timezone. `date_taken` is an instant only when an explicit offset is known; entering a timezone label does not silently convert it.

Use inline tag search/create, removable chips, and tag rename management. An album is a collection, not a storage folder. Library multiselect can add tags/albums or apply the offered metadata fields. Album ordering supports drag/drop and keyboard buttons; saving order changes database positions only. Deleting an album leaves photographs and R2 objects intact.

Save metadata, then use Publishing → **Publish to CDN**. Only completed, verified derivatives are copied under versioned `u/photography/<item UUID>/` keys in `joemore-com-cdn`. The original remains private, and existing Media Library records/URLs are untouched. The optional `media_asset_id` supports future explicit linking; photography does not create duplicate generic Media Library records. Copy the public media URL or use Public preview. The public `/gallery` website is not implemented.

Publication records destination keys before copying and marks an item published only after all derivatives finish. On failure, the item remains visible with its operation/error state. Retry publication, or remove partially published derivatives with unpublish. Interrupted in-flight operations have a two-minute recovery lease; reported storage failures can be retried immediately. Unpublish changes the metadata to draft first and removes only owned photography CDN objects. It keeps originals and staged derivatives for later publication.

Photography CDN objects use `public, max-age=0, s-maxage=0, must-revalidate`, rather than the generic Media Library's immutable caching. **Manually ensure no Cloudflare cache rule overrides origin caching for `u/photography/*`** before relying on immediate unpublication. Purge that path manually if an overriding rule has cached it. No purge credentials or Cloudflare configuration automation is introduced. Previously downloaded or independently saved copies cannot be revoked; public images and videos remain savable at the network level.

Original downloads require individual review, explicit enablement, a published ready item, and a fresh authorized server request. The admin UI exposes an admin-only test download operation with a five-minute signed GET. Raw originals can carry GPS even when display locations are hidden; missing EXIF detection is not proof of absence. No public download endpoint exists yet. Signed R2 URLs necessarily identify their resource in their path and are bearer permissions: never persist them as public metadata or log/share them.

## Safe future public contract

Do not grant anon access to management tables or reuse `/api/photography` for public reads. Build a separate trusted server read operation that independently filters `status='published' AND storage_status='ready'` and constructs an explicit field allowlist:

```ts
type PublicGalleryItem = {
  id: string; type: "photo" | "video";
  title: string; caption: string | null; description: string | null; altText: string | null;
  displayUrl: string; thumbnailUrl: string; posterUrl: string | null;
  width: number | null; height: number | null; durationMs: number | null;
  captureLocal: string | null; captureTimezone: string | null; dateTaken: string | null;
  camera: { make: string | null; model: string | null; lens: string | null;
    aperture: number | null; shutterSpeed: string | null; iso: number | null; focalLength: number | null };
  location: null | { name: string | null; country: string | null; region: string | null;
    latitude: number | null; longitude: number | null };
  tags: { name: string; slug: string }[];
  albums: { title: string; slug: string }[];
  featured: boolean; displayOrder: number | null; publishedAt: string;
  originalDownloadEnabled: boolean;
};
```

Derive URLs only from approved public keys and the configured CDN origin. Hidden location must produce `null`, including place name/country/region; approximate location rounds coordinates to one decimal degree and excludes altitude and precise place names. Exact location can include explicitly approved coordinates. A future gallery must decide whether titles/captions themselves reveal sensitive places. Include only published albums and published items within them; album publication never auto-publishes member media. Do not expose `camera_settings` JSON without a separate allowlist.

The management dimensions describe the original. Determine actual display-image dimensions from the derivative when implementing the public image component, accounting for orientation and downscaling; do not assume the original dimensions match the WebP bytes.

Never include private keys, upload state, fingerprints, uploader identities, internal errors, credentials, admin rows, or signed private-preview links. For future public original downloads, accept only an item UUID; recheck ready/published/allow-download/review flags server-side and redirect to a five-minute signed original GET. Do not accept a bucket or object key. Use no-store responses; previously issued GET permissions remain usable until expiry even if permissions change. Return availability flags, not signed URLs, in listings. No original key is a permanent public identifier.

## Cleanup and validation

Library → **Clean abandoned imports** processes at most 30 expired pending/failed imports, after the 24-hour session plus the ten-minute signing window and a two-minute safety interval. It aborts multipart sessions and removes only matching ownership-marked objects under their generated private item paths. Ready originals are never candidates. Failed cleanup remains tracked and retryable; cleaned failed records remain as an audit tombstone. A retry creates a new independent session; failed-session fingerprints do not block reimport. Never apply a lifecycle rule to the whole originals bucket. A manually configured abort-incomplete-multipart rule is optional for untracked provider failures.

Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`. Run `npm run test:photography-smoke` against a configured local production server (default localhost:3000; override `PHOTOGRAPHY_SMOKE_BASE_URL`) to check anonymous denial at every endpoint without credentials or storage writes. `supabase/tests/photography_security.sql` is a separate rollback-only manual suite for an isolated test database after installing schemas; read its prerequisites. Unit tests use storage fakes, not live buckets. A real signed-in upload, CORS, copy, playback, download and CDN-cache check remain necessary after manual setup.

Current format limits: JPEG/PNG/WebP/AVIF/GIF images, MP4/WebM browser videos; no RAW/HEIC/TIFF conversion or MOV import UI. Browser images are bounded to 120 MiB/80 megapixels; unsupported decode or memory limits require a smaller supported input. Animated images become a still display derivative. Fingerprints hash full files up to 64 MiB; larger masters use size plus first/middle/last 1 MiB samples, a duplicate heuristic rather than integrity verification. Video dimensions/duration are read where the browser supports them; embedded video capture/camera/GPS metadata needs manual review. No map picker or durable cross-tab import queue is included. Keep the import tab open until completion. Large libraries paginate server-side; full-text/trigram indexing, background processing and CDN purge automation can be added when needed.

References: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Cloudflare R2 presigned URLs and CORS](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [exifr](https://github.com/MikeKovarik/exifr).
