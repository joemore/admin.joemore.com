# Media Library setup — v0.0.2

The implementation is local source code only. No SQL, Cloudflare settings, bucket writes, deployments, or live upload checks are performed by setup, tests, or the build. Review and complete the steps below yourself before the first upload. `.env.local` has not been populated with media credentials.

## 1. Install the reviewed SQL

Back up your database configuration and review [003_media_assets.sql](../supabase/schemas/003_media_assets.sql). The existing [schema installation guide](../supabase/schemas/README.md) remains the source of truth. If `001_admin_users.sql` and `002_admin_access.sql` are already installed, run **only** `003_media_assets.sql` once in Supabase Studio → SQL Editor as `postgres`. Do not rerun earlier files. Each file intentionally fails on conflicting existing objects rather than replacing them.

The new table stores managed uploads and their upload-session state; it does not import or change legacy bucket files. RLS reuses `private.is_admin()`, including active `super_admin`, `admin`, and `editor` members. Anonymous and ordinary authenticated users cannot read media metadata. Active administrators can read records and update only display name, description, and alt text on ready assets. Browser database clients cannot insert rows, change ownership or keys, mark uploads ready, or delete records. A trigger also prevents changing original storage identity and attribution during privileged updates.

The application therefore needs an **existing server-only Supabase secret key** for protected internal writes. This is necessary to keep upload verification and lifecycle transitions out of browser-accessible privileges. Every application operation still verifies the signed-in user and live active membership using the ordinary session before using this privileged client. The key bypasses RLS: store it only on the trusted Next.js server. No new privileged RPC or second authentication system is introduced. Your self-hosted stack may expose the compatible legacy `service_role` key rather than a newer `sb_secret_...` key; use the existing key supported by that stack, never a publishable/anon key. See [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).

Keep `private` outside the Data API's exposed schemas. `public` must remain exposed for session-authorized queries. The SQL grants only the privileges required on the new table and does not alter existing membership policies or global default privileges. Upload attribution uses an `auth.users` foreign key with `ON DELETE RESTRICT`: an Auth user with media records cannot be deleted without a separately reviewed data-retention change. Deactivating membership remains available and immediately removes application access.

For database verification, manually run [media_security.sql](../supabase/tests/media_security.sql) on an **isolated test database** after installing all three schemas. Supply two existing Auth UUIDs as instructed; the script creates no accounts and rolls back its fixtures. If an assertion fails, immediately roll back the aborted transaction. This suite has not been run against your live database.

## 2. Create a bucket-scoped R2 token

In Cloudflare Dashboard → R2 Object Storage → Overview → Account Details → API Tokens → Manage, create an R2 API token. Choose **Object Read & Write**, select **Apply to specific buckets only**, and select **only `joemore-com-cdn`**. Do not choose Admin Read & Write, all buckets, or the generic Cloudflare Global API Key. The application does not need permissions to create/delete buckets or change CORS, public domains, or lifecycle settings.

Copy the token's **Access Key ID** and **Secret Access Key** when shown; the secret is shown once. Also copy your Cloudflare **Account ID**, the 32-character hexadecimal identifier used in the S3 endpoint. The R2 API token value itself is not a substitute for the S3 Secret Access Key. See [Cloudflare R2 authentication](https://developers.cloudflare.com/r2/api/tokens/).

Bucket-scoped credentials still have object access throughout that bucket. The application's generated keys, conditional writes, database records, and deletion ownership checks enforce its narrower managed namespace. Protect these credentials accordingly.

## 3. Configure the server environment

Add these entries manually to the application's ignored `.env.local`, or to the equivalent trusted runtime environment. Leave the existing Supabase URL/publishable key configuration intact:

```dotenv
SUPABASE_SECRET_KEY=<existing-server-only-secret-or-compatible-service-role-key>
R2_ACCOUNT_ID=<32-character-cloudflare-account-id>
R2_ACCESS_KEY_ID=<bucket-scoped-r2-access-key-id>
R2_SECRET_ACCESS_KEY=<bucket-scoped-r2-secret-access-key>
R2_BUCKET_NAME=joemore-com-cdn
R2_PUBLIC_BASE_URL=https://cdn.joemore.com
R2_UPLOAD_PREFIX=u/
R2_MAX_FILE_SIZE_BYTES=2147483648
```

