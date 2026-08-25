# Tracknologia Post-MVP Detailed Implementation Plans — Master Index

**Repository:** `Jacinth091/Tracknologia`  
**Reviewed release baseline:** `8fffcb52e50e74293dac6a328146aee216eb1701`  
**Integration branch:** `staging`  
**Target:** `v0.1.0 MVP / pilot`  
**Plan type:** implementation-plan bundle  
**Recommended branch:** `multiple fix/chore branches`  
**Authoritative source:** the complete [Handoff Bundle](../handoff/)

Derived from the [Handoff Bundle](../handoff/00_POST_MVP_MASTER_HANDOFF.md) and grounded against the reviewed repository baseline. Where an exact implementation detail is not fixed by the handoff, the plan marks it as a decision/precondition rather than pretending the source already decided it.

## Bundle Purpose

The source handoff describes a release-hardening process. This bundle decomposes that process into independently executable feature/fix/chore plans while preserving the original target: `v0.1.0` MVP/pilot at reviewed baseline `8fffcb52e50e74293dac6a328146aee216eb1701`.

## Recommended Dependency Order

| #   | Plan                                      | File                                                             | Depends on / coordination                                                             |
| --- | ----------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 01  | Release baseline / change control         | `01_RELEASE_GOVERNANCE_AND_CHANGE_CONTROL_PLAN.md`               | none                                                                                  |
| 02  | Durable public-operation abuse protection | `02_PUBLIC_OPERATION_ABUSE_PROTECTION_PLAN.md`                   | 01                                                                                    |
| 03  | Staff offboarding                         | `03_STAFF_OFFBOARDING_PLAN.md`                                   | 01                                                                                    |
| 04  | Auth/session reliability                  | `04_AUTH_SESSION_RELIABILITY_PLAN.md`                            | 01; coordinate with 03                                                                |
| 05  | Production config + email reliability     | `05_PRODUCTION_CONFIGURATION_AND_EMAIL_RELIABILITY_PLAN.md`      | 01                                                                                    |
| 06  | Invitation duplicate/retry policy         | `06_INVITATION_LIFECYCLE_IDEMPOTENCY_PLAN.md`                    | 03/05 context; Lead policy decision                                                   |
| 07  | Playwright E2E release suite              | `07_PLAYWRIGHT_E2E_RELEASE_SUITE_PLAN.md`                        | 02-06 behaviors stable enough to automate                                             |
| 08  | CI gates + DB test locality               | `08_CI_RELEASE_GATES_AND_DB_TEST_LOCALITY_PLAN.md`               | 07 for final Playwright promotion                                                     |
| 09  | Bug burn / controlled completion          | `09_BUG_BURN_AND_CONTROLLED_FEATURE_COMPLETION_PLAN.md`          | 01; runs throughout 02-11                                                             |
| 10  | Load/resilience/performance               | `10_LOAD_RESILIENCE_PERFORMANCE_AND_ANALYTICS_RETENTION_PLAN.md` | 02, core P1 fixes; preferably 07/08                                                   |
| 11  | UAT/accessibility/mobile/pilot            | `11_UAT_ACCESSIBILITY_MOBILE_AND_PILOT_PLAN.md`                  | 02-10 sufficiently stable                                                             |
| 12  | RC/deployment/migration/recovery          | `12_RELEASE_CANDIDATE_DEPLOYMENT_MIGRATION_AND_RECOVERY_PLAN.md` | all P0/P1 closed, 07-11 green                                                         |
| 13  | Post-deployment stabilization/hotfix      | `13_POST_DEPLOYMENT_STABILIZATION_AND_HOTFIX_PLAN.md`            | 12 deployed                                                                           |
| 14  | Release readiness go/no-go                | `14_RELEASE_READINESS_GO_NO_GO_PLAN.md`                          | evidence from all release-hardening plans; executed before final production promotion |

## Critical Path

```
01 governance
-> { 02 abuse protection | 03 Staff offboarding | 04 auth reliability
     | 05 production config/email | 06 invitation idempotency }   <- parallel once 01 lands
-> 07 Playwright suite
-> 08 CI release gates
-> 10 load/resilience
-> 11 UAT/pilot
-> 12 RC creation + fresh/upgrade rehearsal
-> 14 go/no-go evidence gate
-> 12 final production promotion
-> 13 stabilization
```

Plan 09 (bug burn) runs continuously in parallel and feeds bounded fixes back into the owning Module. Plan 14 is an evidence gate: use it before final production promotion and again to record the final release decision.

## Release Severity Contract

