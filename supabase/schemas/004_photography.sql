-- v0.0.3 Photography Manager. REVIEW and run manually after schemas 001–003.
-- No public read API, bucket creation or existing Media Library changes.
begin;

create table public.photography_items (
  id uuid primary key default gen_random_uuid(),
  media_asset_id uuid references public.media_assets(id) on delete restrict,
  media_type text not null check (media_type in ('photo', 'video')),
  original_filename text not null check (length(original_filename) between 1 and 255),
  original_key text not null unique check (original_key ~ '^originals/[0-9a-f-]{36}/[A-Za-z0-9_-]+\.[a-z0-9]+$'),
  original_mime_type text not null,
  original_size bigint not null check (original_size between 1 and 5497558138880),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  original_has_gps boolean not null default false,
  original_gps_reviewed boolean not null default false,
  preview_key text not null unique,
  preview_mime_type text not null check (preview_mime_type in ('image/webp', 'video/mp4', 'video/webm')),
  preview_size bigint not null check (preview_size between 1 and 2147483648),
  thumbnail_key text not null unique,
  thumbnail_size integer not null check (thumbnail_size between 1 and 1048576),
  poster_key text unique,
  poster_size integer check (poster_size between 1 and 10485760),
  public_key text unique,
  public_thumbnail_key text unique,
  public_poster_key text unique,
  title text not null default 'Untitled' check (length(btrim(title)) between 1 and 160),
  caption text check (length(caption) <= 5000),
  description text check (length(description) <= 20000),
  alt_text text check (length(alt_text) <= 2000),
  width integer check (width between 1 and 100000),
  height integer check (height between 1 and 100000),
  duration_ms integer check (duration_ms between 0 and 2147483647),
  orientation integer check (orientation between 1 and 8),
  date_taken timestamptz,
  capture_local timestamp without time zone,
  capture_timezone text check (length(capture_timezone) <= 80),
  camera_make text check (length(camera_make) <= 160),
  camera_model text check (length(camera_model) <= 160),
  lens_model text check (length(lens_model) <= 200),
  aperture numeric check (aperture between 0.1 and 256),
  shutter_speed text check (length(shutter_speed) <= 80),
  iso integer check (iso between 1 and 10000000),
  focal_length numeric check (focal_length between 0.1 and 100000),
  exposure_compensation numeric check (exposure_compensation between -30 and 30),
  camera_settings jsonb not null default '{}'::jsonb check (jsonb_typeof(camera_settings) = 'object' and octet_length(camera_settings::text) <= 32000),
  latitude numeric check (latitude between -90 and 90),
  longitude numeric check (longitude between -180 and 180),
  altitude numeric check (altitude between -15000 and 100000),
  location_name text check (length(location_name) <= 240),
  country text check (length(country) <= 100),
  region text check (length(region) <= 200),
  location_visibility text not null default 'hidden' check (location_visibility in ('hidden', 'approximate', 'exact')),
  status text not null default 'draft' check (status in ('draft', 'published')),
  featured boolean not null default false,
  published_at timestamptz,
  allow_original_download boolean not null default false,
  display_order integer,
  storage_status text not null default 'pending' check (storage_status in ('pending', 'uploading', 'ready', 'failed', 'publishing', 'unpublishing', 'cleanup')),
  upload_state jsonb not null default '{}'::jsonb check (jsonb_typeof(upload_state) = 'object'),
  upload_expires_at timestamptz not null,
  error_message text check (length(error_message) <= 1000),
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint photography_gps_pair check ((latitude is null) = (longitude is null)),
  constraint photography_private_derivative_keys check (
    preview_key ~ '^staging/[0-9a-f-]{36}/preview\.(webp|mp4|webm)$' and
    thumbnail_key ~ '^staging/[0-9a-f-]{36}/thumbnail\.webp$' and
    (poster_key is null or poster_key ~ '^staging/[0-9a-f-]{36}/poster\.webp$')
  ),
  constraint photography_public_keys check (
    (public_key is null or public_key ~ '^u/photography/[0-9a-f-]{36}/[A-Za-z0-9_-]+\.(webp|mp4|webm)$') and
    (public_thumbnail_key is null or public_thumbnail_key ~ '^u/photography/[0-9a-f-]{36}/[A-Za-z0-9_-]+\.webp$') and
    (public_poster_key is null or public_poster_key ~ '^u/photography/[0-9a-f-]{36}/[A-Za-z0-9_-]+\.webp$')
  ),
  constraint photography_published_derivatives check (status <> 'published' or (public_key is not null and public_thumbnail_key is not null and published_at is not null)),
  constraint photography_original_download_review check (not allow_original_download or original_gps_reviewed),
  constraint photography_poster_pair check ((poster_key is null) = (poster_size is null))
);