Never add `NEXT_PUBLIC_` to server credentials, copy them into a client component, log them, or commit `.env.local`. `.env.example` documents the variables without credentials. Restart Next.js after changing the environment. If any required setting is missing or invalid, the library shows a configuration-required state and upload requests fail safely; the production build still succeeds.

This release deliberately accepts only `u/` as the managed prefix. Originals use `u/{12-character-random-id}-{optional-slug}.{extension}`; thumbnails use reserved `u/_thumbs/{12-character-random-id}.webp`. Database UUIDs are independent of public IDs. Changing display names does not rename objects or change URLs. Keep the bucket, prefix, and public base URL stable once assets are in use.

The default original-file limit is **2 GiB (2,147,483,648 bytes)** and can be adjusted with `R2_MAX_FILE_SIZE_BYTES` after checking current R2 limits. Files up to 64 MiB use a single direct PUT; larger files use multipart uploads. At the default maximum, multipart parts are 16 MiB, with a smaller final part. Raising the maximum can increase the part size to keep the upload within 10,000 parts. File bytes travel from the browser to R2, so the Next.js server does not need a 2 GB request-body limit. Its endpoints receive only small metadata requests and verify bounded object metadata/signature reads.

Allowed originals are JPEG, PNG, WebP, GIF, AVIF; MP4, WebM, MOV; MP3, WAV, M4A, OGG; and PDF, plain text, ZIP. File extensions and MIME types must agree; finalization verifies size, stored metadata, and a bounded format signature. HTML, SVG, JavaScript, and executable file extensions are refused. Documents use `Content-Disposition: attachment`; image/audio/video formats use their canonical MIME type and inline disposition. Originals are neither compressed nor converted. Browser-supported images may generate an optional 400-pixel WebP thumbnail; large or unsupported images keep an icon when a thumbnail cannot be produced. No FFmpeg service is required.

## 4. Add browser-upload CORS manually

In the **existing** `joemore-com-cdn` bucket → Settings → CORS policy, review the current policy. Preserve any rules required by other sites and add this rule. The following is a copyable complete array for a bucket with no other CORS requirements:

```json
[
  {
    "AllowedOrigins": ["https://admin-jg.joemore.com"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": [
      "Content-Type",
      "Cache-Control",
      "Content-Disposition",
      "If-None-Match",
      "x-amz-meta-asset-id"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

These headers match direct original/thumbnail PUTs. Multipart part uploads also use PUT; initiating, listing parts, completing, aborting, and deleting run on the trusted server and do not require browser CORS methods. Do not add browser DELETE or wildcard origins. Cloudflare handles OPTIONS preflight from the allowed PUT rule; `OPTIONS` is not an `AllowedMethods` entry. See [R2 CORS configuration](https://developers.cloudflare.com/r2/buckets/cors/).

For development, add only the exact local origin you actually use to `AllowedOrigins`, for example `http://localhost:3000`. Add `http://127.0.0.1:3000` separately only if you use it; origins include scheme and port. Remove development origins when no longer needed. If production uses another administration origin, explicitly add that exact origin after review. Preserve unrelated existing rules rather than replacing them with this example.

