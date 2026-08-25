# Plan 03 — OWNER-Controlled Staff Offboarding

**Plan type:** P1 scope-valid missing feature/fix  
**Recommended branch:** `fix/staff-offboarding`  
**Authoritative source:** `02_SECURITY_AND_RELIABILITY_HARDENING.md` §B, `06_UAT_AND_PILOT_VALIDATION.md`

> Derived from the [Handoff Bundle](../handoff/00_POST_MVP_MASTER_HANDOFF.md). Shared guardrails, verification gates, and the multi-agent strategy live in [00_MASTER_INDEX_AND_DEPENDENCY_MAP.md](00_MASTER_INDEX_AND_DEPENDENCY_MAP.md#shared-execution-context); this file carries only plan-specific content.

## Objective

Add the narrow missing Provider behavior conceptually exposed as:

```text
Providers.removeStaffMember(membershipId)
```

The operation removes a `STAFF` membership from the caller's own Provider. It must not become a generic role-management or RBAC subsystem.

## Required Invariants

```text
caller is authenticated
caller role = OWNER
caller Provider = target membership Provider
target role = STAFF
target OWNER cannot be removed through this operation
cross-Provider target is denied/neutral
removed Staff immediately loses ProviderContext on subsequent requests
RLS denies removed Staff even if the application UI is bypassed
```

## Baseline Areas

```text
src/features/providers/commands.ts
src/features/providers/persistence.ts
src/features/providers/queries.ts
src/features/providers/types.ts
src/features/providers/index.ts
src/features/providers/providers.test.ts
src/features/auth/context.ts
Provider Team page/actions under src/app
provider_memberships RLS/functions in supabase/migrations
tests/integration/providers/auth DB coverage
```

## Implementation Phases

### Phase 1 — Feature Interface

Add a semantic command under Providers, not Auth:

```ts
removeStaffMember(input);
```

Input should be only the target membership identifier (plus optional injected client/test dependency according to existing patterns). The feature obtains trusted Provider context server-side; do not accept caller-supplied Provider ID as authorization truth.

### Phase 2 — Feature validation and authorization

Feature command flow:

```text
validate membershipId
-> require ProviderContext
-> require OWNER
-> invoke persistence
-> return deliberate success/failure
```

Do not expose whether an arbitrary cross-tenant membership exists. Map not-found/cross-tenant cases to a safe bounded result.

### Phase 3 — Durable removal operation

Use a direct delete with RLS only if one statement can durably prove all invariants. Otherwise use a narrow transaction/function that:

```text
locks/reads target membership
checks same Provider
checks target role STAFF
removes exactly that membership
```

PostgreSQL must independently prevent deleting an OWNER through this Staff-only operation and prevent cross-Provider deletion.

Decide whether the durable record should be hard-deleted or explicitly deactivated only by inspecting the current domain/audit requirements. The handoff requires loss of access, not a new membership-history model; do not invent a new offboarding-history table unless existing audit requirements demand it.

### Phase 4 — Team UI

- OWNER sees a remove action for Staff rows only.
- Never show the Staff removal action for OWNER rows.
- Require a clear confirmation because access loss is destructive from the user's perspective.
- Display safe success/error feedback.
- Revalidate Team/dashboard data after successful removal.

### Phase 5 — ProviderContext behavior

Verify `requireProviderContext`/equivalent derives membership on each relevant request and does not keep removed Staff authorized through stale process-global state. Request-local reuse is fine; cross-request authorization caching is not introduced by this feature.

## Tests

Module tests:

```text
OWNER can remove same-Provider STAFF
STAFF cannot remove another member
OWNER cannot remove OWNER through Staff operation
cross-Provider membership is denied/neutral
invalid membership id fails validation
```

Real DB/RLS:

```text
removed Staff no longer has provider_memberships row/active membership
removed Staff cannot read Provider-private tables
removed Staff cannot mutate Repairs/Requests
cross-Provider delete attempt fails
OWNER membership preserved
```

E2E:

```text
OWNER invites -> Staff accepts -> permitted access
-> OWNER removes -> Staff next protected navigation/action is denied
```

## Database Implications

A migration is required only if the existing grants/RLS cannot express the safe deletion/transaction. If adding a function, keep it narrow and `SECURITY DEFINER` with explicit `search_path`, revoke `PUBLIC`, and grant only authenticated execution.

## Acceptance Criteria

```text
[ ] OWNER can remove same-Provider STAFF
[ ] OWNER cannot remove an OWNER through this command
[ ] STAFF cannot perform offboarding
[ ] cross-Provider removal denied/neutral
[ ] removed Staff loses ProviderContext on subsequent request
[ ] removed Staff denied by RLS/direct DB path
[ ] Team UI surfaces safe feedback
[ ] Staff lifecycle E2E covers invite -> accept -> access -> remove -> denied
```

## Non-Goals

- Role editing/promotion/demotion.
- Technician assignments.
- Staff scheduling.
- Organization-wide RBAC engine.
- New historical membership domain unless separately approved.
