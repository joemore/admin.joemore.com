-- MANUAL ONLY: isolated Supabase test database after schemas 001–004.
-- Replace the two Auth UUID placeholders with distinct existing test users.
-- Every fixture and membership change rolls back. Run with ON_ERROR_STOP.
begin;
set local statement_timeout = '20s';
set local app.test_member_uuid = '<EXISTING_AUTH_USER_UUID_1>';
set local app.test_other_uuid = '<EXISTING_AUTH_USER_UUID_2>';
select set_config('app.test_photo_uuid', gen_random_uuid()::text, true);
select set_config('app.test_second_photo_uuid', gen_random_uuid()::text, true);
select set_config('app.test_album_uuid', gen_random_uuid()::text, true);
select set_config('app.test_tag_uuid', gen_random_uuid()::text, true);
select set_config('app.test_second_tag_uuid', gen_random_uuid()::text, true);

do $test$
declare t text;
begin
  if current_setting('app.test_member_uuid')=current_setting('app.test_other_uuid') or
     (select count(*) from auth.users where id in(current_setting('app.test_member_uuid')::uuid,current_setting('app.test_other_uuid')::uuid))<>2 then raise exception 'Supply two existing Auth users'; end if;
  foreach t in array array['photography_items','photography_tags','photography_item_tags','photography_albums','photography_album_items'] loop
    if not(select relrowsecurity and relforcerowsecurity from pg_class where oid=('public.'||t)::regclass) then raise exception 'RLS missing on %',t; end if;
    if has_table_privilege('anon','public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') or
       has_table_privilege('authenticated','public.'||t,'INSERT,UPDATE,DELETE,TRUNCATE') then raise exception 'Excessive grant on %',t; end if;
  end loop;
  if has_function_privilege('anon','public.photography_edit_items(uuid[],jsonb,uuid[],uuid[],timestamptz,boolean,text)','EXECUTE') or
     has_function_privilege('authenticated','public.photography_edit_items(uuid[],jsonb,uuid[],uuid[],timestamptz,boolean,text)','EXECUTE') or
     has_function_privilege('authenticated','public.photography_order_album(uuid,uuid[])','EXECUTE') or
     has_function_privilege('anon','public.photography_list(jsonb)','EXECUTE') then raise exception 'Photography RPC exposed to a browser role'; end if;
end;
$test$;
insert into public.admin_users(user_id,role,is_active) values(current_setting('app.test_member_uuid')::uuid,'admin',true) on conflict(user_id) do update set role='admin',is_active=true;
delete from public.admin_users where user_id=current_setting('app.test_other_uuid')::uuid;
insert into public.photography_items(id,media_type,original_filename,original_key,original_mime_type,original_size,fingerprint,preview_key,preview_mime_type,preview_size,thumbnail_key,thumbnail_size,storage_status,uploaded_by,upload_expires_at,capture_local)
select id,'photo','fixture.jpg','originals/'||id||'/original.jpg','image/jpeg',100,encode(sha256(id::text::bytea),'hex'),'staging/'||id||'/preview.webp','image/webp',80,'staging/'||id||'/thumbnail.webp',40,'ready',current_setting('app.test_member_uuid')::uuid,now()+interval '1 day','2024-05-12 14:30:00'::timestamp
from unnest(array[current_setting('app.test_photo_uuid')::uuid,current_setting('app.test_second_photo_uuid')::uuid]) id;
insert into public.photography_tags(id,name,slug) values(current_setting('app.test_tag_uuid')::uuid,'Fixture A','fixture-a-'||current_setting('app.test_tag_uuid')),(current_setting('app.test_second_tag_uuid')::uuid,'Fixture B','fixture-b-'||current_setting('app.test_second_tag_uuid'));
insert into public.photography_albums(id,title,slug) values(current_setting('app.test_album_uuid')::uuid,'Test collection','fixture-'||current_setting('app.test_album_uuid'));

set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $test$
begin
  begin perform * from public.photography_items; raise exception 'FAIL: anonymous metadata access'; exception when insufficient_privilege then null; end;
  begin perform public.photography_list('{}'); raise exception 'FAIL: anonymous list RPC'; exception when insufficient_privilege then null; end;
end;
$test$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('app.test_other_uuid'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('app.test_other_uuid'),'user_metadata',json_build_object('role','admin'))::text,true);
do $test$
begin
  if exists(select 1 from public.photography_items) then raise exception 'FAIL: nonmember sees photography'; end if;
  begin insert into public.photography_tags(name,slug) values('forbidden','forbidden'); raise exception 'FAIL: browser creates tags'; exception when insufficient_privilege then null; end;
end;
$test$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('app.test_member_uuid'),true);
do $test$
begin
  if not exists(select 1 from public.photography_items where id=current_setting('app.test_photo_uuid')::uuid) then raise exception 'FAIL: admin read'; end if;
  begin update public.photography_items set original_key='forbidden'; raise exception 'FAIL: browser changes original'; exception when insufficient_privilege then null; end;
  begin update public.photography_items set allow_original_download=true; raise exception 'FAIL: browser grants downloads'; exception when insufficient_privilege then null; end;
  begin perform public.photography_edit_items(array[current_setting('app.test_photo_uuid')::uuid]); raise exception 'FAIL: browser executes management RPC'; exception when insufficient_privilege then null; end;