Presigned URLs are short-lived bearer permissions for an exact object/part, valid for **10 minutes**. They use `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, the authenticated S3 API endpoint; `cdn.joemore.com` serves public reads and cannot substitute for the signing endpoint. Do not paste upload URLs into issue trackers, screenshots, telemetry, or logs. See [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).

## 5. Review caching and existing-content protection

Leave the current `cdn.joemore.com` custom-domain connection intact. New completed originals and thumbnails set `Cache-Control: public, max-age=31536000, immutable`. Let the CDN respect origin cache headers for these unique keys. If you add a cache rule, scope it to `/u/` and avoid overriding existing legacy paths or weakening access protection for the administration site.

A replacement file receives a new public URL. Never overwrite a published key to update its contents. Deleting an asset removes its origin object but previously cached copies can remain at Cloudflare and in visitors' browsers until expiry. If immediate CDN removal is required, separately review a manual Cloudflare purge for that exact URL; the application does not change caching settings or purge caches automatically.

Existing `3d-scenes/`, `creations/`, `temp/`, `welcome.webp`, and any untracked objects remain untouched. The Existing R2 Files tab performs paginated read-only prefix listing and object metadata requests; older objects may have no database metadata. It offers no legacy mutation or global search/sort over unfetched objects. Managed deletion accepts a database asset ID, requires explicit confirmation, checks the generated namespace and object ownership, and records partial failures for retry. Single PUTs use `If-None-Match: *`; multipart initialization reserves a new key conditionally before upload, preventing an existing key from being selected for replacement.

Ready assets have a ten-minute deletion delay after upload completion or a metadata edit, ensuring any outstanding direct-PUT permission has expired before the object is removed. This prevents replay of a valid conditional PUT from recreating a deleted object. A failed or cancelled upload remains tracked until its session and permissions expire; cleanup then removes it safely.

## 6. Recover abandoned uploads

An upload session expires after 24 hours. Part permissions are issued only for a live session and expire after 10 minutes. The authenticated cleanup operation waits beyond the session deadline plus the signing grace period before removing tracked unfinished content, so a valid outstanding PUT cannot recreate an object after cleanup. It aborts recorded multipart uploads and safely removes owned unfinished originals/thumbnails. Partial cleanup failures retain metadata for another attempt. It does not scan or remove arbitrary objects under `u/`.

Use the library's stale-upload cleanup control periodically after interrupted uploads. For unattended operations, a future scheduler should call this same authenticated server workflow using an intentionally designed machine identity; do not place a secret key in a public cron URL or weaken the existing session/admin requirement.

As a separate manual defense against orphaned multipart sessions, review the bucket's existing lifecycle settings. Cloudflare documents a default seven-day incomplete multipart expiry. If you add a custom rule, scope **Abort incomplete multipart uploads** to `u/`, retain a delay longer than the application's 24-hour session, and preserve existing rules. Do **not** configure object expiration/deletion for `u/` or for the whole bucket: that would delete published CDN assets. Do not apply a broad cleanup script to the existing bucket. See [R2 object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).

## 7. First real upload checklist

1. Review/install `003_media_assets.sql` after the existing schemas; confirm your account has active membership and that private schemas remain unexposed.
2. Create the bucket-scoped R2 token, add the server environment values manually, add the exact-origin CORS rule, and restart the application.
3. Sign in through the existing protected administration URL and open **Media library**. Confirm the configuration-required message is gone.
4. Upload a small disposable JPEG/PNG. Wait for **ready**, copy its CDN URL, open it in a separate tab, and confirm the displayed content. Inspect it with `curl -I 'https://cdn.joemore.com/u/<copied-exact-key>'` to check MIME type, disposition, and cache headers. A public read uses the CDN URL, never the presigned upload URL.
5. Edit the display name, description, and alt text. Confirm the exact storage key and public URL remain unchanged. Check grid/list, search, filtering, pagination, and the thumbnail.
6. Test a disposable file above 64 MiB to exercise multipart progress and retries, then a representative larger video within the configured limit. Browser video support varies by container/codec, especially MOV. A native-preview failure does not imply that storage failed.
7. Wait at least ten minutes after completion or the last metadata edit, then test explicit deletion only on your newly uploaded disposable managed asset. Confirm it reaches deleted state or shows a retryable partial failure. Never select or change legacy objects to test deletion.
8. Test signed-out, inactive-member, and ordinary-user requests; each must be refused regardless of Cloudflare Access. Inspect server logs only for safe errors, without tokens or signed URLs.

Repository checks use mocks for R2 and never establish real bucket or database connectivity. A successful build/test run is not evidence of a successful live upload. Until the manual checks above run against your environment, real upload, CORS, CDN, and database-installation behavior remain unverified.
