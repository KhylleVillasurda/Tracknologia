# Plan 07 — Playwright Core End-to-End Release Suite

**Plan type:** release-test infrastructure chore  
**Recommended branch:** `chore/e2e-release-gate`  
**Authoritative source:** `03_TESTING_E2E_AND_CI_GATES.md`, `06_UAT_AND_PILOT_VALIDATION.md`

> Derived from the [Handoff Bundle](../handoff/00_POST_MVP_MASTER_HANDOFF.md). Shared guardrails, verification gates, and the multi-agent strategy live in [00_MASTER_INDEX_AND_DEPENDENCY_MAP.md](00_MASTER_INDEX_AND_DEPENDENCY_MAP.md#shared-execution-context); this file carries only plan-specific content.

## Objective

Add Playwright as the user-journey layer above existing module, contract, and real PostgreSQL/RLS tests. E2E does not replace lower-level tests.

## Baseline Observation

At the reviewed baseline, `.github/workflows/e2e.yml` already exists as a manual `workflow_dispatch` workflow and attempts `pnpm exec playwright`, but `package.json` does not yet list `@playwright/test` or an E2E script and `tests/e2e/` is absent. Build on the existing workflow rather than creating a competing one.

## Deliverables

```text
@playwright/test dev dependency
playwright.config.*
tests/e2e/
repeatable disposable test environment strategy
fixture/reset strategy
CI Chromium install
failure report/screenshots/traces as configured
core release scenarios
```

## Environment Strategy

Prefer a disposable local Supabase environment in CI so E2E data is isolated and repeatable. If the existing TEST_SUPABASE_* remote environment is retained temporarily, define deterministic fixture cleanup and prohibit production credentials.

The manager must resolve this before making E2E required. A shared mutable test project that causes cross-run flakiness is not an acceptable final gate.

## Test Fixture Design

Create reusable test actors/data only for current MVP personas:

```text
Shop OWNER
Shop STAFF
Independent Provider
Customer Request input
Customer Tracking input
second Provider for tenant-isolation checks
```

Use API/setup helpers or admin fixture setup where appropriate, but drive the business journey through the UI in the scenario itself. Avoid duplicating the application's business rules inside fixtures.

## Mandatory Scenarios

### E2E-01 Direct Repair

```text
Provider login
-> create direct Repair
-> initial IN_PROGRESS
-> obtain Tracking Code
-> public customer tracks
-> Provider adds Customer Update / status changes
-> READY
-> COMPLETED
```

Assertions include Tracking public projection and terminal completion behavior.

### E2E-02 Customer Request

```text
public Provider page
-> submit Request
-> Provider reviews
-> accept
-> exactly one CUSTOMER_REQUEST Repair
-> Tracking works
```

Add a regression preventing duplicate Repair creation from repeated acceptance where observable.

### E2E-03 One-person Shop

OWNER alone completes the full Repair workflow. No technician/staff assignment may be required.

### E2E-04 Independent Repairer

Independent Provider onboards/operates with Service Area and Meetup/Home Service; no mandatory Shop address.

### E2E-05 Cross-tenant

Provider A attempts Provider B protected URLs/actions. Assert no private read and no mutation.

### E2E-06 Staff lifecycle

```text
OWNER creates invitation
-> Staff accepts
-> Staff uses permitted workspace
-> owner-only settings denied
-> OWNER removes Staff
-> Staff protected access denied
```

Depends on Plan 03.

## Reliability Rules

- No arbitrary sleeps; wait on observable application states.
- Each test owns or deterministically resets its data.
- Capture trace/screenshot/report on failure.
- A flaky release-critical test is a defect; do not normalize rerun-until-green.
- Tag/split scenarios only when it improves execution clarity, not to hide failures.

## CI Rollout

```text
manual workflow
-> automatic staging run
-> automatic release PR run
-> required release check after reliability proven
```

Do not make Playwright required on day one before the suite is deterministic.

## Likely Files

```text
package.json
pnpm-lock.yaml
playwright.config.ts
tests/e2e/*.spec.ts
tests/e2e/helpers/** only where justified
.github/workflows/e2e.yml
possibly test fixture scripts
```

## Acceptance Criteria

```text
[ ] Playwright installs/runs locally
[ ] six mandatory MVP scenarios exist
[ ] test environment is repeatable/disposable
[ ] failure artifacts in CI
[ ] no release-critical known flake
[ ] E2E workflow runs automatically on staging/release PR after stabilization
[ ] suite can become a required release gate
```
