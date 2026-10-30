# joemore.com Admin · v0.0.2

A local foundation for the joemore.com administration application: Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS v4, Lucide icons, and Supabase cookie-based authentication. The dark interface includes a responsive, collapsible sidebar, dashboard, account details, and configuration, loading, empty, and error states. Geist Sans and Geist Mono are loaded through `next/font` and served by the application.

This release adds a Cloudflare R2 Media Library to the authenticated workspace: paginated gallery/list views, direct and multipart uploads, client-generated WebP thumbnails, immutable public URLs, metadata editing, confirmed managed deletion, stale-session cleanup, and a separate read-only bucket browser. Start with the [Media Library setup guide](docs/media-library-setup.md) for the SQL, bucket-scoped token, runtime credentials, CORS policy, and first-upload checks. Content, analytics, registration, and membership management remain future features. The production workflow builds a container image; it does not install SQL, create accounts, configure servers, or configure Cloudflare.

## Local development

Use a supported Node.js 22 release or newer and npm. Run all commands from this directory:

```sh
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without Supabase environment variables, the login page explains the configuration steps and the dashboard remains protected. A real backend connection is unnecessary for lint, type checks, unit tests, or a production build.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start local Next.js development |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Generate route types and check TypeScript |
| `npm test` | Run the lightweight Node test suite through `tsx` |
| `npm run test:smoke` | Check anonymous redirects and private headers against a running local app |
| `npm run test:media-smoke` | Check anonymous denial across every Media API endpoint |
| `npm run build` | Produce the full server-rendered production application |
| `npm start` | Serve the production build on port 3000 |

Geist Sans and Geist Mono come from the official `geist` package through `next/font/local`. Both builds and browsers use local font files, without contacting Google Fonts. Dependency installation requires npm registry access.

The development and build scripts use Next.js's supported Webpack bundler. Turbopack's compiler socket is restricted in this local execution environment; this does not change the full SSR architecture.

## Environment variables

When ready to connect the app, create your own ignored local environment file:

```sh
cp .env.example .env.local
```

Set these values:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://api-supabase.joemore.com
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<YOUR_EXISTING_PUBLISHABLE_KEY>
```

Use the existing **publishable** API key from your self-hosted stack. It begins with `sb_publishable_` and is intended for public clients. The app checks its format to catch configuration mistakes; Supabase verifies that the key is valid. This format check never grants administrator access. Secret keys, legacy JWT keys, user-session JWTs and malformed values are rejected. Missing or invalid settings produce a configuration state instead of an initialization crash.