create table public.photography_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  slug text not null unique check (length(slug) between 1 and 100 and slug = lower(slug)),
  created_at timestamptz not null default now()
);
create unique index photography_tags_name_ci on public.photography_tags (lower(btrim(name)));
create table public.photography_item_tags (
  item_id uuid not null references public.photography_items(id) on delete cascade,
  tag_id uuid not null references public.photography_tags(id) on delete cascade,
  primary key (item_id, tag_id)
);
create index photography_item_tags_tag_idx on public.photography_item_tags(tag_id, item_id);

create table public.photography_albums (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 160),
  slug text not null unique check (length(slug) <= 100 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text check (length(description) <= 10000),
  cover_item_id uuid references public.photography_items(id) on delete set null,
  display_order integer not null default 0,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.photography_album_items (
  album_id uuid not null references public.photography_albums(id) on delete cascade,
  item_id uuid not null references public.photography_items(id) on delete cascade,
  sort_position integer not null check (sort_position >= 0),
  primary key (album_id, item_id),
  unique (album_id, sort_position) deferrable initially deferred
);
create index photography_album_items_item_idx on public.photography_album_items(item_id, album_id);
create index photography_items_created_idx on public.photography_items(created_at desc, id);
create unique index photography_items_fingerprint_idx on public.photography_items(fingerprint) where storage_status not in ('failed','cleanup');
create index photography_items_capture_idx on public.photography_items(capture_local desc nulls last, id);
create index photography_items_status_idx on public.photography_items(status, created_at desc, id);
create index photography_items_type_idx on public.photography_items(media_type, created_at desc, id);
create index photography_items_camera_idx on public.photography_items(camera_model, id);
create index photography_items_title_idx on public.photography_items(title, id);
create index photography_items_expiry_idx on public.photography_items(upload_expires_at, id) where storage_status in ('pending', 'uploading', 'failed', 'cleanup');
create index photography_items_uploader_idx on public.photography_items(uploaded_by);
create index photography_items_media_asset_idx on public.photography_items(media_asset_id);
create index photography_albums_cover_idx on public.photography_albums(cover_item_id);
create index photography_albums_order_idx on public.photography_albums(display_order, title, id);

create function private.photography_touch()
returns trigger language plpgsql security invoker set search_path = '' as $fn$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$fn$;
revoke all on function private.photography_touch() from public, anon, authenticated;
create trigger photography_items_touch before update on public.photography_items for each row execute function private.photography_touch();
create trigger photography_albums_touch before update on public.photography_albums for each row execute function private.photography_touch();

-- No browser key can insert, mutate storage keys, change publication state or
-- grant original downloads. All writes pass through the verified server.
alter table public.photography_items enable row level security;
alter table public.photography_items force row level security;
alter table public.photography_tags enable row level security;
alter table public.photography_tags force row level security;
alter table public.photography_item_tags enable row level security;
alter table public.photography_item_tags force row level security;
alter table public.photography_albums enable row level security;
alter table public.photography_albums force row level security;
alter table public.photography_album_items enable row level security;
alter table public.photography_album_items force row level security;
revoke all on table public.photography_items, public.photography_tags, public.photography_item_tags, public.photography_albums, public.photography_album_items from public, anon, authenticated;
grant select on table public.photography_items, public.photography_tags, public.photography_item_tags, public.photography_albums, public.photography_album_items to authenticated;
grant select, insert, update, delete on table public.photography_items, public.photography_tags, public.photography_item_tags, public.photography_albums, public.photography_album_items to service_role;
create policy photography_items_admin_read on public.photography_items for select to authenticated using ((select private.is_admin()));
create policy photography_tags_admin_read on public.photography_tags for select to authenticated using ((select private.is_admin()));
create policy photography_item_tags_admin_read on public.photography_item_tags for select to authenticated using ((select private.is_admin()));
create policy photography_albums_admin_read on public.photography_albums for select to authenticated using ((select private.is_admin()));
create policy photography_album_items_admin_read on public.photography_album_items for select to authenticated using ((select private.is_admin()));

-- Service-only transaction for single edits and bulk changes. Replacements are
-- explicit for single-item saves; bulk assignment adds without removing other
-- memberships. The body rejects all internal/state fields independently of TS.
create function public.photography_edit_items(
  p_ids uuid[], p_metadata jsonb default '{}'::jsonb,
  p_tag_ids uuid[] default null, p_album_ids uuid[] default null,
  p_expected_updated_at timestamptz default null,
  p_gps_reviewed boolean default false, p_assignment_mode text default 'replace'
) returns setof public.photography_items
language plpgsql security invoker set search_path = '' as $fn$
declare current_item public.photography_items; next_item public.photography_items; n integer; album uuid; position integer;
begin
  if cardinality(p_ids) is null or cardinality(p_ids) < 1 or cardinality(p_ids) > 100 or
     (select count(distinct x) from unnest(p_ids) x) <> cardinality(p_ids) or
     p_assignment_mode not in ('replace', 'add') or jsonb_typeof(p_metadata) <> 'object' or
     exists (select 1 from jsonb_object_keys(p_metadata) k where k not in (
       'title','caption','description','alt_text','date_taken','capture_local','capture_timezone',
       'camera_make','camera_model','lens_model','aperture','shutter_speed','iso','focal_length',
       'exposure_compensation','camera_settings','latitude','longitude','altitude','location_name',
       'country','region','location_visibility','featured','allow_original_download','display_order',
       'width','height','duration_ms','orientation'
     )) then raise exception 'Invalid metadata operation' using errcode = '22023'; end if;
  if cardinality(p_ids) > 1 and (p_metadata ? 'allow_original_download' or p_gps_reviewed or p_expected_updated_at is not null) then
    raise exception 'Download permission requires individual review' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_tag_ids),0) > 200 or coalesce(cardinality(p_album_ids),0) > 100 then
    raise exception 'Too many memberships' using errcode = '22023';
  end if;
  perform 1 from public.photography_items where id = any(p_ids) order by id for update;
  select count(*) into n from public.photography_items where id = any(p_ids);
  if n <> cardinality(p_ids) then raise exception 'Item not found' using errcode = 'P0002'; end if;
  for current_item in select * from public.photography_items where id = any(p_ids) order by id loop
    if current_item.storage_status <> 'ready' or (p_expected_updated_at is not null and current_item.updated_at <> p_expected_updated_at) then
      raise exception 'Item changed; reload before saving' using errcode = '40001';
    end if;
    next_item := jsonb_populate_record(current_item, p_metadata);
    if next_item.allow_original_download and not (current_item.original_gps_reviewed or p_gps_reviewed) then
      raise exception 'Review original metadata before enabling downloads' using errcode = '22023';
    end if;
    update public.photography_items set
      title=next_item.title,caption=next_item.caption,description=next_item.description,alt_text=next_item.alt_text,
      date_taken=next_item.date_taken,capture_local=next_item.capture_local,capture_timezone=next_item.capture_timezone,
      camera_make=next_item.camera_make,camera_model=next_item.camera_model,lens_model=next_item.lens_model,
      aperture=next_item.aperture,shutter_speed=next_item.shutter_speed,iso=next_item.iso,focal_length=next_item.focal_length,
      exposure_compensation=next_item.exposure_compensation,camera_settings=next_item.camera_settings,
      latitude=next_item.latitude,longitude=next_item.longitude,altitude=next_item.altitude,location_name=next_item.location_name,
      country=next_item.country,region=next_item.region,location_visibility=next_item.location_visibility,
      featured=next_item.featured,allow_original_download=next_item.allow_original_download,
      original_gps_reviewed=(current_item.original_gps_reviewed or p_gps_reviewed),display_order=next_item.display_order,
      width=next_item.width,height=next_item.height,duration_ms=next_item.duration_ms,orientation=next_item.orientation
      where id=current_item.id;
  end loop;
  if p_tag_ids is not null then
    if p_assignment_mode='replace' then delete from public.photography_item_tags where item_id=any(p_ids); end if;
    insert into public.photography_item_tags(item_id,tag_id) select i,t from unnest(p_ids) i cross join unnest(p_tag_ids) t on conflict do nothing;
  end if;
  if p_album_ids is not null then
    -- Lock requested collections in a stable order before appending positions.
    perform 1 from public.photography_albums where id=any(p_album_ids) order by id for update;
    if (select count(*) from public.photography_albums where id=any(p_album_ids)) <> cardinality(p_album_ids) then raise exception 'Album not found' using errcode='P0002'; end if;
    if p_assignment_mode='replace' then delete from public.photography_album_items where item_id=any(p_ids) and not (album_id=any(p_album_ids)); end if;
    foreach album in array p_album_ids loop
      select coalesce(max(sort_position)+1,0) into position from public.photography_album_items where album_id=album;
      insert into public.photography_album_items(album_id,item_id,sort_position)
        select album,i,position+(row_number() over(order by i))::integer-1 from unnest(p_ids) i
        where not exists(select 1 from public.photography_album_items a where a.album_id=album and a.item_id=i)
        on conflict(album_id,item_id) do nothing;
    end loop;
  end if;
  return query select * from public.photography_items where id=any(p_ids) order by id;
