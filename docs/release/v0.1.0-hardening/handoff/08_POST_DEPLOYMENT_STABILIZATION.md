# Part 08 — Post-Deployment Stabilization and Hotfix Process

> Shared release context (repository, reviewed baseline, branch model, severity contract): see [00_POST_MVP_MASTER_HANDOFF.md](00_POST_MVP_MASTER_HANDOFF.md).

## Objective

Treat deployment as the start of operational validation, not the end of engineering work.

## First hour

Monitor:

```text
HTTP 5xx
unexpected 4xx
429/rate-limit behavior
Supabase/Auth failures
database connections
slow queries
email failures
Tracking failures
Request failures
analytics growth
```

Repeat critical smoke flows manually.

## First day

Review:

```text
onboarding failures
invite failures
Request submission rate/errors
Repair creation/status errors
Tracking success/errors
rate-limit events
database growth
support/user feedback
```

Logs must avoid raw Tracking credentials and unnecessary customer data.

## Production severity

P0:

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
security regression
incident record
```

P1:

```text
core workflow outage
widespread auth failure
Request/Tracking outage
migration failure
Staff authorization defect
```

Response: immediate hotfix.

P2/P3 returns to normal backlog unless impact escalates.

## Hotfix path

```text
hotfix/<issue>
 -> staging
 -> full affected validation
 -> master
 -> deploy
 -> smoke
```

Do not fix only `master` and leave `staging` divergent.

If emergency production action is performed manually, reconcile it immediately into version-controlled code/migrations.

## Rollback vs forward fix

Rollback when:

```text
previous application remains schema-compatible
failure is application-only
rollback is safer
```

Forward fix when:

```text
migration already changed preserved schema/data
old application is incompatible
rollback would create more inconsistency
```

## Stabilization window

For several days:

```text
pause major new feature work
prioritize production defects
watch actual load
watch abuse controls
watch query/DB behavior
watch analytics storage
```

Only begin the next feature milestone after no unresolved production P0/P1 remains.

## Exit gate

```text
[ ] no unresolved production P0/P1
[ ] error rate stable
[ ] database integrity stable
[ ] abuse controls behave as expected
[ ] core user journeys stable
[ ] operational runbook updated
[ ] v0.2 backlog reprioritized using production evidence
```