The application reads only `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Restart development after changes; rebuild production when changing `NEXT_PUBLIC_*` values because Next.js embeds them in browser bundles. Never put a `service_role` or `sb_secret_*` key in a public environment variable.

The Media Library requires `SUPABASE_SECRET_KEY` and the server-only R2 variables listed in [`.env.example`](.env.example). The secret is used only for protected internal media writes after a fresh user/admin check; browser clients cannot assign storage keys, ownership, or upload states. Browsing and metadata editing use the signed-in session and RLS. Add these secrets only to the trusted runtime environment, never Docker build arguments or public variables. The existing workspace still builds and runs without media credentials and shows a configuration-required state. Never commit credentials or log passwords, signed URLs, or session tokens. `.env*` files are ignored except `.env.example`.

### Connect to the existing self-hosted stack

This application uses the `sb_publishable_*` key from your updated self-hosted stack as `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The gateway must recognize the configured key. See [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys) and the [self-hosted key guide](https://supabase.com/docs/guides/self-hosting/self-hosted-auth-keys).

Use your existing publishable key in this optional read-only check:

```sh
curl --fail-with-body \
  -H 'apikey: <YOUR_EXISTING_PUBLISHABLE_KEY>' \
  https://api-supabase.joemore.com/auth/v1/settings
```

Expect Auth settings JSON and email authentication enabled. This checks the Auth gateway path; real sign-in and an authenticated membership read must also succeed. A gateway rejection may indicate a wrong key or URL. Check those against your existing stack without substituting a privileged key. No backend requests are made by the offline tests.

## Install the database foundation manually

No SQL has been applied to your Supabase instance. Review these files first. Back up the database and preferably test on a disposable Supabase database before installing on your server.

In your self-hosted **Supabase Studio → SQL Editor**, run each complete file separately as the trusted database administrator, in this order:

1. [`supabase/schemas/001_admin_users.sql`](supabase/schemas/001_admin_users.sql)
2. [`supabase/schemas/002_admin_access.sql`](supabase/schemas/002_admin_access.sql)
3. [`supabase/schemas/003_media_assets.sql`](supabase/schemas/003_media_assets.sql) — Media Library table, RLS, column privileges, and immutable storage identity. If steps 1–2 are already installed, run only step 3.

The scripts are transactional and intentionally fail if their application objects already exist. Inspect existing objects and ownership rather than blindly dropping or replacing them. Ensure `public` is available through the Data API and `private` is **not** an exposed schema. These scripts do not change your API configuration.

[`supabase/schemas/README.md`](supabase/schemas/README.md) documents privileges, installation assumptions, future policy usage, and the schema source of truth. Add future ordered change files after installation; do not maintain divergent copies of schema definitions in a second directory. There is no automatic migration runner in this release.

### Create the first administrator

1. In **Studio → Authentication → Users**, manually create your personal email/password user. Complete or confirm the email using Studio's trusted administrative controls as appropriate for your Auth setup. There is no registration screen in this app.
2. Copy the user's exact **Auth UUID** from that user's record. An email address is not a membership identity.
3. Open [`supabase/bootstrap.example.sql`](supabase/bootstrap.example.sql). Replace every `<YOUR_AUTH_USER_UUID>` placeholder with that UUID. Review the `INSERT` and verification `SELECT`, then execute them in Studio's SQL Editor as the trusted database administrator. Run the deactivation and reactivation examples separately when needed.
4. Supply the existing publishable key in your local `.env.local`, restart the application, and visit `/login`.
5. Sign in using the account you created. The dashboard should show your account and `super_admin` role.
6. Sign out. A fresh request to `/dashboard` must redirect to `/login`.
7. Sign in again. In the trusted SQL Editor, run the example's `is_active = false` update for **only your UUID**. Refresh `/dashboard`; access must be denied on the next server request.
8. Run the example's `is_active = true` update in the SQL Editor, verify the same membership row, and sign in or revisit `/dashboard`.

Membership must always be granted, revoked, or restored by trusted database administration. The browser cannot reactivate its account. Preserve access to Studio when testing account deactivation.

## Access and security model

`public.admin_users` uses the Auth UUID as its primary key and foreign key. It constrains `role` to `super_admin`, `admin`, or `editor`; all three active roles may enter this initial dashboard. Future features must explicitly define any narrower role requirements. Deleting an Auth user cascades their membership; deleting the user who granted membership clears `created_by`.

RLS is enabled and forced. Anonymous users receive no table privileges. Authenticated users receive `SELECT` only, and the policy exposes only the caller's membership row. Inactive users may still read their own row so that the application can deny access accurately. No browser role can insert, update, delete, or promote membership, including `super_admin`. Account metadata never determines authorization.

`private.is_admin()` takes no UUID and checks `auth.uid()` against an active, permitted membership. It uses `SECURITY INVOKER`, a pinned empty search path, qualified references, and caller RLS. No elevated definer privileges are needed. Only `authenticated` receives schema usage and function execution. Missing identities and inactive or absent memberships return false when called with permitted privileges; anonymous direct execution is denied. The membership policy does not call the helper, preventing recursive RLS. Future table policies can invoke the helper without exposing `private` through the Data API.

The server confirms identity with `supabase.auth.getUser()` and queries the current user's membership on each protected request. `src/proxy.ts` refreshes session cookies; it is not the authorization boundary. Dashboard pages check access themselves, and Server Actions validate their own inputs and access requirements. Future actions and Route Handlers must call the server access guard independently before accessing private data.

Private pages and authentication responses must remain dynamic and uncached. The app uses no-store requests and private response headers; a future reverse proxy or CDN must preserve these headers and bypass caching for authenticated routes and responses containing `Set-Cookie`. Do not wrap membership checks in persistent caches. See the [Supabase SSR security guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs).

Sign Out uses global scope to revoke the user's Supabase refresh sessions across devices and redirects to `/login` when successful. A backend failure produces an error instead of claiming revocation succeeded. Expired or missing sessions return to login; membership and connectivity failures deny access. Supabase access tokens already issued may remain valid until expiry after sign-out; membership deactivation is checked afresh for dashboard access.

## Project structure

```text
src/
  app/                  App Router pages, layouts, error/loading states
    auth/actions.ts     Email/password sign-in and sign-out Server Actions
  components/           Shared UI, admin shell, interactive forms/navigation
  lib/
    auth/               Verified identity and membership access checks
    supabase/           Configuration and separate browser/server clients
  proxy.ts              Session refresh and private response handling
supabase/
  schemas/              Ordered canonical schema SQL and access policies
  bootstrap.example.sql Manual first-administrator example
  tests/                Repeatable database security checks
tests/                  Local application unit tests
prompts/01.md            Original v0.0.1 brief
```

`/` leads to `/dashboard`. `/login` handles sign-in or missing configuration; `/access-denied` explains unavailable membership; `/connection-error` handles backend availability problems. Dashboard data stays behind the server access guard. Shared semantic color and typography tokens define the dark theme so a future light theme can reuse the same components.

## Verification

Run the local checks after changes:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

After building, start `npm start -- --hostname 127.0.0.1` in one terminal. In a second terminal, run `npm run test:smoke`. For a checkout without credentials, `npm run test:smoke -- --expect-configuration` also verifies the disabled sign-in setup state. This performs seven loopback HTTP checks without supplying a session. It does not test authenticated backend flows.

Unit tests use stubs rather than connecting to Supabase. They exercise configuration validation, form validation, and access decisions for signed-out users, missing/inactive memberships, permitted roles, and backend failures. They cannot establish that a real gateway, database policy, token refresh, or session revocation works on your installation.

The SQL assertions in [`supabase/tests/admin_security.sql`](supabase/tests/admin_security.sql) cover role impersonation, RLS, ownership of rows, missing and inactive memberships, denied membership writes, metadata self-promotion attempts, and the current-identity helper. Follow the prerequisites in [`supabase/schemas/README.md`](supabase/schemas/README.md): use two distinct existing test Auth UUIDs and run the complete script manually as `postgres` on a disposable Supabase database. It uses a transaction and rollback; do not treat rollback as permission to test against production.

Before using this with real data, manually verify actual sign-in, unauthenticated redirects, non-admin and inactive denial, successful active-admin access, sign-out, expired-session refresh, and loss of backend connectivity. No passing live integration results are claimed without those checks and configured credentials.

Local implementation verification passed: ESLint, strict TypeScript, offline unit tests, and the production build. The initial interface verification also passed all seven HTTP smoke checks including missing-configuration rendering. Desktop/mobile layouts and navigation were checked in a browser; the protected dashboard used a temporary display-only fixture outside application routes, removed after inspection. Core text colors and primary button states were checked for WCAG AA contrast. The SQL suite has been reviewed but has not been executed.

## Production start and future hosting

This is a full Next.js server application; `output: "standalone"` packages a minimal server for Docker without using a static export. To run it directly on a Node.js host, provide the environment securely, install the locked dependencies, then run:

```sh
npm ci
npm run build
npm start
```

Use HTTPS, preserve cookie and no-store headers, and configure an appropriate process manager and reverse proxy separately. Review Auth rate limits, session lifetime, allowed origins, backups, monitoring, and security updates before production use. Cloudflare Access may later add an outer layer; the application's server authorization and RLS remain necessary.

### GitHub Actions, GHCR, and Watchtower

The [production workflow](.github/workflows/prod.yml) follows the main website's approach: a push to `prod` builds a Node 24 Docker image, then publishes `ghcr.io/joemore/admin-joemore-com:prod` and the same image tagged with the full commit SHA. A manual workflow run is restricted to `prod`. It runs lint, type checking, unit tests, a production build, and an anonymous HTTP/static-assets smoke test inside the built container **before** either tag is pushed. The `prod` tag is pushed last so a failed build or smoke test cannot publish a broken update to Watchtower.

Before the first run:

1. In the admin GitHub repository, open **Settings → Secrets and variables → Actions → Secrets** and add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` using the existing URL and publishable key. If you previously configured the legacy anon-key secret, replace it with the publishable-key secret. Do not put a `service_role` or secret key in these settings. The workflow uses GitHub's automatically supplied `GITHUB_TOKEN` with package-write permission for GHCR.
2. Ensure the admin repository has a `prod` branch containing this workflow and the intended application changes, then push that branch. The repository did not have a `prod` branch when this workflow was prepared. The first push publishes the image. The **Run workflow** button is available once this workflow also exists on the default branch; choose `prod` for a manual run.
3. The server must already have an admin container created from `ghcr.io/joemore/admin-joemore-com:prod` and be included in Watchtower's monitoring. Watchtower updates a matching existing container; publishing an image does not create the initial container. If the GHCR package is private, the server and Watchtower also need credentials permitted to pull that package. Check any existing Watchtower label filters and registry authentication as part of the server's separate setup.
4. Confirm the workflow succeeds, the server pulls the new `:prod` image, and login plus the active administrator membership work against the configured Supabase instance. The workflow smoke test is offline and does not establish a real Supabase session.

The two `NEXT_PUBLIC_*` values are **public client configuration**. Next.js embeds them into the image and browser bundle during `next build`; changing only the running container's environment cannot update them. Change the repository Actions secrets and build/publish a new image when either value changes. The Docker build deliberately fails when these values are missing or fail the application's publishable-key format check. A private key or service-role key must never be passed as a build argument or public variable.

For a local Docker build, export those two public values in your shell first and run:

```sh
docker build --build-arg NEXT_PUBLIC_SUPABASE_URL --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY -t admin-joemore-com:local .
docker run --rm -p 127.0.0.1:3000:3000 admin-joemore-com:local
```

The workflow builds for the GitHub-hosted runner's default Linux architecture. If your server uses a different CPU architecture, configure a matching Buildx platform before publishing. GHCR package visibility and your server's container, reverse proxy, and Watchtower settings are managed separately.

Outstanding owner tasks are to configure the repository secrets and `prod` branch, confirm the publishable key and backend connection, install the reviewed SQL manually, create and bootstrap the personal administrator, and complete live authentication/database checks. No server configuration or live database changes are included.