end;
$test$;
reset role;
update public.admin_users set is_active=false where user_id=current_setting('app.test_member_uuid')::uuid;
set local role authenticated;
do $test$ begin if exists(select 1 from public.photography_items) then raise exception 'FAIL: revoked member read'; end if; end; $test$;
reset role;
update public.admin_users set is_active=true where user_id=current_setting('app.test_member_uuid')::uuid;

set local role service_role;
do $test$
declare first_id uuid:=current_setting('app.test_photo_uuid')::uuid; second_id uuid:=current_setting('app.test_second_photo_uuid')::uuid; fixture_album uuid:=current_setting('app.test_album_uuid')::uuid; tag_id uuid:=current_setting('app.test_tag_uuid')::uuid; second_tag uuid:=current_setting('app.test_second_tag_uuid')::uuid; old_updated timestamptz; original_key_before text; amount integer;
begin
  select updated_at,original_key into old_updated,original_key_before from public.photography_items where id=first_id;
  perform public.photography_edit_items(array[first_id],'{"title":"Edited","iso":100}',array[tag_id],array[fixture_album],old_updated,false,'replace');
  if not exists(select 1 from public.photography_items where id=first_id and title='Edited' and iso=100 and capture_local='2024-05-12 14:30:00'::timestamp and date_taken is null and original_key=original_key_before) then raise exception 'FAIL: metadata normalization/preservation'; end if;
  begin perform public.photography_edit_items(array[first_id],'{"title":"stale"}',null,null,old_updated); raise exception 'FAIL: stale overwrite'; exception when serialization_failure then null; end;
  begin perform public.photography_edit_items(array[first_id],'{"status":"published"}'); raise exception 'FAIL: state write through metadata'; exception when invalid_parameter_value then null; end;
  begin perform public.photography_edit_items(array[first_id],'{"allow_original_download":true}'); raise exception 'FAIL: unreviewed original'; exception when invalid_parameter_value then null; end;
  perform public.photography_edit_items(array[first_id],'{"allow_original_download":true}',null,null,null,true);
  if not exists(select 1 from public.photography_items where id=first_id and original_gps_reviewed and allow_original_download) then raise exception 'FAIL: explicit original review not persisted'; end if;
  begin perform public.photography_edit_items(array[first_id,second_id],'{"allow_original_download":true}'); raise exception 'FAIL: bulk grants originals'; exception when invalid_parameter_value then null; end;
  perform public.photography_edit_items(array[first_id,second_id],'{"country":"Brazil","featured":true}',array[second_tag],array[fixture_album],null,false,'add');
  select count(*) into amount from public.photography_item_tags where item_id=first_id;
  if amount<>2 then raise exception 'FAIL: bulk removed existing tags'; end if;
  if (select count(*) from public.photography_items where id=any(array[first_id,second_id]) and country='Brazil' and featured)<>2 then raise exception 'FAIL: bulk metadata'; end if;
  begin perform public.photography_edit_items(array[first_id,second_id],'{"country":"rollback"}',array[gen_random_uuid()],null,null,false,'add'); raise exception 'FAIL: missing tag accepted'; exception when foreign_key_violation then null; end;
  if exists(select 1 from public.photography_items where id=any(array[first_id,second_id]) and country='rollback') then raise exception 'FAIL: partial bulk commit'; end if;
  perform public.photography_order_album(fixture_album,array[second_id,first_id]);
  if not exists(select 1 from public.photography_album_items a where a.album_id=fixture_album and a.item_id=second_id and sort_position=0) then raise exception 'FAIL: album reorder'; end if;
  begin perform public.photography_order_album(fixture_album,array[first_id,first_id]); raise exception 'FAIL: duplicate album items'; exception when invalid_parameter_value then null; end;
  if (select count(*) from public.photography_album_items a where a.album_id=fixture_album)<>2 then raise exception 'FAIL: failed reorder changed members'; end if;
  if ((public.photography_list('{"page":1,"pageSize":1,"sort":"newest","q":"Edited"}')->'items')::jsonb->0->>'id')<>first_id::text then raise exception 'FAIL: paginated search'; end if;
  begin update public.photography_items set latitude=91,longitude=0 where id=first_id; raise exception 'FAIL: invalid GPS'; exception when check_violation then null; end;
  begin update public.photography_items set status='published' where id=first_id; raise exception 'FAIL: published without derivatives'; exception when check_violation then null; end;
  delete from public.photography_albums where id=fixture_album;
  if (select count(*) from public.photography_items where id=any(array[first_id,second_id]))<>2 then raise exception 'FAIL: album deletion deleted photographs'; end if;
end;
$test$;
reset role;
rollback;
