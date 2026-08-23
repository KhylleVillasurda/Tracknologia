# 17 — Testing Strategy

## Testing philosophy

The feature Module interface is the primary business test surface. Test domain behavior through the same interfaces called by Next.js adapters.

## Unit and module tests

Unit tests cover deterministic helpers and domain rules without a live database. Module tests exercise feature interfaces and their business behavior. These tests are fast and run as part of `pnpm test:run`.

### Auth / Provider Access

- authenticated user resolves correctly;
- one-person Shop owner resolves as valid Provider context;
- Independent owner resolves as valid Provider context;
- Provider A membership cannot authorize Provider B data;
- required role checks reject unauthorized membership.

### Providers

- create/update `SHOP` and `INDEPENDENT` profiles;
- separate person profiles from authorization memberships;
- public address is optional where allowed;
- supported Service Modes are persisted correctly;
- `OTHER` mode details can be recorded;
- duplicate/invalid Service Modes roll back the complete Provider onboarding operation;
- Service Mode replacement is atomic and direct table mutation is denied;
- accepting Requests can be enabled/disabled;
- Owners may change operating fields but cannot change Provider type or slug;
- Staff may update only their own person profile, not Provider configuration;
- staff invitation creation, one-way SHA-256 token hashing, single-use acceptance, and revocation;
- invitation detail lookup excludes private Provider contact information;
- public provider lookup by slug or ID queries `public_provider_profiles` projection only.

### Repair Requests

- public submission creates `SUBMITTED` Request;
- Request belongs only to selected Provider;
- accept creates exactly one Repair;
- repeated accept does not create duplicate Repair;
- decline creates no Repair;
- Provider can correct customer draft values on acceptance.

### Repairs

- direct creation records origin `PROVIDER_CREATED`;
- accepted Request records origin `CUSTOMER_REQUEST`;
- new Repair starts `IN_PROGRESS`;
- valid status transitions work;
- blocked/waiting states are optional;
- invalid transitions fail;
- status change appends Status Event;
- Customer Update can be added without status change;
- completion sets terminal state/timestamp.

### Tracking

- valid Tracking Code returns `PublicRepairView`;
- invalid code reveals no internal details;
- raw Repair/private fields cannot leak into output.

## Contract tests

Contract tests verify security-sensitive boundaries and stable feature contracts without requiring a live PostgreSQL instance. They complement unit and module tests by checking rules such as token hashing, public/private projection shape, and Provider invariants. They run as part of `pnpm test:run`.

## Real PostgreSQL / RLS integration tests

These tests run against the local Supabase PostgreSQL stack, not mocks or in-memory substitutes. They verify database constraints, transactions, permissions, and Row Level Security behavior that unit, module, and contract tests cannot prove.

Run `supabase db reset` before the suite when working locally, then run `pnpm test:db`.

Run against real PostgreSQL/Supabase-compatible behavior for:

- membership uniqueness;
- person profile (`provider_user_profiles`) separation;
- Service Mode uniqueness;
- Request Reference uniqueness;
- Tracking Code uniqueness;
- `repair_request_id` one-to-one constraint;
- Staff invitation single-use, non-expired, and non-revoked constraints;
- Staff invitation restricted strictly to `SHOP` providers in database transaction;
- User cannot acquire a second active provider membership in MVP;
- Atomic provider + initial owner + person profile creation;
- Atomic staff invitation acceptance + person profile + membership creation;
- Provider RLS isolation (hostile cross-tenant queries denied);
- Public projection RLS (anonymous cannot query private columns of `providers`);
- child Status Event/Update access isolation.

Any security-sensitive database change, including schema, RLS, policy, constraint, trigger, or RPC changes, requires the real PostgreSQL / RLS integration suite before completion.

## End-to-end tests with Playwright

### E2E 1 — Direct Repair

```text
Provider login
→ Create Repair
→ Repair starts IN_PROGRESS
→ Tracking Code generated
→ Customer tracks Repair
→ Provider adds update/status changes
→ READY
→ COMPLETED
```

### E2E 2 — Customer Request

```text
Customer opens Provider request page
→ submits Request
→ Provider reviews
→ verifies details
→ accepts
→ exactly one Repair created
→ tracking works
```

### E2E 3 — One-person Shop

A `SHOP` with one `OWNER` membership can perform the entire Provider workflow without separate technician/staff setup.

### E2E 4 — Independent Repairer

Independent Provider with Meetup/Home Service operates complete request/repair flow without a mandatory public shop address.

### E2E 5 — Cross-tenant attack

Provider A attempts direct URL/action access to Provider B Request and Repair and is denied by application rules and RLS.

## Required local and CI commands

CI and developers should run the same core commands:

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:run
pnpm test:db
pnpm build
supabase db reset
```

`pnpm test:db` targets `tests/integration/db.test.ts` and must run against a real local Supabase instance. `pnpm db:reset` is the package-script equivalent of `supabase db reset`.

Keep `pnpm-lock.yaml` committed to ensure dependency resolution consistency.