end;
$fn$;
revoke all on function public.photography_edit_items(uuid[],jsonb,uuid[],uuid[],timestamptz,boolean,text) from public,anon,authenticated;
grant execute on function public.photography_edit_items(uuid[],jsonb,uuid[],uuid[],timestamptz,boolean,text) to service_role;

create function public.photography_order_album(p_album_id uuid, p_item_ids uuid[])
returns void language plpgsql security invoker set search_path='' as $fn$
begin
  if cardinality(p_item_ids) is null or cardinality(p_item_ids)>2000 or (select count(distinct x) from unnest(p_item_ids) x)<>cardinality(p_item_ids) then raise exception 'Invalid album order' using errcode='22023'; end if;
  perform 1 from public.photography_albums where id=p_album_id for update;
  if not found then raise exception 'Album not found' using errcode='P0002'; end if;
  if exists(select 1 from unnest(p_item_ids) i where not exists(select 1 from public.photography_items p where p.id=i and p.storage_status='ready')) then raise exception 'Item is unavailable' using errcode='22023'; end if;
  delete from public.photography_album_items where album_id=p_album_id;
  insert into public.photography_album_items(album_id,item_id,sort_position) select p_album_id,i,(ordinality-1)::integer from unnest(p_item_ids) with ordinality as ids(i,ordinality);
  update public.photography_albums set cover_item_id=null where id=p_album_id and cover_item_id is not null and not(cover_item_id=any(p_item_ids));
