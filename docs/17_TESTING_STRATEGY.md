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
- Service Mode replacement is atomic, serialized per Provider, and direct table mutation is denied;
- accepting Requests can be enabled/disabled;
- Owners may change operating fields but cannot change Provider type or slug;
- Staff may update only their own person profile, not Provider configuration;
- direct Provider/person-profile writes cannot bypass durable database bounds;
- staff invitation creation, one-way SHA-256 token hashing, single-use acceptance, and revocation;
- invitation detail lookup excludes private Provider contact information;
- public provider lookup by slug or ID queries `public_provider_profiles` projection only.

### Repair Requests

- Zod accepts bounded optional Request context and rejects invalid contact,
  oversized, or inconsistent Service Mode input;
- public submission creates `SUBMITTED` Request;
- invalid/closed Provider and unsupported Service Mode submissions fail;
- anonymous callers cannot read Request rows directly;
- Request belongs only to selected Provider;
- Provider A cannot list or act on Provider B Request;
- list validation accepts positive pages and rejects unsafe page values;
- pagination fetches one look-ahead row, derives Previous/Next correctly, and
  queries beyond the former 100-row cap;
- accept creates exactly one Repair;
- concurrent/repeated accept does not create duplicate Repair;
- concurrent accept versus decline commits exactly one terminal outcome;
- accept-after-decline and decline-after-accept preserve the winning state;
- decline creates no Repair;
- accepted/declined Request cannot be processed again;
- Provider can correct customer draft values on acceptance;
- accepted Repair uses `CUSTOMER_REQUEST`, begins `IN_PROGRESS`, and has one
  initial `NULL -> IN_PROGRESS` Status Event.

Feature-local validation coverage lives in
`src/features/repair-requests/repair-requests.test.ts` and
`src/features/repairs/repairs.test.ts`. Database/RLS behavior is covered in
`tests/integration/repair-requests.db.test.ts` and
`tests/integration/repairs.db.test.ts`.

### Repairs

- direct creation records origin `PROVIDER_CREATED`;
- accepted Request records origin `CUSTOMER_REQUEST`;
- new Repair starts `IN_PROGRESS`;
- valid status transitions work;
- blocked/waiting states are optional;
- invalid transitions fail;
- status change appends Status Event;
- Customer Update can be added without status change;
- completion sets terminal state/timestamp;
- shared direct/request/detail schemas enforce durable snapshot bounds;
- detail edits preserve a recorded Service Mode when it is omitted and allow
  only an explicit clear or a currently configured replacement;
- list search accepts common punctuation while safely quoting/escaping raw
  PostgREST filter values, and pages remain stable;
- the aggregate `WAITING` filter returns both waiting states only;
- immutable Repair identity/lifecycle columns reject direct authenticated
  updates;
- concurrent same-Repair transitions serialize to one durable outcome;
- Provider A cannot read, edit, transition, or append updates to Provider B's
  Repair;
- Customer Updates are append-only and direct Status Event writes remain
  denied.

Feature-local validation and lifecycle coverage lives in
`src/features/repairs/repairs.test.ts`. Feature 04 PostgreSQL/RLS cases extend
`tests/integration/repairs.db.test.ts` and require the
`20260824023000_complete_repairs.sql` and
`20260824024000_harden_repair_service_mode_updates.sql` migrations.

### Tracking

- valid lowercase/whitespace-padded Tracking Code normalizes and returns
  `PublicRepairView`;
- malformed and unknown codes both return `null`/neutral not-found behavior;
- raw input over 128 characters returns `null` before the public RPC is called;
- strict projection parsing rejects unexpected fields or more than 25 Updates;
- all five Repair statuses receive stable customer-facing semantics;
- READY wording remains Provider-neutral across every Service Mode;
- raw Repair/private fields cannot leak into output.

Feature-local coverage lives in `src/features/tracking/tracking.test.ts` and
runs with `pnpm test:run`. Real function grants, raw-table denial, projection
shape, both Repair origins, closed-Provider continuity, Update ordering/cap,
and activity timestamps extend `tests/integration/tracking.db.test.ts` and require
`20260824030000_add_public_tracking_lookup.sql`.

### Analytics

- the `/track` Server Action schedules a successful observation with Next.js
  `after()` and returns before an unresolved Analytics task starts;
- malformed, unknown, unavailable, or invalid public projections schedule
  nothing;
- persistence failure returns `false` and uses a sanitized log inside the
  deferred task;
- analytics payloads contain no Repair/customer snapshot or Tracking
  credential.

Route-adapter coverage lives in `src/app/(public)/track/actions.test.ts`;
feature-local coverage lives in `src/features/analytics/analytics.test.ts` and
`src/features/tracking/tracking.test.ts`.
Real table grants/RLS, bounded neutral RPC behavior, repeated raw views,
distinct-Repair adoption, both Repair origins, and stored column shape extend
`tests/integration/tracking.db.test.ts` and require
`20260825010000_add_tracking_analytics.sql`.

