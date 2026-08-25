# Part 03 — Testing, E2E, and CI Release Gates

> Shared release context (repository, reviewed baseline, branch model, severity contract): see [00_POST_MVP_MASTER_HANDOFF.md](00_POST_MVP_MASTER_HANDOFF.md).

## Objective

Prove that Modules compose into working user journeys and make release-critical verification mandatory.

## Existing layers to preserve

```text
Module/unit tests
contract tests
real PostgreSQL/RLS integration tests
```

Add E2E above them; do not replace lower-level tests.

## Establish Playwright

Required:

```text
@playwright/test
playwright.config.*
tests/e2e/
repeatable disposable test environment
fixture/reset strategy
CI browser install
failure artifacts
```

## Mandatory E2E flows

### 1 — Direct Repair

```text
Provider login
-> create Repair
-> IN_PROGRESS
-> Tracking Code
-> customer tracks
-> Provider Update/status changes
-> READY
-> COMPLETED
```

### 2 — Customer Request

```text
public Provider page
-> submit Request
-> Provider reviews
-> accept
-> exactly one CUSTOMER_REQUEST Repair
-> Tracking works
```

### 3 — One-person Shop

Shop OWNER completes full workflow with no artificial technician requirement.

### 4 — Independent Repairer

Independent Provider works with Meetup/Home Service and no mandatory Shop address.

### 5 — Cross-tenant

Provider A attempts Provider B URLs/actions; no read/write leakage.

### 6 — Staff lifecycle

```text
OWNER invites
-> Staff accepts
-> permitted access
-> OWNER removes
-> access denied
```

## CI requirements before release

`staging` and `master` should require:

```text
Branch Policy
Verify
Database integration
Docker Build
```

After Playwright is reliable, add it as a release gate.

Rollout:

```text
manual
-> automatic staging run
-> automatic release PR
-> required
```

## Integration-test locality

Split the large database suite by Module:

```text
tests/integration/
  auth.db.test.ts
  providers.db.test.ts
  repair-requests.db.test.ts
  repairs.db.test.ts
  tracking.db.test.ts
  analytics.db.test.ts
  helpers/
```

This is locality improvement, not a new architecture layer.

## Flaky test rule

Never normalize:

```text
rerun until green
```

A flaky release-critical test is itself a release defect.

## Exit gate

```text
[ ] Playwright works locally
[ ] core E2E works in CI
[ ] failure artifacts uploaded
[ ] Database integration is required on release branches
[ ] no known release-critical flaky test
[ ] integration tests have clear Module locality
```
