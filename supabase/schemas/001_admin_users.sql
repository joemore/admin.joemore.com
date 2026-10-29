-- v0.0.1 foundation, step 1 of 2. Run manually as postgres in Studio.
-- Deliberately fails if admin_users already exists: review existing objects first.
begin;

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null constraint admin_users_role_check
    check (role in ('super_admin', 'admin', 'editor')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index admin_users_created_by_idx
  on public.admin_users (created_by) where created_by is not null;

comment on table public.admin_users is
  'Trusted admin membership. Provision through database administration only; never from user metadata.';
comment on column public.admin_users.user_id is
  'Authoritative identity: the Supabase Auth UUID, never an email address.';

alter table public.admin_users enable row level security;
alter table public.admin_users force row level security;

-- Supabase installations may automatically grant broad table privileges.
-- Remove them before granting only the single browser operation we need.
revoke all privileges on table public.admin_users from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on table public.admin_users to authenticated;

create policy admin_users_read_own
  on public.admin_users
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- No INSERT, UPDATE or DELETE grants or policies, even for super_admin.
-- No helper call here: keeping this policy independent prevents recursion.
commit;
