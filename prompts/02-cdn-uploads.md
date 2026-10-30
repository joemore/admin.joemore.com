# CODEX TASK: joemore.com Admin v0.0.2 - Cloudflare R2 Media Library

You are a senior Next.js, TypeScript, Supabase/PostgreSQL and Cloudflare R2 engineer.

Extend my existing `admin.joemore.com` application by implementing a professional Media Library for managing files in my Cloudflare R2 CDN.

This is a feature addition to the existing application, not a rebuild.

## 1. Inspect the existing project first

Locate and examine:

- Existing Next.js application and routing
- Tailwind CSS theme and reusable UI components
- Existing Supabase Auth implementation
- `admin_users` table, RLS and admin authorisation helpers
- Existing Media Library navigation and placeholder
- `/supabase/schemas/` SQL organisation
- Existing environment variable conventions

Preserve the application's polished dark-mode theme, modern typography, responsive navigation and security architecture.

Do not introduce a second authentication system or a different design system.

Do not modify unrelated website modules.

## 2. Cloudflare R2 configuration

My existing Cloudflare R2 configuration:

- Bucket: `joemore-com-cdn`
- Public domain: `https://cdn.joemore.com`
- Managed upload prefix: `u/`

The bucket already contains existing files and directories such as `3d-scenes/`, `creations/`, `temp/` and `welcome.webp`.

**Do not delete, rename, move, overwrite or otherwise modify these existing files.**

Create an R2 integration using the AWS SDK v3 with Cloudflare's S3-compatible endpoint.

Use environment variables:

```env
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=joemore-com-cdn
R2_PUBLIC_BASE_URL=https://cdn.joemore.com
R2_UPLOAD_PREFIX=u/
```

All credentials must remain server-side.

Use scoped R2 credentials with permissions limited to this bucket.

Do not put R2 credentials in `NEXT_PUBLIC_` variables.

Do not use the generic Cloudflare Global API Key.

Create `.env.example` entries but do not populate `.env.local`.

The project must build even if R2 credentials are missing, displaying a useful configuration-required state.

## 3. File naming convention

Use permanent public URLs with this structure:

`https://cdn.joemore.com/u/{random-id}-{optional-slug}.{extension}`

Examples:

- `u/k8P4mQ2xT9vB-blue-smiley.webp`
- `u/r7N3aY9pL2qK.jpg`
- `u/w4B7kL9mP2zQ-intro.mp4`

Requirements:

- Generate a cryptographically secure, 12-character URL-safe random identifier.
- Use a short optional descriptive slug.
- Sanitise slugs and extensions.
- Preserve the original file's appropriate format unless explicitly converting a thumbnail.
- Prevent path traversal and unsafe filenames.
- Avoid sequential public IDs.
- Ensure unique R2 object keys.
- Never overwrite existing objects.
- Keep the public URL immutable after upload.

Store an independent UUID as the database primary key.

Editing an asset's display name must not rename its R2 object or change its public URL.

## 4. Supabase SQL schemas

Add new SQL files under:

`supabase/schemas/`

Follow the conventions already established in this project.

Create a `media_assets` metadata table.

Recommended fields:

- `id` UUID primary key
- `storage_key` TEXT unique, not null
- `original_filename` TEXT
- `display_name` TEXT
- `description` TEXT nullable
- `alt_text` TEXT nullable
- `mime_type` TEXT
- `media_type` TEXT
- `size_bytes` BIGINT
- `width` INTEGER nullable
- `height` INTEGER nullable
- `duration_ms` INTEGER nullable
- `thumbnail_key` TEXT nullable
- `etag` TEXT nullable
- `status` TEXT constrained to valid statuses
- `uploaded_by` UUID referencing `auth.users`
- `created_at` TIMESTAMPTZ
- `updated_at` TIMESTAMPTZ

Include suitable database constraints, indexes and updated-at handling.

Create additional upload-session tracking tables only if required for reliable multipart uploads.

