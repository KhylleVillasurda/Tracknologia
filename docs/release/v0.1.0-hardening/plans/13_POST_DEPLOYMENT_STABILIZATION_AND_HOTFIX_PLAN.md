# Plan 13 — Post-Deployment Stabilization and Hotfix Control

**Plan type:** production operations/hotfix process  
**Recommended branch:** `hotfix/<issue>`  
**Authoritative source:** `08_POST_DEPLOYMENT_STABILIZATION.md`

> Derived from the [Handoff Bundle](../handoff/00_POST_MVP_MASTER_HANDOFF.md). Shared guardrails, verification gates, and the multi-agent strategy live in [00_MASTER_INDEX_AND_DEPENDENCY_MAP.md](00_MASTER_INDEX_AND_DEPENDENCY_MAP.md#shared-execution-context); this file carries only plan-specific content.

## Objective

Treat production deployment as the start of operational validation, with immediate monitoring, controlled hotfixes, and strict staging/master reconciliation.

## First-Hour Runbook

Monitor:

```text
HTTP 5xx
unexpected 4xx
429/rate-limit behavior
Supabase/Auth failures
DB connections
slow queries
email failures
Tracking failures
Request failures
analytics growth
```

Repeat critical smoke flows manually against production using non-sensitive test data.

## First-Day Review

Review:

```text
onboarding failures
invite failures
Request submission rates/errors
Repair creation/status errors
Tracking success/errors
rate-limit events
database growth
support/user feedback
```

Logs must not contain raw Tracking credentials or unnecessary customer data.

## Incident Severity

### P0

```text
tenant breach
credential exposure
private-data leak
destructive corruption
```

Response:

```text
contain affected seam
preserve evidence
hotfix immediately
add security regression
create incident record
```

### P1

```text
core workflow outage
widespread auth failure
Request/Tracking outage
migration failure
Staff authorization defect
```

Immediate hotfix.

P2/P3 return to backlog unless impact escalates.

## Hotfix Flow

```text
hotfix/<issue>
-> staging
-> full affected validation
-> master
-> deploy
-> smoke
```

Never patch only `master` while leaving `staging` divergent.

If emergency SQL/config action is performed manually in production, immediately reconcile the exact change into version-controlled migration/configuration and verify staging equivalence.

## Rollback vs Forward Fix Decision

Rollback only when:

```text
previous app remains schema-compatible
failure is application-only
rollback is safer
```

Forward fix when:

```text
migration already changed preserved schema/data
old application incompatible
rollback increases inconsistency/risk
```

## Stabilization Window

For several days after release:

```text
pause major feature work
prioritize production defects
watch real load
watch abuse controls
watch DB/query behavior
watch analytics storage
```

Resume next feature milestone only after no unresolved production P0/P1 remains.

## Operational Documentation

Update the existing runbook/docs with incidents encountered, verified recovery steps, real production thresholds, and any accepted P2 operational risk. Do not create a duplicate runbook if a canonical operations document already exists.

## Acceptance Criteria

```text
[ ] no unresolved production P0/P1
[ ] error rate stable
[ ] DB integrity stable
[ ] abuse controls behave as expected
[ ] core journeys stable
[ ] emergency manual actions reconciled to repository
[ ] operational runbook updated
[ ] v0.2 backlog reprioritized from production evidence
```
