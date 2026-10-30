# Admin security schema

Nothing here runs automatically. Application startup and `npm test` never apply SQL, create users, or contact a database. These files have not been executed against your Supabase instance.

## Source of truth and installation

`supabase/schemas/` is the only schema definition source. Run the numbered files **once, in order**, through Supabase Studio → SQL Editor using the trusted `postgres` database role:

1. `001_admin_users.sql` — membership table, constraints, indexes, grants, own-row SELECT policy and RLS.
2. `002_admin_access.sql` — private schema and current-identity helper.

Each file has its own transaction. If a file fails, roll back its transaction and investigate before continuing. The files deliberately stop on existing app objects rather than overwrite unknown definitions. Before installation, check whether `public.admin_users`, `private`, or `private.is_admin()` already exists. If `private` is shared, review it with your database administrator and adapt step 2 to reuse a safe schema or choose a dedicated name consistently; do not drop existing objects or blindly change shared grants. The application queries `public.admin_users` and does not depend on the helper schema name.

Confirm `public` is available through the Data API and `private` is **not** in the exposed schemas. No application or helper needs `private` exposed. The scripts do not modify Supabase server settings, global default privileges, other tables, or Auth configuration.

After an installation, treat numbered files as immutable history. Append reviewed, ordered SQL change files for future alterations and record which files have been applied per environment. Do not maintain a second set of divergent definitions in a migrations directory. If adopting Supabase CLI migrations later, perform a deliberate one-time baseline transition to one canonical history, rather than independently editing both directories.

## Identity and permissions

`user_id` is the primary key and references `auth.users(id)` with `ON DELETE CASCADE`: deleting an Auth user removes membership. `created_by` uses `ON DELETE SET NULL` so removing the provisioning user preserves other membership records. Role is constrained to `super_admin`, `admin`, or `editor`; active membership is required for dashboard access. All three roles are allowed into this foundation; future content operations must define their own role-specific permissions.

The `authenticated` database role has only SELECT access, limited by RLS to `auth.uid() = user_id`. This applies even to `super_admin`. An inactive member can still read their own membership, allowing the application to explain a denial. The browser cannot INSERT, UPDATE, DELETE, TRUNCATE, self-promote, or reactivate an account. The `anon` role has no table access. Table privileges and RLS are both enforced; no application secret key is used.

`private.is_admin()` takes no arguments and checks the current request's UUID, active status and allowed role. It uses `SECURITY INVOKER`: the caller's own-row RLS already supplies the needed information, so elevated execution is unnecessary. Its empty search path and qualified references avoid name shadowing. PUBLIC and anon execution are revoked; only authenticated execution is granted. With no request identity its result is false; a direct anon call is additionally denied at the privilege layer. Keep its use in future policies restricted to `TO authenticated`.

The membership SELECT policy does **not** call the helper, so there is no recursive RLS dependency. Do not replace that policy with `is_admin()`. Neither helper nor policy reads email or user-editable account metadata. A browser cannot set PostgreSQL request claims directly: the API gateway verifies its token and supplies them. Never add an RPC that lets clients supply arbitrary request claims or execute arbitrary SQL.

For a future content table, enable RLS, set explicit grants, then use a policy such as `FOR SELECT TO authenticated USING ((SELECT private.is_admin()))`. Define each write operation separately and test it; no future content table is created in v0.0.1.

## First administrator

1. Install both schema files as above.
2. In Studio → Authentication → Users, manually create your personal email/password account and confirm its email according to your Auth configuration. There is no registration UI in this application.
3. Copy the exact UUID from that Auth user. Do not use an email or metadata field as identity.
4. Open `supabase/bootstrap.example.sql`, replace `<YOUR_AUTH_USER_UUID>`, and run its INSERT and verification SELECT from the trusted SQL Editor. Review that only your intended account has `super_admin`. Run the INSERT once; duplicate membership intentionally fails for review.
5. Configure the application's publishable key, restart it, and sign in at `/login`. Refresh a protected page to verify server authorization.
6. Separately run the commented deactivation UPDATE for that exact UUID, then reload the dashboard. Access must be denied even while the Auth session remains valid.
7. Reactivate the same UUID with the commented reactivation UPDATE using the trusted SQL Editor; sign in again or reload as appropriate. The browser cannot perform this step.

Membership administration remains a trusted database operation in this release. Never paste an application secret key into browser code or use account metadata to grant a role.

## Repeatable verification

`supabase/tests/admin_security.sql` is a self-contained assertion suite with no testing extension dependency. **Run it manually on an isolated Supabase test database** after schema installation, as postgres. Supply two distinct, already-provisioned Auth UUIDs; the script creates no accounts or credentials. It temporarily upserts their membership rows and creates a temporary policy probe, impersonates `anon` and `authenticated`, then rolls everything back. Do not remove the final ROLLBACK or run just the setup portion. If any assertion fails, immediately ROLLBACK the aborted transaction; closing the SQL connection also rolls it back.

The suite checks RLS, grants, own-row visibility, active access for all supported roles, inactive/non-member denial, INSERT/UPDATE/DELETE denial, helper privileges, identity binding, metadata self-promotion and a future content policy. It fails rather than claiming success on unexpected results, including recursive-policy errors. SQL-editor role impersonation is available only to the trusted administrator; it is not an application API.

Also manually test real Auth and HTTP behavior with the configured application: invalid credentials, expired sessions, sign out, a non-member account, deactivation/reactivation, and loss of backend connectivity. SQL assertions do not validate the API gateway, key compatibility, cookies, or browser caching. These remain unverified until your backend and credentials are available.

References: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [function security](https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker), and [PostgreSQL privileges](https://www.postgresql.org/docs/current/ddl-priv.html).