### RLS requirements

- Enable RLS on all new tables.
- No anonymous access.
- No access for ordinary authenticated users.
- Active administrators may manage media metadata.
- Reuse the existing secure admin-membership helper where possible.
- Restrict table privileges as appropriate.
- Prevent clients from arbitrarily assigning privileged ownership or modifying internal storage identifiers.
- Keep privileged R2 operations behind authenticated server-side endpoints.
- Avoid unnecessary Supabase service/secret keys.

Do not execute SQL against my live database.

Provide the SQL and installation instructions for my manual review.

## 5. Build the Media Library UI

Replace the existing Media Library placeholder with a fully responsive module.

Use the application's existing Tailwind design system and UI patterns.

### Gallery view

Display files using attractive thumbnail cards.

Each item should show:

- Thumbnail or file-type icon
- Display name
- File type
- File size
- Upload date
- Context menu

### List view

Provide a compact table with:

- Filename/name
- Type
- Size
- Date
- Status
- Actions

### Search and filtering

Implement:

- Search by filename and display name
- Filter by file type
- Sort by newest/oldest
- Sort by name
- Sort by file size
- Pagination or incremental loading
- Toggle between grid and list views

Perform filtering and pagination through Supabase for managed media. Do not download the entire metadata table to the browser.

### Existing bucket objects

Include a separate read-only "Existing R2 Files" browser.

Use paginated R2 object listing through secure server-side requests.

Support browsing existing prefixes and viewing their object metadata.

Do not allow this feature to edit or delete legacy R2 objects.

Make it clear that older bucket objects might not yet have corresponding database metadata.

Avoid claiming global sorting or searching across unfetched R2 objects.

## 6. Upload interface

Implement a modern drag-and-drop uploader.

Requirements:

- Multiple file selection
- Drag and drop
- Upload queue
- Per-file progress
- Success/failure state
- Retry failed uploads
- Optional display name
- Optional description
- Clear errors
- Copy public CDN URL after completion

Support appropriate common formats:

- Images: JPEG, PNG, WebP, GIF, AVIF
- Video: MP4, WebM, MOV
- Audio: MP3, WAV, M4A, OGG
- Documents: PDF and selected safe downloadable formats

Avoid unrestricted arbitrary file types.

Explicitly disallow potentially dangerous active-content uploads such as HTML, SVG and JavaScript in this release.

Use correct MIME types and safe Content-Disposition behaviour.

Do not automatically convert or compress original uploads.

Set appropriate cache-control metadata for immutable public assets.

## 7. Secure direct-to-R2 uploads

Files should upload directly from the browser to R2, rather than passing their bytes through the Next.js server.

Implement this flow:

1. Verify the Supabase session server-side.
2. Verify active administrator membership.
3. Validate requested file metadata, allowed type and size.
4. Generate a unique object key under `u/`.
5. Create a pending database record.
6. Generate short-lived presigned upload permissions.
7. Upload from browser directly to Cloudflare R2.
8. Finalise through an authenticated server endpoint.
9. Verify the object exists in R2 and check its size and relevant metadata.
10. Mark the metadata record ready only after verification.

Treat presigned URLs as sensitive bearer credentials.

Do not expose permanent credentials, trust a client-supplied object key, or let a user choose arbitrary R2 destinations.

Use narrowly scoped signed permissions and short expiry times.

Support ordinary single PUT uploads for small and medium files.

For large videos and other large files, implement reliable S3-compatible multipart uploads with server-controlled initiation, part signing, completion and abort.

Use a reasonable initial maximum file size, documented and configurable. Aim to accommodate videos up to approximately 2 GB without proxying file bytes through Next.js.

Handle network failures, abandoned sessions and failed multipart uploads gracefully.

Add a practical cleanup strategy for stale pending records and incomplete uploads.

Validate server-side authorization on every upload, completion, deletion and metadata-management operation, regardless of Cloudflare Access protection.