## Contract tests

Contract tests verify security-sensitive boundaries and stable feature contracts without requiring a live PostgreSQL instance. They complement unit and module tests by checking rules such as token hashing, public/private projection shape, and Provider invariants. They run as part of `pnpm test:run`.

## Real PostgreSQL / RLS integration tests

These tests run against the local Supabase PostgreSQL stack, not mocks or in-memory substitutes. They verify database constraints, transactions, permissions, and Row Level Security behavior that unit, module, and contract tests cannot prove.

Run `supabase db reset` before the suite when working locally, then run `pnpm test:db`.

Run against real PostgreSQL/Supabase-compatible behavior for:

- membership uniqueness;
- person profile (`provider_user_profiles`) separation;
- Service Mode uniqueness;
- standalone Service Mode replacement rollback and same-Provider concurrency;
- Staff denial for Provider settings and Service Modes;
- Staff own-profile permission and other-profile denial;
- durable Provider/person-profile size and device-cardinality constraints;
- Request Reference uniqueness;
- public Request submission projection and direct-table denial;
- closed Provider and unsupported Service Mode rejection;
- Provider Request read/decision isolation;
- Provider Request pagination returns 25, 25, and 10 rows for 60 matching
  Requests with stable ordering and no cross-Provider leakage;
- cross-Provider acceptance and decline both return not-found behavior without
  creating a Repair or Status Event;
- Tracking Code uniqueness;
- `repair_request_id` one-to-one constraint;
- atomic Request acceptance plus initial Status Event;
- concurrent accept-versus-accept and accept-versus-decline serialization;
- opposite-terminal retries preserve the original terminal outcome;
- Staff invitation single-use, non-expired, and non-revoked constraints;
- Staff invitation restricted strictly to `SHOP` providers in database transaction;
- User cannot acquire a second active provider membership in MVP;
- Atomic provider + initial owner + person profile creation;
- Atomic staff invitation acceptance + person profile + membership creation;
- Provider RLS isolation (hostile cross-tenant queries denied);
- Public projection RLS (anonymous cannot query private columns of `providers`);
- child Status Event/Update access isolation;
- direct Provider creation plus initial `NULL -> IN_PROGRESS` event;
- allow-listed Repair detail update versus protected identity/lifecycle
  columns;
- historical Repair Service Mode preservation after Provider configuration
  removal;
- direct unsupported Repair mode replacement denial with durable-state
  preservation;
- Repair mode edit versus Provider Service Mode replacement serialization;
- punctuation-safe Repair search and aggregate Waiting filtering;
- every allowed and rejected Repair transition;
- completion timestamp consistency and reopening denial;
- same-Repair transition concurrency under row locking;
- append-only Customer Update permissions and status independence.
- service-role Tracking RPC returns the exact allow-listed projection;
- malformed/unknown Tracking Codes reveal the same empty database result;
- public Tracking returns the latest 25 Update message/timestamp pairs only;
- direct and Request-origin Repairs share the same public behavior;
- existing Repair Tracking survives Provider Request closure;
- anonymous raw Repair, Update, and Status Event reads remain denied.
- anonymous and authenticated direct execution of the public-operation RPCs
  (`lookup_public_repair`, `record_successful_tracking_view`,
  `submit_repair_request`, and the abuse-control function) remains denied;
- concurrent public-operation requests preserve the configured threshold;
- expired abuse-control windows reset and cleanup stays bounded;
- persisted abuse-control rows contain no raw identifiers;
- anonymous and authenticated direct `tracking_events` access remains denied;
- malformed/unknown telemetry RPC inputs insert nothing and reveal no detail;
- direct telemetry RPC input over 128 bytes inserts nothing and returns no
  existence detail;
- repeated valid observations create raw views while distinct Repair adoption
  remains one;
- direct and Request-origin Repairs can both record successful views;
- telemetry rows contain only id, Repair correlation, and observation time.

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

`pnpm test:db` targets `tests/integration/*.db.test.ts` (split by Module:
auth, providers, repair-requests, repairs, tracking, service-modes, invitations)
with shared helpers in `tests/integration/helpers/`. It must run against a real
local Supabase instance. `pnpm db:reset` is the package-script equivalent of
`supabase db reset`.

When a branch adds pending migrations, run the release-like upgrade rehearsal before pushing:

```text
pnpm rehearse:migrations
```

`scripts/rehearse-pending-migrations.sh` boots a scratch Supabase lab on offset ports, applies only the shared (base) migration history, then applies exactly the branch's pending migrations (`supabase db push --local` on the lab) and runs the full `tests/integration/` suite against the upgraded lab. It fails if any already-shared migration was edited (forward-only enforcement). "Rehearsal B" evidence for the release plan.

Keep `pnpm-lock.yaml` committed to ensure dependency resolution consistency.
