-- MANUAL EXAMPLE ONLY. This file is not an automatic migration.
-- First create your personal account in Supabase Studio > Authentication > Users,
-- then copy its exact UUID. Replace the placeholder before running this INSERT
-- as postgres in Studio > SQL Editor. No email or account metadata is used.

insert into public.admin_users (user_id, role, is_active, created_by)
values ('<YOUR_AUTH_USER_UUID>'::uuid, 'super_admin', true, null);

-- Deliberately no ON CONFLICT promotion: a duplicate requires manual review.
-- Verify only your intended account received membership:
select user_id, role, is_active, created_at, created_by
from public.admin_users
where user_id = '<YOUR_AUTH_USER_UUID>'::uuid;

-- Run these separately when testing revocation, then refresh the dashboard.
-- update public.admin_users set is_active = false
-- where user_id = '<YOUR_AUTH_USER_UUID>'::uuid;

-- Reactivate from the trusted SQL Editor; the browser cannot reactivate itself.
-- update public.admin_users set is_active = true
-- where user_id = '<YOUR_AUTH_USER_UUID>'::uuid;
