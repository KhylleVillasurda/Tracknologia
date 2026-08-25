# Plan 02 — Durable Public-Operation Abuse Protection

**Plan type:** P1 security/reliability fix  
**Recommended branch:** `fix/security-public-abuse`  
**Authoritative source:** `02_SECURITY_AND_RELIABILITY_HARDENING.md` §A, `05_LOAD_RESILIENCE_AND_PERFORMANCE.md`

> Derived from the [Handoff Bundle](../handoff/00_POST_MVP_MASTER_HANDOFF.md). Shared guardrails, verification gates, and the multi-agent strategy live in [00_MASTER_INDEX_AND_DEPENDENCY_MAP.md](00_MASTER_INDEX_AND_DEPENDENCY_MAP.md#shared-execution-context); this file carries only plan-specific content.

## Objective

Add durable abuse protection to public seams without relying on process-memory state that disappears across instances or can be bypassed through direct Supabase access.

Public seams in scope:

```text
Repair Request submission
Tracking lookup
Tracking analytics observation
Auth registration/reset where abuse becomes materially relevant
```

## Baseline Areas

Existing feature Modules at the reviewed baseline:

```text
src/features/repair-requests/{commands,persistence,queries,schemas,types}.ts (+ repair-requests.test.ts)
src/features/tracking/{index,persistence,queries,schemas,types}.ts (+ tracking.test.ts)
src/features/analytics/{commands,index,persistence}.ts (+ analytics.test.ts)
src/features/auth/{context,services,persistence,schemas}.ts (+ auth.test.ts)
```

Also inspect the corresponding public `src/app` adapters and current Supabase grants/functions before choosing the enforcement seam.

## Architecture Decision Precondition

The handoff requires this property:

```text
direct public DB/RPC path cannot bypass control
```

The implementation must therefore choose an enforcement design where the public caller cannot simply skip the limiter. Preferred Tracknologia-compatible direction:

```text
Internet
-> public Next.js adapter derives trusted request metadata
-> durable rate-control operation
-> owning Feature Module
-> narrow DB operation
```

and revoke/avoid any anonymous database path that bypasses the protected application operation.

If a public Supabase RPC must remain directly callable, the rate control must execute inside that same durable operation with trustworthy key material. Do not ship an in-memory `Map`, singleton counter, or per-process limiter as the release control.

## Security Data Rules

- Never store raw Tracking Codes as abuse keys/log fields.
- Never store raw customer email/phone/request body merely for rate limiting.
- Use bounded opaque identifiers or irreversible digests where a durable key is required.
- Logs should identify operation, decision, bucket/window, and safe request correlation only.
- Malformed/unknown Tracking results remain neutral; rate limiting must not create an enumeration oracle.

## Implementation Phases

### Phase 1 — Inventory public entry points

For each operation, document:

```text
browser entry
Next.js adapter
Feature Interface
persistence call
DB/RPC/table grant
current anonymous permissions
```

Identify any direct browser-to-Supabase path and close or incorporate it into the durable control.

### Phase 2 — Define operation-specific policy

Create configurable thresholds for at least:

```text
repair_request_submit
tracking_lookup
tracking_observation
```

Auth registration/reset should be added only where the current application path exposes meaningful abuse risk; do not invent CAPTCHA as a default requirement.

Separate burst limits from sustained limits where needed. Keep threshold values in one server-side configuration seam rather than scattering constants across routes.

### Phase 3 — Durable persistence/enforcement

If using PostgreSQL-backed rate state, use one narrowly scoped relation/function only when required by the chosen design. It should support:

```text
operation identifier
opaque actor/request key
bounded time bucket/window
counter/decision state
expiry/cleanup strategy
```

Use an atomic increment/check so concurrent requests cannot overshoot materially due to a read-then-write race. Represent schema/function changes as forward migrations and apply least privilege.

If an existing platform edge limiter is selected instead, document how direct Supabase invocation is prevented and how the same acceptance tests prove bypass is impossible.

### Phase 4 — Feature/adapter integration

- Keep rate-policy semantics outside generic utilities where possible; public operation adapters call a small abuse-control seam before invoking the owning feature.
- Do not move Repair Request or Tracking business semantics into the limiter.
- Return `429`/bounded user-safe failure for limited requests.
- Tracking unknown/malformed responses must remain indistinguishable enough to avoid information leakage.

### Phase 5 — Analytics isolation

Tracking must still succeed if analytics observation fails. Rate control for telemetry must not make a successful Tracking read depend on analytics persistence.

### Phase 6 — Cleanup/retention

Define how durable rate-control rows expire or are periodically pruned. The solution must not create indefinite public-growth state without a retention rule.

## Test Matrix

Unit/module:

```text
threshold configuration validation
neutral Tracking behavior under malformed/unknown input
safe limited-response mapping
analytics failure remains non-fatal to Tracking
```

Real DB/security tests when DB enforcement is used:

```text
anonymous/direct DB path cannot bypass control
concurrent increments preserve threshold
cross-operation buckets do not interfere
expired bucket/window resets safely
no raw Tracking/customer credential persisted
```

Load tests:

```text
normal path below threshold remains fast
burst produces expected 429 behavior
100 -> 200+ short burst profile
Tracking 25 -> 50-100 concurrent profile
Request submit 10 -> 25-50 profile
```

## Likely Files

```text
src/features/repair-requests/**
src/features/tracking/**
src/features/analytics/**
src/features/auth/** only if auth abuse control is activated
corresponding src/app public adapters
supabase/migrations/<timestamp>_*.sql if DB enforcement is chosen
tests/integration/*
tests/e2e/* after Playwright exists
docs/security/testing/config documentation as applicable
```

## Acceptance Criteria

```text
[ ] no public DB/RPC bypass around the release limiter
[ ] malformed/unknown Tracking remains neutral
[ ] raw Tracking/customer data is absent from abuse logs/state
[ ] thresholds configurable server-side
[ ] concurrent/burst tests prove limits
[ ] normal public path remains within pilot latency target
[ ] analytics failure does not break Tracking
[ ] durable state has retention/cleanup behavior
```

## Non-Goals

- CAPTCHA unless evidence demonstrates need.
- Distributed caching infrastructure merely for rate limiting.
- Customer account creation.
- Generic API gateway redesign.