## 8. Thumbnail strategy

### Images

Generate a lightweight WebP thumbnail around 400 pixels wide, preserving aspect ratio.

Prefer client-side generation during upload to avoid unnecessary processing on my home server.

Store generated thumbnails under a reserved internal prefix within `u/`, with unique keys.

Record the thumbnail key in Supabase.

Avoid processing unnecessarily large images into memory without limits.

Handle unsupported image formats gracefully.

### Videos

For this release:

- Provide a native video preview where browser support allows.
- Display a video placeholder when a preview is unavailable.
- Do not introduce an FFmpeg server-side processing pipeline.
- Leave room for optional poster-frame generation in a later version.

### Audio and other formats

Use attractive file-type icons and suitable preview controls.

## 9. Asset details and management

Clicking an asset should open a details panel or modal.

Include:

- Preview
- Display name
- Editable description
- Editable alt text where relevant
- Original filename
- MIME type
- Dimensions where available
- File size
- Upload date
- Exact R2 object key
- Public CDN URL
- Copy URL action
- Open public file action
- Download action

Allow metadata editing without changing the public URL.

### Delete

Provide deletion only for managed media under `u/`.

Require explicit confirmation warning that deleting a CDN asset may break pages that reference it.

Delete the associated thumbnail and original R2 object safely, and update the database state.

Handle partial failures without silently losing track of the object.

Never delete objects outside the managed upload prefix.

Do not implement bulk deletion in this initial version.

## 10. Security and performance

- Preserve existing Cloudflare Access and Supabase Auth design.
- Enforce existing admin permissions on every server-side operation.
- Use server-only R2 credentials.
- Validate filenames, file types and sizes.
- Use robust object-key generation.
- Avoid arbitrary public file hosting endpoints.
- Use image lazy loading.
- Use paginated database queries.
- Avoid downloading originals for gallery thumbnails.
- Handle missing credentials and unavailable services gracefully.
- Never log credentials, presigned URLs or authentication tokens.
- Do not weaken the existing RLS policies.
- Do not expose the database catalogue publicly.

Add sensible validation, error handling and tests.

## 11. Cloudflare configuration documentation

Create a dedicated setup document explaining how I can manually configure Cloudflare.

Include:

- How to create a bucket-scoped R2 API token.
- Which account ID and S3 credentials are required.
- Where to add them to `.env.local`.
- Required bucket CORS policy for browser uploads from `https://admin-jg.joemore.com`.
- How to allow localhost development origins safely.
- Why presigned upload URLs use the R2 S3 endpoint rather than `cdn.joemore.com`.
- How to test a public CDN URL.
- Which caching settings are recommended.
- How to ensure the existing bucket content remains untouched.

Provide a copyable CORS policy tailored to the actual request methods and headers used by the implementation.

Do not apply Cloudflare changes automatically.

## 12. Testing and completion

Run:

- TypeScript checks
- ESLint
- Production build
- Relevant unit tests

Add focused tests for:

- Random key generation and collision avoidance
- Slug sanitisation
- Object key/path restrictions
- File-type and size validation
- Admin-only operations
- Pending/ready/failed upload state transitions
- Multipart upload handling
- Safe deletion
- Missing configuration

Use mocks for R2-dependent tests until real credentials are available.

Do not claim live upload success until it has actually been verified.

### Restrictions

- Do not deploy.
- Do not push to GitHub.
- Do not modify my other websites.
- Do not execute SQL against the live Supabase database.
- Do not change existing Cloudflare configuration.
- Do not delete existing R2 objects.
- Do not create real credentials.

### Deliverable

Complete the Media Library implementation inside the existing project.

Finish with a concise report covering what was built, SQL files created, tests passed, configuration still required and exact steps I need to complete before performing my first real upload.

Preserve the quality of the existing Admin interface. Avoid unnecessary feature creep, but ensure the upload architecture is dependable and extensible.
