# CODEX TASK: joemore.com Admin v0.0.3 - Photography Manager

You are a senior Next.js, TypeScript, Tailwind, Supabase and Cloudflare R2 engineer.

Extend my existing `admin.joemore.com` application with a dedicated Photography Manager for organising, cataloguing and publishing my personal photography and timelapse videos.

This application already has:

- A working Cloudflare R2 CDN Media Library uploader
- Supabase Auth and admin-only access
- A Supabase metadata database
- A polished dark-mode UI with Tailwind
- Full Next.js server rendering
- SQL schemas in `supabase/schemas/`

**IMPORTANT: Reuse the existing systems. Do not build another generic media uploader or redesign the admin application.**

## 1. Scope and navigation

Add a new **Photography** section to the existing admin sidebar.

Suggested routes:

- `/photography` - Photography library
- `/photography/upload` - Import photographs and videos
- `/photography/albums` - Manage albums

Use the existing Admin theme, typography, components, navigation and authentication.

The goal is an elegant, highly efficient photography management application.

Do not modify the public `www.joemore.com` website yet. We will build the public gallery separately.

## 2. Database architecture

Inspect the existing `media_assets` table and R2 integration.

Create new versioned SQL files under `supabase/schemas/`, using existing project conventions.

Design these related tables:

### photography_items

Each photograph or video should have:

**Identity and media**

- UUID primary key
- Reference to existing public CDN media asset where appropriate
- Reference/key for private original file
- Type: photo or video
- Original filename
- Title
- Caption
- Optional extended description
- Alt text
- Original width and height
- Duration for video
- Orientation
- Created and updated timestamps

**Capture metadata**

- Date taken
- Original local capture date/time
- Capture timezone, if known
- Camera make and model
- Lens model
- Aperture (f-number)
- Shutter speed
- ISO
- Focal length in mm
- Optional exposure compensation
- Optional camera settings JSON for additional metadata

**Location**

- Latitude
- Longitude
- Altitude, optional
- Location display name
- Country
- Region/city, optional
- Public location visibility: hidden, approximate or exact

**Publishing**

- Status: draft or published
- Featured boolean
- Published timestamp
- Allow original download boolean
- Optional public display order

Use appropriate field types, constraints and indexes.

Preserve capture timestamps accurately. Do not assume EXIF timestamps contain a timezone when one is absent.

### photography_tags

- UUID
- Unique tag name/normalised slug
- Created timestamp

### photography_item_tags

Many-to-many relationship between photography items and tags.

### photography_albums

- UUID
- Album title
- Slug
- Description
- Optional cover image reference
- Display order
- Publication settings
- Created/updated timestamps

### photography_album_items

- Album reference
- Photography item reference
- Sort position

An item may belong to multiple albums.

Use suitable constraints to prevent duplicates.

### Database security

Reuse the existing admin authorisation and RLS helpers.

- Admin-only access to all management tables
- No anonymous access to private photography metadata
- No self-granted admin permissions
- Private original storage keys must never appear in public API responses
- Public-gallery access, when later implemented, must expose only published records and explicitly approved fields

Do not create unnecessarily complex permission hierarchies.

Do not apply SQL to my live Supabase instance automatically.

## 3. File storage strategy

Reuse the existing Cloudflare R2 upload components, presigning logic, validation and multipart support wherever possible.

Existing public CDN:

- Bucket: `joemore-com-cdn`
- Domain: `https://cdn.joemore.com`

Create public gallery derivatives under an appropriate reserved prefix, such as:

`u/photography/`

Do not alter existing CDN URLs or objects.

### Private originals

Prepare support for a separate private R2 bucket:

`joemore-com-photography-originals`

This bucket will contain the original full-resolution photographs and master videos.

It must not have a publicly accessible custom domain.

I will configure the bucket and credentials separately when the implementation is ready.

Do not create the bucket automatically.

Implement or prepare direct-to-R2 uploads using short-lived presigned URLs, reusing the existing secure uploader architecture.

Only authorised admin requests may create upload permissions.

For images:

- Preserve the original file without recompression.
- Generate a web-optimised public image, ideally WebP.
- Generate a thumbnail for the admin gallery and public grid.
- Handle EXIF orientation correctly.
- Strip sensitive EXIF/GPS metadata from public derivatives.

Aim for a maximum web-display width around 2560 pixels, without upscaling smaller images.

For videos:

- Preserve original quality in private storage.
- Support a public web-ready MP4/WebM variant.
- Allow a poster image for the gallery.
- Generate poster frames in the browser where practical.
- Do not introduce server-side FFmpeg or an expensive transcoding pipeline in this release.
- Allow a separate optimised video to be supplied when needed.

A public web video remains downloadable at the network level. Do not describe hiding a download button as access control.

Draft items should not automatically publish their media to the public CDN.

Use the existing Media Library infrastructure and share utilities/components rather than duplicating them.

## 4. Drag-and-drop import

Build a beautiful drag-and-drop upload experience.

Requirements:

- Upload multiple photographs/videos
- Per-file progress
- Retry failed uploads
- Display upload status
- Preview each item
- Detect duplicates where practical
- Keep a queue of imported items
- Save items as drafts by default
- Continue editing metadata after upload

After upload, allow me to work through the photographs efficiently.

Prefer a thumbnail strip with the selected item shown in a large preview.

Provide Previous/Next keyboard shortcuts.

Do not lose unsaved edits when switching between items.

For batches, support a simple bulk edit feature.

## 5. Automatically extract EXIF metadata

Use a maintained library such as `exifr` for supported image formats.

On file selection, attempt to extract:

- Capture date/time
- Camera make
- Camera model
- Lens
- Aperture
- Exposure/shutter speed
- ISO
- Focal length
- GPS latitude/longitude
- Altitude
- Orientation
- Image dimensions

