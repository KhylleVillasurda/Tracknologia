# Tracknologia Post-MVP Development Handoff

**Repository:** `Jacinth091/Tracknologia`  
**Release integration branch:** `staging`  
**Reviewed baseline:** `8fffcb52e50e74293dac6a328146aee216eb1701`  
**Target:** `v0.1.0` MVP / pilot  
**State:** MVP Modules implemented; release hardening begins.

## Purpose

Tracknologia is no longer in normal feature-delivery mode. The next milestone is **Release 0.1 Hardening & Validation**.

```text
MVP implemented
  -> release baseline
  -> security/reliability hardening
  -> automated system verification
  -> bug burn + controlled feature completion
  -> load/resilience testing
  -> UAT/pilot simulation
  -> release candidate + hard freeze
  -> deployment rehearsal
  -> production
  -> stabilization
```

## Release severity

| Severity | Meaning                                                                          | Release rule               |
| -------- | -------------------------------------------------------------------------------- | -------------------------- |
| P0       | Tenant escape, credential compromise, destructive corruption, critical data leak | Stop release               |
| P1       | Core workflow/security/reliability/deployment blocker                            | Must close                 |
| P2       | Important but bounded/non-critical defect                                        | Fix or Lead-approved defer |
| P3       | Enhancement/future capability                                                    | Post-release               |

## Soft freeze — starts now

Allowed:

- bug/security/reliability fixes;
- scope-valid missing behavior;
- CI/testing/deployment work;
- required accessibility/UX fixes.

Do not automatically add:

- new domain processes or actors;
- new business Modules;
- large architecture rewrites;
- speculative infrastructure.

Every PR into `staging` must answer:

```text
Why must this change ship in v0.1.0?
Which Module/interface owns it?
What regression surface changes?
Which tests must rerun?
```

## Hard freeze

Begins after UAT and before RC approval.

Allowed: P0, P1, low-risk Lead-approved P2, release configuration fixes.

Rejected: normal features, redesigns, unrelated refactors, optional dependency churn.

## Existing branch model

```text
developer branch
 -> feature/** / fix/** / chore/**
 -> staging
 -> master
```

Recommended hardening branches:

```text
fix/security-public-abuse
fix/staff-offboarding
fix/auth-reliability
fix/<defect>

chore/e2e-release-gate
chore/ci-required-db-integration
chore/production-config
chore/load-test-harness
```

Use a new numbered `feature/NN/*` only when testing reveals a genuinely required scope-valid feature.

## Mandatory regression policy

This is the canonical regression list; parts below may summarize tiers but defer to it.

Normal change:

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:run
pnpm build
```

Database/RLS/security/lifecycle/public-operation change:

```text
pnpm db:reset
pnpm test:db
```

User-flow change:

```text
affected Playwright scenario
```

## Deployment-ready definition

Tracknologia is ready when:

```text
no unresolved P0/P1
durable public abuse protection
secure Staff offboarding
core E2E flows green
Database Integration required for release branches
fresh + upgrade migration rehearsal green
security/RLS regression green
pilot load acceptable
production config/email verified
backup/recovery understood
UAT has no core blockers
same RC passes two complete validation cycles
```

## Part index

1. `01_RELEASE_BASELINE_AND_CHANGE_CONTROL.md` — reach when opening the hardening milestone, triaging issues, or judging scope discovered mid-release
2. `02_SECURITY_AND_RELIABILITY_HARDENING.md` — reach before touching public seams, Staff membership, auth/session behavior, production config, or invitations
3. `03_TESTING_E2E_AND_CI_GATES.md` — reach when adding/changing E2E coverage, CI gates, or the database-test layout
4. `04_BUG_BURN_AND_FEATURE_CONTROL.md` — reach when fixing defects or deciding whether newly found behavior belongs in v0.1.0
5. `05_LOAD_RESILIENCE_AND_PERFORMANCE.md` — reach when building the load harness or evaluating any optimization
6. `06_UAT_AND_PILOT_VALIDATION.md` — reach when running UAT, accessibility, mobile, or pilot-simulation passes
7. `07_RELEASE_CANDIDATE_AND_DEPLOYMENT.md` — reach when cutting an RC, entering hard freeze, or rehearsing deployment
8. `08_POST_DEPLOYMENT_STABILIZATION.md` — reach after production deployment for monitoring and hotfix control
9. `09_RELEASE_READINESS_CHECKLIST.md` — reach for the final Lead go/no-go gate
