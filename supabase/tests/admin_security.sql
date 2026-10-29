-- MANUAL regression suite; not run by npm test or application startup.
-- Use an isolated Supabase test database with both schema files installed.
-- Supply TWO distinct, already-provisioned auth.users UUIDs below. This script
-- creates no Auth accounts, passwords or credentials. Membership fixtures and
-- the probe table are transaction-local and are always rolled back on success.
-- If any assertion fails, ROLLBACK the aborted transaction before doing anything
-- else. With psql, use -v ON_ERROR_STOP=1 and close the session after a failure.

begin;
set local statement_timeout = '15s';
set local app.test_member_uuid = '<EXISTING_AUTH_USER_UUID_1>';
set local app.test_other_uuid = '<EXISTING_AUTH_USER_UUID_2>';

do $test$
declare
  member_id uuid := current_setting('app.test_member_uuid')::uuid;
  other_id uuid := current_setting('app.test_other_uuid')::uuid;
begin
  if member_id = other_id then
    raise exception 'Supply two distinct existing Auth UUIDs';
  end if;
  if (select count(*) from auth.users where id in (member_id, other_id)) <> 2 then
    raise exception 'Both fixture UUIDs must already exist in auth.users';
  end if;
  if not (select relrowsecurity and relforcerowsecurity from pg_class
          where oid = 'public.admin_users'::regclass) then
    raise exception 'admin_users must have RLS enabled and forced';
  end if;
  if has_table_privilege('anon', 'public.admin_users', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('authenticated', 'public.admin_users', 'INSERT')
     or has_table_privilege('authenticated', 'public.admin_users', 'UPDATE')
     or has_table_privilege('authenticated', 'public.admin_users', 'DELETE')
     or has_table_privilege('authenticated', 'public.admin_users', 'TRUNCATE')
     or has_schema_privilege('authenticated', 'private', 'CREATE')
     or has_function_privilege('anon', 'private.is_admin()', 'EXECUTE') then
    raise exception 'Excessive table/schema/function privileges';
  end if;
  if (select prosecdef from pg_proc where oid = 'private.is_admin()'::regprocedure)
     or (select pronargs from pg_proc where oid = 'private.is_admin()'::regprocedure) <> 0 then
    raise exception 'Helper must be SECURITY INVOKER with no arguments';
  end if;
  if to_regprocedure('private.is_admin(uuid)') is not null then
    raise exception 'Unexpected helper overload accepting a caller-supplied UUID';
  end if;
  if (select count(*) from pg_policies
      where schemaname = 'public' and tablename = 'admin_users') <> 1 then
    raise exception 'Unexpected admin_users policies; review potential permissive-policy bypass';
  end if;
end;
$test$;

insert into public.admin_users (user_id, role, is_active)
values
  (current_setting('app.test_member_uuid')::uuid, 'super_admin', true),
  (current_setting('app.test_other_uuid')::uuid, 'admin', true)
on conflict (user_id) do update set role = excluded.role, is_active = excluded.is_active;

-- Exercise a future content policy without creating a permanent content table.
create temporary table admin_access_probe (payload text);
insert into admin_access_probe values ('visible to active administrators only');
alter table admin_access_probe enable row level security;
alter table admin_access_probe force row level security;
grant select on admin_access_probe to authenticated;
create policy test_admin_content_access on admin_access_probe
  for select to authenticated using ((select private.is_admin()));

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
do $test$
begin
  begin
    perform * from public.admin_users;
    raise exception 'FAIL: anon unexpectedly read admin_users';
  exception when insufficient_privilege then null;
  end;
  begin
    perform private.is_admin();
    raise exception 'FAIL: anon unexpectedly executed private.is_admin';
  exception when insufficient_privilege then null;
  end;
end;
$test$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('app.test_member_uuid'), true);
select set_config('request.jwt.claims', json_build_object(
  'sub', current_setting('app.test_member_uuid'), 'role', 'authenticated')::text, true);
do $test$
begin
  if (select count(*) from public.admin_users) <> 1
     or exists (select 1 from public.admin_users
                where user_id <> auth.uid()) then
    raise exception 'FAIL: administrator can read another membership';
  end if;
  if exists (select 1 from public.admin_users
             where user_id = current_setting('app.test_other_uuid')::uuid) then
    raise exception 'FAIL: supplying another UUID bypasses own-row RLS';
  end if;
  if not private.is_admin() or (select count(*) from admin_access_probe) <> 1 then
    raise exception 'FAIL: active super_admin denied';
  end if;
  begin
    insert into public.admin_users (user_id, role)
    values (auth.uid(), 'super_admin');
    raise exception 'FAIL: browser role can insert membership';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.admin_users set role = 'super_admin', is_active = true
    where user_id = auth.uid();
    raise exception 'FAIL: browser role can update membership';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.admin_users where user_id = auth.uid();
    raise exception 'FAIL: browser role can delete membership';
  exception when insufficient_privilege then null;
  end;
end;
$test$;
reset role;

-- The same identity must be permitted in both other supported active roles.
update public.admin_users set role = 'admin'
where user_id = current_setting('app.test_member_uuid')::uuid;
set local role authenticated;
do $test$ begin
  if not private.is_admin() then raise exception 'FAIL: active admin denied'; end if;
end; $test$;
reset role;
update public.admin_users set role = 'editor'
where user_id = current_setting('app.test_member_uuid')::uuid;
set local role authenticated;
do $test$ begin
  if not private.is_admin() then raise exception 'FAIL: active editor denied'; end if;
end; $test$;
reset role;

update public.admin_users set is_active = false
where user_id = current_setting('app.test_member_uuid')::uuid;
set local role authenticated;
do $test$
begin
  if private.is_admin() or (select count(*) from admin_access_probe) <> 0 then
    raise exception 'FAIL: inactive administrator permitted';
  end if;
  if (select count(*) from public.admin_users) <> 1 then
    raise exception 'FAIL: own inactive membership must remain readable';
  end if;
end;
$test$;
reset role;

-- Remove fixture membership, then try user-editable role metadata.
delete from public.admin_users
where user_id = current_setting('app.test_member_uuid')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', current_setting('app.test_member_uuid'), 'role', 'authenticated',
  'user_metadata', json_build_object('role', 'super_admin', 'is_active', true)
)::text, true);
do $test$
begin
  if private.is_admin() or (select count(*) from public.admin_users) <> 0
     or (select count(*) from admin_access_probe) <> 0 then
    raise exception 'FAIL: ordinary user or user_metadata self-promotion permitted';
  end if;
end;
$test$;

-- No authenticated identity: helper returns false, never null or true.
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
do $test$ begin
  if private.is_admin() is distinct from false then
    raise exception 'FAIL: missing request identity must return false';
  end if;
end; $test$;
reset role;

rollback;
-- Reaching this result with no errors means all assertions passed.
select 'PASS: admin security assertions; all fixture changes rolled back' as result;