Normalise data carefully.

Display metadata in human-friendly formats, such as:

- f/2.8
- 1/250s
- ISO 100
- 35 mm

Do not invent values when EXIF is missing.

Every extracted field must be manually editable.

Preserve manually corrected values if the file is later processed again.

For videos, extract duration and dimensions where supported, and read capture metadata if available. Fall back to manual editing.

The example photos supplied with the task are reference photographs. Their shared JPEG copies do not contain EXIF tags, so manual metadata editing is essential.

## 6. Photography editing interface

Build a responsive editor containing a large media preview and a clean metadata panel.

Group fields into simple tabs or collapsible sections:

### Details

- Title
- Caption
- Extended description
- Alt text
- Date taken
- Album
- Tags

### Camera

- Camera make/model
- Lens
- Aperture
- Shutter speed
- ISO
- Focal length
- Other available exposure settings

### Location

- Place name
- Latitude and longitude
- Optional altitude
- Country/region
- Map pin picker if a lightweight suitable solution is available
- Public location precision selector

### Publishing

- Draft/published
- Featured
- Download original enabled/disabled
- Public preview
- Published date
- Copy public URL when published

Make the form enjoyable to use, not a large wall of technical fields.

Use autosave or explicit Save controls with clear unsaved-change handling, following the existing Admin patterns.

## 7. Tag management

Implement a polished searchable dropdown multi-select for tags.

Requirements:

- Search existing tags
- Select multiple tags
- Show selected tags as removable chips
- Create a new tag directly in the dropdown
- Edit and rename existing tags through a small management interface
- Prevent duplicates and case-insensitive near-duplicates
- Reuse tags across all photographs
- Support applying tags to multiple selected photographs

Do not require a separate page every time I want to create a tag.

## 8. Albums and photo ordering

Allow creating, editing and deleting photography albums.

Provide:

- Album cover image
- Name
- Description
- Collection slug
- Photographs within the album
- Drag-and-drop ordering
- Move or remove items from albums
- Bulk album assignment

An album should be an organisational collection, not a physical folder in R2.

Reordering items must update database sort positions without changing stored file paths.

Deleting an album must not delete its photographs.

## 9. Photography library

Build a polished gallery view using the current Admin visual language.

Include:

- Grid and list views
- Large attractive thumbnails
- Filter by tag
- Filter by album
- Filter by camera
- Filter by year/date taken
- Filter by photo/video
- Filter by draft/published
- Search title, caption and location
- Sort by date taken, newest added, title, etc.
- Multi-select and bulk editing

Use Supabase pagination and efficient filtering.

Never download entire original photographs just to show thumbnail grids.

## 10. Publishing and future public gallery

This is an important architectural requirement.

Eventually I will build:

`https://www.joemore.com/gallery`

The public gallery should show published photographs and timelapse videos with:

- Beautiful responsive images
- Titles and captions
- Albums and tags
- Camera metadata where available
- Optional location information
- Optional original download
- Responsive video playback

For this task, implement only the Admin-side publishing model and prepare/document a safe public read contract.

Do not build the public website yet.

Ensure the future website can retrieve published items and appropriate public URLs without access to private originals or internal admin records.

Do not expose admin-only tables directly to anonymous users.

### Downloads

Full-resolution original downloads should only be offered when explicitly enabled.

Use a server-authorised download operation and short-lived signed R2 GET URLs against the private originals bucket.

Do not expose original object keys or permanent credentials.

Make clear that public display images can still be saved by visitors.

When an item is unpublished, remove or invalidate its public derivatives as appropriate, accounting for CDN cache behaviour.

## 11. Security and reliability

Maintain the existing dual Cloudflare Access/Supabase Auth model.

Every admin server operation must independently verify authorised Supabase membership.

- No R2 credentials in browser bundles
- No arbitrary object-key input
- No unrestricted file uploads
- Validate media types and file sizes
- Avoid unsafe public file formats
- Use short-lived upload/download URLs
- Handle failed uploads and partial publication operations
- Never overwrite unrelated R2 objects
- Never modify existing CDN Media Library records unexpectedly
- Prevent accidental deletion of original files
- Warn if a full-resolution original contains GPS metadata before enabling downloads

Provide safe cleanup of abandoned uploads and temporary files.

## 12. Implementation constraints

Inspect the project carefully before making changes.

Use:

- Existing Next.js App Router
- Existing TypeScript configuration
- Existing Tailwind CSS theme
- Existing Supabase SSR/authentication architecture
- Existing R2 uploader utilities
- Existing reusable UI components
- Existing SQL file conventions

Avoid unnecessary new packages.

Do not rebuild the application's foundation.

Do not deploy.
Do not push to GitHub.
Do not modify my Cloudflare configuration.
Do not execute live database migrations.
Do not generate real credentials.
Do not change my public website.

## 13. Tests and documentation

Add practical tests for:

- EXIF metadata parsing
- Missing EXIF handling
- Camera-value normalisation
- GPS parsing and validation
- Tag creation and assignment
- Album ordering
- Bulk metadata updates
- Admin-only access
- Upload completion and failure
- Publication state transitions
- Private original download permissions

Run TypeScript, lint, production build and relevant tests.

Provide installation instructions for:

- New SQL schemas
- Private R2 bucket
- Required environment variables
- R2 permissions and CORS
- First real photography upload
- Publishing an image to the CDN

## 14. Completion report

Finish with a concise summary:

1. Features built
2. Files created/modified
3. SQL schemas created
4. R2 integration changes
5. Tests passed
6. Manual configuration required
7. Known limitations and future enhancements

Work pragmatically, preserve the existing Admin design, and prioritise an excellent usable photography workflow over unnecessary abstractions.
