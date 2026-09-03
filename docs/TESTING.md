# Testing Strategy

Tracknologia prioritizes tests around business invariants and critical user flows.

## Layers

### Module tests — Vitest

Test feature interfaces directly without rendering UI where possible.

High-value examples:

- new Repair starts `IN_PROGRESS`;
- Provider cannot mutate another Provider's Repair;
- accepted Repair Request creates at most one Repair;
- declined Request creates no Repair;
- `COMPLETED` Repair rejects unsupported transitions;
- public tracking projection excludes private fields;
- successful Tracking records one minimal analytics observation;
- the Tracking action returns before an unresolved deferred Analytics task;
- Analytics failure does not log the credential/database detail.

### Component tests — React Testing Library

Use for interactive UI behavior where rendering adds value.

Avoid testing implementation details or Tailwind class strings unless they are functionally significant.

### End-to-end tests — Playwright

Run with `pnpm test:e2e` (or `pnpm exec playwright test`). The suite lives under
`tests/e2e/` and drives the real UI against the supplied Supabase project. It
sits on top of the module, contract, and integration layers; it does not replace
them.

Environment (see `.env.example` and the fixtures in `tests/e2e/helpers/`):

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — the
  public Supabase credentials of a **local** Supabase stack.
- `SUPABASE_SERVICE_ROLE_KEY` — required so fixtures can seed and clean up test
  actors/tenants. The fixtures refuse any host other than
  `localhost`/`127.0.0.1`/`::1`: destructive seeding is local/disposable-only,
  never production or shared mutable data. Start the stack with `supabase
start` and run `pnpm db:reset` before the suite.
- `E2E_BASE_URL` — the app URL. Defaults to the Playwright `webServer`
  (`http://localhost:3000`), which starts the app in dev mode (some flows, such
  as E2E-06 registering staff through the live form, require `runtime=local`).

Mandatory release scenarios (one spec file each under `tests/e2e/`):

1. `direct-repair.spec.ts` — Provider login, create Repair, `IN_PROGRESS`,
   tracking code, public customer tracking, status updates, `READY`,
   `COMPLETED`.
2. `customer-request.spec.ts` — public Provider page, submit Request, Provider
   accepts, exactly one `CUSTOMER_REQUEST` Repair starting `IN_PROGRESS`,
   tracking code, public Tracking through the real `/track` UI, and replay
   resistance (acceptance action is not available again and creates no second
   Repair).
3. `one-person-shop.spec.ts` — a single SHOP OWNER completes the full Repair
   workflow with no artificial technician requirement.
4. `independent-repairer.spec.ts` — Independent Provider registers and onboards
   through the real UI with Service Area + Meetup/Home Service, no mandatory
   shop address, then operates a normal non-shop-mode Repair.
5. `cross-tenant.spec.ts` — Provider A cannot read **or mutate** Provider B's
   protected data; B's durable Repair state is unchanged after A's attempts.
6. `staff-lifecycle.spec.ts` — OWNER invites, Staff accepts, gets permitted
   access, owner-only controls are denied, OWNER removes Staff, access is
   denied.

Reliability rules:

- Never use arbitrary sleeps; wait on observable application states.
- Each test owns and deterministically cleans up its data (fixtures seed and
  remove every actor/provider it creates).
- A flaky release-critical test is a defect, not something to normalize with
  rerun-until-green. Retries stay disabled (`retries: 0`); failure artifacts
  (trace/video/screenshot under `test-results/` plus the HTML report) are
  retained on the failing run itself and uploaded by the `E2E` workflow.

## Commands

```bash
pnpm test:e2e
```

Before merging a substantial change also run:

```bash
docker compose run --rm web npm run lint
docker compose run --rm web npm run build
```

## Real PostgreSQL / RLS integration tests

Run `supabase db reset` before `pnpm test:db` when working against a local
Supabase stack. `pnpm test:db` runs `vitest run tests/integration`, executing
all `*.db.test.ts` files:

```text
tests/integration/
  auth.db.test.ts              — Auth & public-operation RPC permissions
  providers.db.test.ts         — Provider isolation, onboarding, settings
  service-modes.db.test.ts     — Service Mode CRUD & Provider isolation
  invitations.db.test.ts       — Invitation lifecycle & staff offboarding
  repair-requests.db.test.ts   — RepairRequest lifecycle & Provider isolation
  repairs.db.test.ts           — Repair lifecycle & Provider isolation
  tracking.db.test.ts          — Public tracking & observation
  helpers/
    supabase-test-context.ts   — client setup, user/fixture lifecycle
    shared-test-utils.ts       — reusable DB fixture helpers
```

Any shared fixture logic lives in `tests/integration/helpers/` as a small test-only
seam, not a generic testing framework.

In CI, the database job pins the Supabase CLI, overrides only the generated
database port to `55432` to avoid runner collisions, retries startup once after
cleaning stale local Supabase state, and always stops the stack. This does not
change the normal local Supabase ports.

Feature 06 database coverage verifies `tracking_events` direct-access denial,
including over-128-byte neutral observation input, exact stored column shape,
repeated raw views versus distinct-Repair adoption, and both Repair origins. Apply
`20260825010000_add_tracking_analytics.sql` through a fresh reset before running
that coverage.

Plan 02 database coverage also verifies the durable public-operation limiter's
exact concurrent threshold, shared state across separate service clients,
operation isolation, expiry reset, bounded cleanup, opaque stored actor keys,
and denial of limiter/public-operation RPC execution to both `anon` and
authenticated roles.
