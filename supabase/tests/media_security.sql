-- MANUAL ONLY: run as postgres on an isolated Supabase test database after
-- schemas 001, 002, and 003. Supply two existing Auth UUIDs; no users are made.
-- All fixtures and membership changes roll back. If any assertion fails,
-- immediately ROLLBACK the aborted transaction. Never omit the final ROLLBACK.
begin;
set local statement_timeout = '15s';
set local app.test_member_uuid = '<EXISTING_AUTH_USER_UUID_1>';
set local app.test_other_uuid = '<EXISTING_AUTH_USER_UUID_2>';
select set_config('app.test_asset_uuid', gen_random_uuid()::text, true);

do $test$
declare
  member_id uuid := current_setting('app.test_member_uuid')::uuid;
  other_id uuid := current_setting('app.test_other_uuid')::uuid;
  column_name text;
begin
  if member_id = other_id or
     (select count(*) from auth.users where id in (member_id, other_id)) <> 2 then
    raise exception 'Supply two distinct existing Auth UUIDs';
  end if;
  if not (select relrowsecurity and relforcerowsecurity from pg_class
          where oid = 'public.media_assets'::regclass) then
    raise exception 'media_assets must enable and force RLS';
  end if;
  if has_table_privilege('anon', 'public.media_assets', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('authenticated', 'public.media_assets', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
    raise exception 'Excessive table privileges';
  end if;
  foreach column_name in array array['display_name', 'description', 'alt_text'] loop
    if not has_column_privilege('authenticated', 'public.media_assets', column_name, 'UPDATE') then
      raise exception 'Missing editable-column privilege: %', column_name;
    end if;
  end loop;
  foreach column_name in array array['id', 'storage_key', 'original_filename',
    'mime_type', 'media_type', 'size_bytes', 'width', 'height', 'duration_ms',
    'thumbnail_key', 'thumbnail_size_bytes', 'etag', 'status', 'uploaded_by',
    'upload_id', 'upload_expires_at', 'error_message', 'created_at', 'updated_at'] loop
    if has_column_privilege('authenticated', 'public.media_assets', column_name, 'UPDATE') then
      raise exception 'Browser can modify internal column: %', column_name;
    end if;
  end loop;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'media_assets') <> 2 then
    raise exception 'Unexpected media policies';
  end if;
end;
$test$;

insert into public.admin_users (user_id, role, is_active)
values (current_setting('app.test_member_uuid')::uuid, 'super_admin', true)
on conflict (user_id) do update set role = excluded.role, is_active = true;
delete from public.admin_users where user_id = current_setting('app.test_other_uuid')::uuid;

insert into public.media_assets (
  id, storage_key, original_filename, display_name, mime_type, media_type,
  size_bytes, status, etag, uploaded_by, upload_expires_at, updated_at
) values (
  current_setting('app.test_asset_uuid')::uuid,
  'u/' || substr(replace(current_setting('app.test_asset_uuid'), '-', ''), 1, 12) || '-security-test.webp',
  'security-test.webp', 'Security test fixture', 'image/webp', 'image',
  128, 'ready', 'test-etag', current_setting('app.test_member_uuid')::uuid,
  now() + interval '1 day', now() - interval '1 day'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
do $test$
begin
  begin
    perform * from public.media_assets;
    raise exception 'FAIL: anon read media metadata';
  exception when insufficient_privilege then null;
  end;
end;
$test$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('app.test_other_uuid'), true);
select set_config('request.jwt.claims', json_build_object(
  'sub', current_setting('app.test_other_uuid'), 'role', 'authenticated',
  'user_metadata', json_build_object('role', 'super_admin', 'is_admin', true))::text, true);
do $test$
declare changed integer;
begin
  if exists (select 1 from public.media_assets) then
    raise exception 'FAIL: ordinary authenticated user read metadata';
  end if;
  update public.media_assets set display_name = 'forbidden';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'FAIL: ordinary user edited metadata'; end if;
end;
$test$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('app.test_member_uuid'), true);
select set_config('request.jwt.claims', json_build_object(
  'sub', current_setting('app.test_member_uuid'), 'role', 'authenticated')::text, true);
do $test$
begin
  if not exists (select 1 from public.media_assets
                 where id = current_setting('app.test_asset_uuid')::uuid) then
    raise exception 'FAIL: active administrator cannot read fixture';
  end if;
  update public.media_assets set display_name = 'Renamed fixture',
    description = 'Metadata only', alt_text = 'Test image'
    where id = current_setting('app.test_asset_uuid')::uuid;
  if not exists (select 1 from public.media_assets
                 where id = current_setting('app.test_asset_uuid')::uuid
                   and display_name = 'Renamed fixture'
                   and updated_at > now() - interval '1 hour') then
    raise exception 'FAIL: metadata edit or updated_at trigger failed';
  end if;
  begin
    update public.media_assets set storage_key = 'u/ABCDEFGHIJKL-replaced.webp'
      where id = current_setting('app.test_asset_uuid')::uuid;
    raise exception 'FAIL: browser can change storage key';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.media_assets set status = 'deleted'
      where id = current_setting('app.test_asset_uuid')::uuid;
    raise exception 'FAIL: browser can change lifecycle';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.media_assets set uploaded_by = current_setting('app.test_other_uuid')::uuid
      where id = current_setting('app.test_asset_uuid')::uuid;
    raise exception 'FAIL: browser can reassign attribution';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.media_assets (storage_key) values ('u/ABCDEFGHIJKL-forbidden.webp');
    raise exception 'FAIL: browser can create internal records';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.media_assets where id = current_setting('app.test_asset_uuid')::uuid;
    raise exception 'FAIL: browser can delete metadata';
  exception when insufficient_privilege then null;
  end;
end;
$test$;
reset role;

-- The existing membership helper intentionally accepts all three active roles.
update public.admin_users set role = 'editor'
  where user_id = current_setting('app.test_member_uuid')::uuid;
set local role authenticated;
do $test$
begin
  if not exists (select 1 from public.media_assets where id = current_setting('app.test_asset_uuid')::uuid) then
    raise exception 'FAIL: active editor denied';
  end if;
end;
$test$;
reset role;

update public.admin_users set is_active = false
  where user_id = current_setting('app.test_member_uuid')::uuid;
set local role authenticated;
do $test$
declare changed integer;
begin
  if exists (select 1 from public.media_assets) then
    raise exception 'FAIL: inactive membership read metadata';
  end if;
  update public.media_assets set description = 'forbidden';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'FAIL: inactive membership edited metadata'; end if;
end;
$test$;
reset role;

-- Database invariants still apply to the privileged application's role.
set local role service_role;
do $test$
begin
  begin
    update public.media_assets set storage_key = 'u/ABCDEFGHIJKL-replaced.webp'
      where id = current_setting('app.test_asset_uuid')::uuid;
    raise exception 'FAIL: storage identity trigger did not protect service writes';
  exception when check_violation then null;
  end;
  begin
    update public.media_assets set etag = null
      where id = current_setting('app.test_asset_uuid')::uuid;
    raise exception 'FAIL: ready record accepted no verified etag';
  exception when check_violation then null;
  end;
  begin
    update public.media_assets set thumbnail_key = 'welcome.webp', thumbnail_size_bytes = 128
      where id = current_setting('app.test_asset_uuid')::uuid;
    raise exception 'FAIL: invalid thumbnail key accepted';
  exception when check_violation then null;
  end;
end;
$test$;
reset role;

rollback;