end;
$fn$;
revoke all on function public.photography_order_album(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.photography_order_album(uuid,uuid[]) to service_role;

-- A parameterized read RPC provides bounded pagination and relation filters
-- without fetching an entire library into the app server or browser.
create function public.photography_list(p_filters jsonb)
returns jsonb language sql stable security invoker set search_path='' as $fn$
  with filtered as (
    select p.* from public.photography_items p where
      p.storage_status in ('ready','publishing','unpublishing') and
      (coalesce(p_filters->>'type','all')='all' or p.media_type=p_filters->>'type') and
      (coalesce(p_filters->>'status','all')='all' or p.status=p_filters->>'status') and
      (coalesce(p_filters->>'q','')='' or concat_ws(' ',p.title,p.caption,p.location_name) ilike '%'||(p_filters->>'q')||'%') and
      (coalesce(p_filters->>'camera','')='' or concat_ws(' ',p.camera_make,p.camera_model) ilike '%'||(p_filters->>'camera')||'%') and
      (coalesce(p_filters->>'year','')='' or extract(year from coalesce(p.capture_local,p.date_taken at time zone 'UTC'))::text=p_filters->>'year') and
      (coalesce(p_filters->>'tag','')='' or exists(select 1 from public.photography_item_tags t where t.item_id=p.id and t.tag_id=(p_filters->>'tag')::uuid)) and
      (coalesce(p_filters->>'album','')='' or exists(select 1 from public.photography_album_items a where a.item_id=p.id and a.album_id=(p_filters->>'album')::uuid))
  ), paged as (
    select * from filtered order by
      case when p_filters->>'sort'='title' then title end asc,
      case when p_filters->>'sort'='oldest' then created_at end asc,
      case when p_filters->>'sort'='taken' then coalesce(capture_local,date_taken at time zone 'UTC') end desc nulls last,
      case when p_filters->>'sort'='taken_oldest' then coalesce(capture_local,date_taken at time zone 'UTC') end asc nulls last,
      case when p_filters->>'sort'='newest' then created_at end desc,id asc
      limit least(greatest(coalesce((p_filters->>'pageSize')::integer,36),1),60)
      offset (least(greatest(coalesce((p_filters->>'page')::integer,1),1),100000)-1)*least(greatest(coalesce((p_filters->>'pageSize')::integer,36),1),60)
  ) select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb),'count',(select count(*) from filtered));
$fn$;
revoke all on function public.photography_list(jsonb) from public,anon,authenticated;
grant execute on function public.photography_list(jsonb) to service_role;

comment on column public.photography_items.capture_local is 'Original EXIF wall-clock time. No timezone is inferred. date_taken is populated only when an explicit offset is known.';
comment on column public.photography_items.original_key is 'Private originals bucket only. Never include in future public gallery DTOs.';
comment on table public.photography_items is 'Admin-only management records. Future public gallery must use a server-side published-record allowlist, never direct anon SELECT.';
commit;
