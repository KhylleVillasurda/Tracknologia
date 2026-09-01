This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

# Tracknologia

Tracknologia is a lightweight electronics-repair lifecycle and customer-tracking platform for **repair shops** and **independent repairers**.

Providers can create repairs directly or accept customer-submitted Repair Requests. Once a Repair exists, Tracknologia gives the customer a tracking credential so they can view safe repair progress without creating an account.

## MVP goals

Tracknologia's MVP focuses on:

- repair-provider accounts and profiles;
- repair shops and independent repairers as equal Provider types;
- direct Repair creation by a Provider;
- customer Repair Requests sent to one specific Provider;
- structured device intake;
- lightweight repair states;
- customer-visible repair updates;
- accountless public tracking;
- provider isolation and role-aware authorization;
- real pilot usage and validation metrics.

The MVP intentionally does **not** include a repair marketplace, Google Maps discovery, inventory, payments, accounting, payroll, AI diagnosis, or a native mobile app.

## Technology stack

| Area                     | Technology                          |
| ------------------------ | ----------------------------------- |
| Web application          | Next.js App Router + React          |
| Language                 | TypeScript                          |
| Styling                  | Tailwind CSS                        |
| UI primitives            | shadcn/ui                           |
| Validation               | Zod                                 |
| Authentication           | Supabase Auth                       |
| Database                 | PostgreSQL via Supabase             |
| Database authorization   | PostgreSQL Row Level Security (RLS) |
| Development environment  | Docker + Docker Compose             |
| Module/component testing | Vitest + React Testing Library      |
| End-to-end testing       | Playwright                          |

### Intentionally not used for the MVP

- Express
- NestJS
- Axios
- React Router
- Prisma
- Redux / Zustand
- React Native / Expo

These can be reconsidered only when Tracknologia develops a requirement that justifies them.

---

# Quick start

## 1. Prerequisites

Install:

- Git
- Docker Desktop on Windows/macOS, or Docker Engine + Compose plugin on Linux

Node.js is optional for the normal Docker workflow. The repository's Dockerfile defines the Node runtime used by the project.

Verify:

```bash
git --version
docker --version
docker compose version
```

## 2. Clone the repository

```bash
git clone <REPOSITORY_URL>
cd tracknologia
```

## 3. Create local environment variables

Copy the example file:

```bash
cp .env.example .env.local
```

On PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Fill in the Supabase values:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Never commit `.env.local`.

Never expose a Supabase secret/service-role key through a `NEXT_PUBLIC_*` variable.

## 4. Start Tracknologia

```bash
docker compose up --build
```

Open:

```text
http://localhost:3000
```

After the initial build, normal startup is:

```bash
docker compose up
```

Stop the environment with:

```bash
docker compose down
```

## 5. Run commands inside the development container

Install/update dependencies:

```bash
docker compose run --rm web npm install
```

Run linting:

```bash
docker compose run --rm web npm run lint
```

Run module/component tests:

```bash
docker compose run --rm web npm test
```

Run end-to-end tests (requires the E2E environment — see `docs/TESTING.md`):

```bash
pnpm test:e2e
# or via Docker:
docker compose run --rm web npm run test:e2e
```

Create a production build:

```bash
docker compose run --rm web npm run build
```

---

# Repository structure

```text
tracknologia/
├── README.md
├── CONTEXT.md
├── CONTRIBUTING.md
├── Dockerfile
├── compose.yaml
├── .dockerignore
├── .env.example
├── package.json
├── package-lock.json
├── public/
├── docs/
│   ├── adr/
│   └── ...
├── tests/
│   └── e2e/
└── src/
    ├── app/
    ├── features/
    │   ├── auth/
    │   ├── providers/
    │   ├── repair-requests/
    │   ├── repairs/
    │   ├── tracking/
    │   └── analytics/
    ├── components/
    │   ├── ui/
    │   └── shared/
    └── lib/
        └── supabase/
```

## Source responsibilities

### `src/app/`

Next.js routing, layouts, pages, Server Actions, Route Handlers, and rendering adapters.

Business rules should not live directly in pages or actions.

### `src/features/`

Tracknologia's business capabilities. Each feature acts as a module with a small interface and hides its implementation.

Examples:

- `auth` — authenticated user, Provider context, membership and role checks;
- `providers` — Provider profile and supported service modes;
- `repair-requests` — submission, acceptance and decline behavior;
- `repairs` — Repair creation, querying, lifecycle rules and completion;
- `tracking` — restricted public tracking view;
- `analytics` — lightweight MVP/pilot instrumentation.

### `src/components/`

Reusable visual code. `ui/` contains shadcn primitives; `shared/` contains genuinely cross-feature UI.

### `src/lib/`

Infrastructure integration code. Keep this directory small. Supabase browser/server clients belong here.

## Dependency direction

```text
Next.js routes/UI
      |
      v
Tracknologia features
      |
      v
Persistence / Supabase adapter
      |
      v
PostgreSQL
```

Features must not depend on Next.js pages or React UI.

---

# Core domain model

```text
Supabase auth.users
        |
        v
provider_memberships
        |
        v
providers
   |             |
   v             v
repair_requests  repairs
                    |
          +---------+----------+
          |                    |
          v                    v
repair_status_events     repair_updates
```

A customer Repair Request is not yet a Repair. A Provider may also create a Repair without any Repair Request.

The normal Repair lifecycle is:

```text
IN_PROGRESS
   |
   +--> WAITING_FOR_PARTS ----+
   |                          |
   +--> AWAITING_APPROVAL ----+
   |                          |
   +<-------------------------+
   |
   v
READY
   |
   v
COMPLETED
```

The waiting states are optional, Provider-selected states rather than mandatory stages.

---

# Security baseline

Tracknologia uses layered security:

```text
Supabase Auth
    -> Tracknologia authorization
    -> PostgreSQL RLS
    -> restricted feature interfaces
```

Required principles:

- Supabase handles authentication/session identity.
- Tracknologia handles Provider membership, roles, ownership and business permissions.
- RLS provides database-level Provider isolation.
- Server Actions and Route Handlers must still authorize every mutation.
- Zod validates untrusted input on the server.
- Public tracking returns a restricted `PublicRepairView`, never a complete Repair row.
- Database/server implementation files should be server-only.
- Privileged Supabase keys must never reach browser code.

See [`docs/SECURITY.md`](docs/SECURITY.md).

---

# Documentation

Start with [`docs/README.md`](docs/README.md).

Recommended reading order for developers:

1. [`CONTEXT.md`](CONTEXT.md) — canonical domain vocabulary
2. [`docs/SETUP.md`](docs/SETUP.md) — detailed workstation/project setup
3. [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — day-to-day workflow
4. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — source and module design
5. [`docs/DATABASE.md`](docs/DATABASE.md) — initial relational model
6. [`docs/SECURITY.md`](docs/SECURITY.md) — security model
7. [`docs/TESTING.md`](docs/TESTING.md) — testing expectations
8. [`CONTRIBUTING.md`](CONTRIBUTING.md) — contribution workflow
9. `docs/adr/` — accepted architecture decisions

---

# Project status

Tracknologia is currently an MVP-oriented student product under active design and implementation. Scope should remain deliberately constrained: new dependencies, tables, modules, and workflows must solve a demonstrated Tracknologia requirement rather than anticipated future complexity.
