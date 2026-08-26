# Plan 14 — v0.1.0 Release Readiness and Go/No-Go Gate

**Plan type:** Lead release gate/checklist  
**Recommended branch:** `staging -> master promotion`  
**Authoritative source:** `09_RELEASE_READINESS_CHECKLIST.md` plus all preceding handoff parts

> Derived from the [Handoff Bundle](../handoff/00_POST_MVP_MASTER_HANDOFF.md). Shared guardrails, verification gates, and the multi-agent strategy live in [00_MASTER_INDEX_AND_DEPENDENCY_MAP.md](00_MASTER_INDEX_AND_DEPENDENCY_MAP.md#shared-execution-context); this file carries only plan-specific content.

## Objective

Convert the source readiness checklist into the final evidence-based go/no-go gate. This plan does not implement new behavior; any failed item routes back to the owning implementation plan/defect.

## Evidence Packet

Before the release meeting, collect one immutable packet tied to the candidate SHA containing:

```text
candidate SHA and RC tag
open issue severity list
accepted P2 risks
required CI check URLs/results
full test command results
fresh migration rehearsal
upgrade migration rehearsal
load baseline summary
UAT summary
backup/recovery owner + procedure
production config validation result
trusted-ingress/public-abuse configuration evidence (Plan 12 rehearsal)
known limitations/release notes
```

## Gate 1 — Scope/Governance

```text
MVP Modules implemented
soft freeze completed
hard freeze active
all open issues severity assigned
no unresolved P0/P1
accepted P2 documented
```

## Gate 2 — Architecture

```text
src/app remains adapter
business behavior remains in src/features
feature Interfaces remain caller/test seams
no unjustified generic service stack
no dependency cycle introduced
```

## Gate 3 — Auth/Provider

```text
unauthenticated denied
missing membership fails closed
OWNER/STAFF behavior correct
cross-Provider denied
Staff offboarding works
removed Staff denied app + RLS
infrastructure failures distinct from logout
```

## Gate 4 — Provider Onboarding/Invitation

```text
Independent onboarding
Shop onboarding
secure Staff invite only
single-use/expiry/revocation/email binding
duplicate-active-invite policy
production email delivery
```

## Gate 5 — Repair Requests

```text
public submission
closed Provider rejection
unsupported Service Mode rejection
Provider isolation
accept -> exactly one Repair
decline -> no Repair
accept/decline races safe
durable abuse protection
```

## Gate 5A — Public Abuse/Ingress Contract

```text
service-role key, HMAC secret, and proxy proof secret validated in production
PUBLIC_ABUSE_SHARED_DEV_BUCKET not active outside local development
trusted ingress strips/overwrites internal headers and injects proof
direct upstream access unavailable
public Tracking lookup and Request submission verified through real ingress
budget denial observed after threshold
anon/authenticated direct RPC execution denied
```

## Gate 6 — Repairs

```text
direct + Request-origin creation
initial IN_PROGRESS
valid transitions/events/updates
COMPLETED terminal
cross-Provider mutation denied
concurrency regression green
```

## Gate 7 — Tracking/Analytics

```text
malformed/unknown neutral
allow-listed public projection
no private leakage
bounded updates
public rate protection
analytics failure isolated
no raw Tracking credential stored
telemetry retention/growth policy
```

## Gate 8 — Automated Verification

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:run
pnpm db:reset
pnpm test:db
pnpm build
```

Plus:

```text
Docker Build
core Playwright release suite
no release-critical flake
```

## Gate 9 — CI/Governance

```text
Branch Policy required
Verify required
Database Integration required
Docker Build required
Playwright required once proven reliable
master promotion staging-only
```

## Gate 10 — Load/Resilience

```text
dashboard/Tracking/Request load run
race bursts repeated
no connection exhaustion
no sustained lock backlog
p95/error acceptable
dependency failure drills passed
```

## Gate 11 — UAT

```text
Shop Owner
Shop Staff
Independent
Customer Request
Customer Tracking
hostile/cross-tenant
mobile
accessibility
```

## Gate 12 — Config/Migration/Recovery

```text
production Supabase
explicit HTTPS origin
production Resend
no test toggles
fresh migration rehearsal
upgrade rehearsal
backup available
restore/forward-fix understood
```

## Gate 13 — Candidate

```text
immutable rc.N
two consecutive green cycles
release notes ready
known limitations recorded
exact candidate deployed
production smoke green
v0.1.0 tag identifies production commit
```

## Decision Rule

```text
any unresolved P0/P1 -> NO-GO
missing mandatory migration/recovery evidence -> NO-GO
required check failing/skipped -> NO-GO
UAT core workflow blocker -> NO-GO
otherwise Lead decides GO with any explicit accepted P2 risks
```

## Final Approval Record

```text
Release decision:
Approved by:
Candidate commit:
RC tag:
Production release tag:
Accepted P2 risks:
```

## Acceptance Criteria

The plan is complete only when every checklist item has attached evidence or an explicit Lead-approved P2 defer. A blank checkbox is not evidence.
