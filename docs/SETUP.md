# Development Setup

This is the canonical setup guide for Tracknologia developers.

## Supported workflow

Docker is the default development environment so Windows and Linux developers use the same Node/runtime environment.

## Prerequisites

Required:

- Git
- Docker
- Docker Compose plugin

Recommended on Windows:

- WSL2
- Docker Desktop using the WSL2 backend

Node.js on the host is optional once Docker is configured.

### Verify

```bash
git --version
docker --version
docker compose version
```

## Clone

```bash
git clone <REPOSITORY_URL>
cd tracknologia
```

## Environment configuration

```bash
cp .env.example .env.local
```

PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Required values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon-or-publishable-key>
NEXT_PUBLIC_APP_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
PUBLIC_ABUSE_HMAC_SECRET=<at-least-32-random-characters>
PUBLIC_ABUSE_TRUSTED_PROXY_SECRET=<different-at-least-32-random-characters>
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only. It is required because public,
accountless operations (Tracking lookup, Tracking observation, Repair Request
submission) run under the service-role credential so the publishable key cannot
reach Postgres directly. Never expose it through a `NEXT_PUBLIC_*` variable or a
browser bundle. For local Supabase, `supabase status` prints the value.

`PUBLIC_ABUSE_HMAC_SECRET` creates opaque actor keys for the shared PostgreSQL
abuse control. Keep it server-only and identical across application instances.
Optional validated overrides are
`PUBLIC_ABUSE_TRACKING_LOOKUP_MAX`,
`PUBLIC_ABUSE_TRACKING_LOOKUP_WINDOW_SECONDS`,
`PUBLIC_ABUSE_REPAIR_REQUEST_MAX`, and
`PUBLIC_ABUSE_REPAIR_REQUEST_WINDOW_SECONDS`.

Production also requires a trusted ingress and a separate
`PUBLIC_ABUSE_TRUSTED_PROXY_SECRET`. The ingress must remove any incoming
`x-tracknologia-proxy-secret` and `x-tracknologia-client-ip` values, set the
client-IP header itself, inject the proof secret, and block direct access to the
Next.js upstream. Do not reuse the HMAC secret as the proxy proof secret. The
application rejects public operations in production when proof or client-IP
metadata is missing or invalid.

The local Docker setup exposes Next.js without that trusted ingress. Local
development opts into one shared abuse-control bucket by setting
`PUBLIC_ABUSE_SHARED_DEV_BUCKET=true` in `.env.local`; forwarding headers are
ignored, so spoofed values cannot evade the limit. Any environment without
that opt-in requires valid trusted-ingress proof and fails closed otherwise,
so staging must configure the same ingress contract as production.

`.env.local` must be ignored by Git.

## Start the application

First run:

```bash
docker compose up --build
```

Normal runs:

```bash
docker compose up
```

Application:

```text
http://localhost:3000
```

Stop:

```bash
docker compose down
```

## Dependency commands

Install repository dependencies from the lockfile:

```bash
docker compose run --rm web npm ci
```

Add a runtime dependency:

```bash
docker compose run --rm web npm install <package>
```

Add a development dependency:

```bash
docker compose run --rm web npm install -D <package>
```

Commit both `package.json` and `pnpm-lock.yaml` when dependencies change.

## Quality commands

```bash
docker compose run --rm web npm run lint
docker compose run --rm web npm test
docker compose run --rm web npx playwright test
docker compose run --rm web npm run build
```

## Supabase & Database Migrations

Each development environment connects to the Tracknologia Supabase project.

The application uses:

- Supabase Auth;
- PostgreSQL;
- Least-privilege RLS policies;
- `@supabase/supabase-js`;
- `@supabase/ssr`.

### Applying Migrations

1. Link to the development project (one time):
   ```bash
   npx supabase link --project-ref <project-ref>
   ```
2. Push migrations:
   ```bash
   npx supabase db push
   ```

Do not place service-role/secret keys in public browser environment variables.

Never commit `supabase/.temp/` CLI state.

## Native Node fallback

Docker is canonical. If a developer temporarily needs to run the application directly on the host, use the Node major version documented by the repository and run:

```bash
pnpm install
pnpm dev
```

A problem that occurs only outside the Docker environment is not sufficient evidence that the repository's canonical setup is broken.
