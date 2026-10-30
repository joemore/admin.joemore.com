-- v0.0.2 Media Library. Run manually as postgres after 001 and 002.
-- No bucket operations, configuration changes, or existing-object imports.
-- Deliberately fails on existing objects so installation requires review.
begin;

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  storage_key text not null unique,
  original_filename text not null,
  display_name text not null,
  description text,
  alt_text text,
  mime_type text not null,
  media_type text not null,
  size_bytes bigint not null,
  width integer,
  height integer,
  duration_ms integer,
  thumbnail_key text unique,
  thumbnail_size_bytes bigint,
  etag text,
  status text not null default 'pending',
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  upload_id text,
  upload_expires_at timestamptz not null,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_assets_storage_key_check check (
    length(storage_key) <= 256 and
    storage_key ~ '^u/[A-Za-z0-9_-]{12}(-[a-z0-9][a-z0-9-]{0,47})?\.[a-z0-9]{1,8}$'
  ),
  constraint media_assets_thumbnail_key_check check (
    thumbnail_key is null or
    thumbnail_key ~ '^u/_thumbs/[A-Za-z0-9_-]{12}\.webp$'
  ),
  constraint media_assets_name_check check (
    length(original_filename) between 1 and 255 and
    length(btrim(display_name)) between 1 and 160
  ),
  constraint media_assets_description_check check (length(description) <= 5000),
  constraint media_assets_alt_text_check check (length(alt_text) <= 2000),
  constraint media_assets_media_type_check check (
    media_type in ('image', 'video', 'audio', 'document')
  ),
  constraint media_assets_mime_type_check check (
    length(mime_type) between 3 and 100 and mime_type ~ '^[a-z0-9.+-]+/[a-z0-9.+-]+$'
  ),
  -- The configurable application limit is lower; this bound stays exactly
  -- representable in JavaScript and avoids an accidental unbounded SQL value.
  constraint media_assets_size_check check (size_bytes between 1 and 9007199254740991),
  constraint media_assets_dimensions_check check (
    (width is null or width between 1 and 100000) and
    (height is null or height between 1 and 100000) and
    (duration_ms is null or duration_ms between 0 and 2147483647)
  ),
  constraint media_assets_thumbnail_size_check check (
    (thumbnail_key is null and thumbnail_size_bytes is null) or
    (thumbnail_key is not null and thumbnail_size_bytes is not null and
     thumbnail_size_bytes between 1 and 1048576)
  ),
  constraint media_assets_status_check check (
    status in ('pending', 'completing', 'ready', 'failed', 'deleting', 'delete_failed', 'deleted')
  ),
  constraint media_assets_ready_check check (status <> 'ready' or etag is not null),
  constraint media_assets_error_check check (length(error_message) <= 1000),
  constraint media_assets_upload_id_check check (length(upload_id) <= 2048)
);

create index media_assets_created_at_idx on public.media_assets (created_at desc, id);
create index media_assets_type_created_at_idx on public.media_assets (media_type, created_at desc, id);
create index media_assets_display_name_idx on public.media_assets (display_name, id);
create index media_assets_size_idx on public.media_assets (size_bytes desc, id);
create index media_assets_uploaded_by_idx on public.media_assets (uploaded_by);
create index media_assets_pending_expiry_idx on public.media_assets (upload_expires_at, id)
  where status in ('pending', 'completing', 'failed', 'deleting', 'delete_failed');

comment on table public.media_assets is
  'Managed u/ uploads only. Legacy R2 objects remain outside this table and are read-only in the application.';
comment on column public.media_assets.storage_key is
  'Immutable server-generated object key. Never derive a deletion target from client input.';
comment on column public.media_assets.uploaded_by is
  'Verified upload initiator. Immutable attribution; referenced Auth users cannot be deleted while records remain.';
comment on column public.media_assets.upload_id is
  'Internal multipart upload identifier. Browser clients receive part permissions, never choose a destination.';
comment on column public.media_assets.upload_expires_at is
  'Upload-session deadline used with an expiry grace period before safe cleanup.';

create function private.protect_media_asset_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if row(new.id, new.storage_key, new.original_filename, new.mime_type,
         new.media_type, new.size_bytes, new.uploaded_by, new.created_at)
     is distinct from
     row(old.id, old.storage_key, old.original_filename, old.mime_type,
         old.media_type, old.size_bytes, old.uploaded_by, old.created_at) then
    raise exception 'Media storage identity and upload attribution are immutable'
      using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

revoke all privileges on function private.protect_media_asset_identity()
  from public, anon, authenticated;
create trigger media_assets_protect_identity
  before update on public.media_assets
  for each row execute function private.protect_media_asset_identity();

alter table public.media_assets enable row level security;
alter table public.media_assets force row level security;

-- Explicitly remove Supabase's possible automatic public-schema grants.
revoke all privileges on table public.media_assets from public, anon, authenticated;
grant select on table public.media_assets to authenticated;
grant update (display_name, description, alt_text) on public.media_assets to authenticated;

create policy media_assets_admin_read on public.media_assets
  for select to authenticated
  using ((select private.is_admin()));

create policy media_assets_admin_edit_metadata on public.media_assets
  for update to authenticated
  using ((select private.is_admin()) and status = 'ready')
  with check ((select private.is_admin()) and status = 'ready');

-- Internal inserts, state transitions and deletes run only from the server's
-- privileged client AFTER a fresh Auth and active-membership check. No RPC can
-- change ownership or internal identifiers using an authenticated browser key.
grant select, insert, update, delete on table public.media_assets to service_role;

commit;
