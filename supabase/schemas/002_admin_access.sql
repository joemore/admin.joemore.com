-- v0.0.1 foundation, step 2 of 2. Install after 001_admin_users.sql.
-- private must stay OUTSIDE the Data API's exposed schemas.
-- Deliberately fails if private already exists: review ownership/grants first.
begin;

create schema private;
revoke all privileges on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create function private.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select exists (
    select 1
    from public.admin_users as membership
    where membership.user_id = (select auth.uid())
      and membership.is_active
      and membership.role in ('super_admin', 'admin', 'editor')
  );
$function$;

-- Explicitly remove both default PUBLIC execution and possible direct defaults.
revoke all privileges on function private.is_admin() from public, anon, authenticated;
grant execute on function private.is_admin() to authenticated;

comment on function private.is_admin() is
  'Checks current request identity against active membership under caller RLS; no UUID argument or metadata authorization.';

-- SECURITY INVOKER is intentional: authenticated already has own-row SELECT.
-- auth.uid() is null without an identity, so EXISTS is false. anon additionally
-- has no EXECUTE grant. Do not use this helper in admin_users' own policies.
commit;
