# Plan 04 — Authentication and ProviderContext Reliability

**Plan type:** P1 reliability fix  
**Recommended branch:** `fix/auth-reliability`  
**Authoritative source:** `02_SECURITY_AND_RELIABILITY_HARDENING.md` §C

> Derived from the [Handoff Bundle](../handoff/00_POST_MVP_MASTER_HANDOFF.md). Shared guardrails, verification gates, and the multi-agent strategy live in [00_MASTER_INDEX_AND_DEPENDENCY_MAP.md](00_MASTER_INDEX_AND_DEPENDENCY_MAP.md#shared-execution-context); this file carries only plan-specific content.

## Objective

Make authentication/session failures explicit and safe while avoiding repeated ProviderContext resolution in the same server request where practical.

Required error classes from the source:

```text
UNAUTHENTICATED
NO_MEMBERSHIP
UNAUTHORIZED_ROLE
AMBIGUOUS_PROVIDER_CONTEXT
INFRASTRUCTURE_FAILURE
```

Infrastructure failure must never be rendered as if the user simply logged out.

## Baseline Areas

```text
src/features/auth/context.ts
src/features/auth/services.ts
src/features/auth/persistence.ts
src/features/auth/types.ts
src/features/auth/index.ts
src/features/auth/auth.test.ts
protected layouts/pages/actions in src/app
public accountless routes
```

## Implementation Phases

### Phase 1 — Model deliberate outcomes

Inspect current thrown errors/redirect behavior and introduce the smallest typed/discriminated outcome needed to preserve the five distinctions above. Do not introduce a generic enterprise error framework.

### Phase 2 — ProviderContext resolution

- Resolve Supabase identity/session first.
- Query Provider membership and role exactly once per server request where the same request path uses it repeatedly.
- Use request-local memoization supported by the installed Next.js version only after reading its local documentation.
- Do not introduce Redis or cross-request ProviderContext caching.
- Multiple memberships remain an explicit `AMBIGUOUS_PROVIDER_CONTEXT`, not an arbitrary first-row choice.

### Phase 3 — Public-route separation

Public Provider pages, Request submission, and Tracking should not perform authenticated ProviderContext work unless they actually need an optional session-specific behavior. Remove accidental auth work from public paths where found.

### Phase 4 — Adapter behavior

Map deliberate outcomes consistently:

```text
UNAUTHENTICATED -> login/401 behavior appropriate to route
NO_MEMBERSHIP -> onboarding/no-membership flow
UNAUTHORIZED_ROLE -> 403/safe UI result
AMBIGUOUS_PROVIDER_CONTEXT -> fail closed + actionable support/error state
INFRASTRUCTURE_FAILURE -> temporary failure; preserve session; do not imply logout
```

Do not leak raw Supabase/Postgres error messages to end users.

### Phase 5 — Observability

Log safe infrastructure-failure diagnostics with correlation metadata while excluding credentials, tokens, Tracking Codes, and unnecessary customer data.

## Tests

Module:

```text
no user -> UNAUTHENTICATED
user without membership -> NO_MEMBERSHIP
wrong role -> UNAUTHORIZED_ROLE
multiple memberships -> AMBIGUOUS_PROVIDER_CONTEXT
Supabase membership query failure -> INFRASTRUCTURE_FAILURE
```

Adapter/integration:

```text
infrastructure failure does not clear session or redirect as logout
public accountless routes do not require ProviderContext
removed Staff resolves NO_MEMBERSHIP/denied after offboarding
```

Performance regression:

Measure a representative dashboard request before/after and confirm repeated ProviderContext work is reduced without cross-request stale authorization.

## Acceptance Criteria

```text
[x] five required auth/context outcomes remain distinguishable
[x] infrastructure failure is never represented as logout
[x] ambiguous membership fails closed
[x] public accountless routes avoid unnecessary auth resolution
[x] request-local context reuse is used where practical and safe
[x] no new distributed cache
[x] tests cover each outcome
```
