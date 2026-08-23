# 22 — Repository Structure

## Recommended MVP structure

```text
tracknologia/
├── CONTEXT.md
├── README.md
├── package.json
├── package-lock.json
├── tsconfig.json
├── next.config.ts
├── components.json
├── eslint.config.mjs
├── Dockerfile
├── compose.yaml
├── .dockerignore
├── .env.example
├── proxy.ts
│
├── docs/
│   └── adr/
│
├── public/
│
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   ├── (public)/
│   │   │   ├── track/
│   │   │   └── p/[providerSlug]/request/
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   ├── register/
│   │   │   └── forgot-password/
│   │   └── (provider)/dashboard/
│   │       ├── repairs/
│   │       ├── requests/
│   │       └── settings/
│   │
│   ├── features/
│   │   ├── auth/
│   │   ├── providers/
│   │   ├── repair-requests/
│   │   ├── repairs/
│   │   ├── tracking/
│   │   └── analytics/
│   │
│   ├── components/
│   │   ├── ui/
│   │   └── shared/
│   │
│   └── lib/
│       ├── utils.ts
│       └── supabase/
│           ├── client.ts
│           └── server.ts
│
└── tests/
    └── e2e/
```

## Why `features/` instead of `modules/`

The architectural design still uses Modules, but `features/` communicates product capability more naturally in the repository.

Each feature should concentrate its own business knowledge instead of scattering it across global technical folders.

## Avoid global layer buckets

Do not begin with:

```text
src/services/
src/controllers/
src/repositories/
src/models/
src/dtos/
src/types/
src/validators/
src/store/
```

These tend to scatter one domain capability across many directories.

## Feature example

```text
src/features/repairs/
├── index.ts
├── commands.ts
├── queries.ts
├── schemas.ts
├── types.ts
├── persistence.ts
└── repairs.test.ts
```

Not every feature needs every file. Add files as complexity earns them.

Feature 03 currently uses this concrete boundary:

```text
src/features/repair-requests/
├── index.ts          # selective public Interface
├── commands.ts       # submit, accept, decline
├── queries.ts        # Provider-scoped list/detail
├── schemas.ts        # public/filter/id validation
├── types.ts
├── persistence.ts    # server-only Supabase mechanics
└── repair-requests.test.ts

src/features/repairs/
├── index.ts
├── commands.ts       # Request-origin creation seam only
├── schemas.ts
├── types.ts
├── persistence.ts
└── repairs.test.ts
```

Route-local forms/actions remain under the public Request and Provider Request
route trees. Repair Requests imports the Repairs Interface for acceptance;
Repairs does not import Repair Requests.

## Barrel policy

Use a selective `index.ts` only at a meaningful feature/Module seam.

Avoid a global barrel that re-exports all features or all components.

## `app/` responsibilities

Next.js routes/pages should own:

- URL/routing structure;
- rendering;
- framework-specific form/action adaptation;
- route-local UI.

They should not own ticket generation, status-transition rules, Request acceptance transactions, or Provider authorization.

## `lib/` responsibilities

Keep infrastructure helpers narrow:

```text
src/lib/utils.ts
src/lib/supabase/client.ts
src/lib/supabase/server.ts
```

Do not let `lib/` become a business-logic dumping ground.

## Proxy

Use root `proxy.ts` for current Next.js request-proxy/session-refresh responsibilities and coarse redirects. Authorization remains in feature Modules/RLS.