| Severity | Meaning                                                                          | Rule                       |
| -------- | -------------------------------------------------------------------------------- | -------------------------- |
| P0       | tenant escape, credential compromise, destructive corruption, critical data leak | stop release               |
| P1       | core workflow/security/reliability/deployment blocker                            | must close                 |
| P2       | important bounded defect                                                         | fix or Lead-approved defer |
| P3       | enhancement/future capability                                                    | post-release               |

## Shared Regression Policy

Normal change:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:run
pnpm build
```

Database/RLS/security/lifecycle/public operation:

```bash
pnpm db:reset
pnpm test:db
```

User-flow change:

```text
affected Playwright scenario once established
```

## Bundle-Level Non-Goals

Do not use release hardening to add inventory, POS, customer accounts, marketplace, ratings, multi-branch, advanced analytics, AI diagnosis, Staff scheduling/dispatch, or another new business Module unless Lead explicitly expands v0.1.0 scope.

## Shared Execution Context

The following blocks apply to every plan in this bundle; individual plan files reference this section instead of repeating them.

## Tracknologia Guardrails

Preserve the repository's established responsibility flow:

```text
src/app adapter
  -> owning src/features Module
  -> server-only persistence
  -> Supabase/PostgreSQL
```

Keep these constraints throughout implementation:

- `src/app` handles routing, transport, Server Actions/Route Handlers, redirects, and presentation adaptation only.
- Business behavior stays in the owning feature Module and is exposed through a small feature Interface.
- Zod validates untrusted server-side inputs.
- Supabase Auth owns identity/session mechanics; Tracknologia owns Provider authorization.
- PostgreSQL owns durable constraints, RLS, atomic transactions, locking, and race-safe invariant rechecks.
- Use an RPC only when transaction/concurrency/security boundaries genuinely require it.
- Do not add generic manager/service/repository layers merely for architectural appearance.
- Do not introduce Redis, Kafka, Elasticsearch, queues, microservices, Prisma, or another persistence framework without measured need and explicit approval.
- Do not introduce Customers, Devices, Branches, Technician entities, Inventory, Payments, Appointments, or other deferred domain scope.
- Shared/accepted database history is forward-only; any schema/RLS/function change must be represented as a versioned migration.

## Baseline Verification Gate

For ordinary code-only changes:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:run
pnpm build
```

For database/RLS/security/lifecycle/public-operation changes also run:

```bash
pnpm db:reset
pnpm test:db
```

For user-flow changes, run the affected Playwright scenario once the E2E harness exists. Never claim a check passed unless it actually ran at the exact candidate head.

## Multi-Agent Execution Strategy

Use a manager/worker loop when the runtime supports sub-agents.

```text
Manager (senior integrator) — medium reasoning effort
Workers (focused implementers) — high reasoning effort
```

The manager acts as the senior integrator: it freezes this plan's scope, decomposes the work into non-overlapping tasks, gives each worker the exact Tracknologia context and file ownership it needs, reviews every worker result, requests corrections, integrates only verified changes, and runs the final repository-wide gate. Workers implement narrowly scoped tasks and return changed files, behavior, tests run, results, blockers, and out-of-scope observations.

Manager loop:

```text
read authoritative plan + AGENTS.md
-> inspect current fixed point and relevant feature/routes/docs
-> decompose one coherent task
-> delegate to Luna High
-> worker implements + focused tests
-> manager inspects diff/evidence
-> correction loop if needed
-> integrate verified result
-> run periodic gates
-> continue until acceptance criteria pass
-> final full gate + handoff
```

Rules:

- Do not let concurrent workers edit the same files unless the manager explicitly serializes them.
- Do not convert this implementation pass into a second repository-wide review.
- Do not reopen settled architecture unless current implementation evidence proves the plan impossible.
- Record unrelated discoveries as `OUT-OF-SCOPE OBSERVATION`; do not expand scope automatically.
- After three unsuccessful correction attempts for the same task, classify it as an `IMPLEMENTATION BLOCKER` and continue independent work if safe.
- Final output is a Dev-to-Review handoff with exact candidate SHA and executed verification evidence.

---

## Source-to-Plan Mapping

```text
Part 01 Release Baseline -> Plan 01 + Plan 09
Part 02 Security/Reliability -> Plans 02-06
Part 03 Testing/E2E/CI -> Plans 07-08
Part 04 Bug Burn -> Plan 09
Part 05 Load/Resilience -> Plan 10
Part 06 UAT/Pilot -> Plan 11
Part 07 RC/Deployment -> Plan 12
Part 08 Stabilization -> Plan 13
Part 09 Readiness -> Plan 14
```
