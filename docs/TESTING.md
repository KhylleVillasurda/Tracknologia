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

Critical flows:

1. Provider authentication -> create Repair -> receive tracking code -> customer tracks Repair.
2. Customer submits Repair Request -> Provider accepts -> Repair created -> customer tracks Repair.
3. Provider tenant isolation across protected routes/actions.

## Commands

```bash
docker compose run --rm web npm test
docker compose run --rm web npx playwright test
```

Before merging a substantial change also run:

```bash
docker compose run --rm web npm run lint
docker compose run --rm web npm run build
```

## Real PostgreSQL / RLS integration tests

Run `supabase db reset` before `pnpm test:db` when working against a local
Supabase stack.

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
