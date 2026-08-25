# Plan 08 — CI Release Gates and Module-Local Database Integration Tests

**Plan type:** release CI/test infrastructure chore  
**Recommended branch:** `chore/ci-required-db-integration`  
**Authoritative source:** `03_TESTING_E2E_AND_CI_GATES.md`

> Derived from the [Handoff Bundle](../handoff/00_POST_MVP_MASTER_HANDOFF.md). Shared guardrails, verification gates, and the multi-agent strategy live in [00_MASTER_INDEX_AND_DEPENDENCY_MAP.md](00_MASTER_INDEX_AND_DEPENDENCY_MAP.md#shared-execution-context); this file carries only plan-specific content.

## Objective

Make release-critical automated verification mandatory on `staging`/`master` and improve database-test locality without creating a new architecture layer.

## Baseline Observation

The reviewed baseline already has `.github/workflows/ci.yml` with separate `Verify` and `Database integration` jobs, plus existing `branch-policy.yml`, `docker.yml`, and manual `e2e.yml`. Preserve and tighten these rather than rebuilding CI.

## Required Release Checks

```text
Branch Policy
Verify
Database integration
Docker Build
Playwright (after suite reliability proven)
```

## Implementation Phases

### Phase 1 — Verify existing branch protection/check names

Ensure workflow job names are stable and can be configured as required checks. Do not rename checks casually after branch protection depends on them.

### Phase 2 — Database Integration hard requirement

- Confirm `staging` and `master` PR/push paths execute the DB job.
- Ensure local Supabase startup/reset failure fails the job.
- Ensure `pnpm test:db` cannot silently skip its required database cases.
- Retain exact Node/pnpm/Supabase CLI pinning required for reproducibility.

### Phase 3 — Split integration suite by Module

Target structure:

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

Move tests by domain ownership while preserving behavior. Keep shared fixture setup in a small `helpers/` seam; do not build a generic repository/testing framework.

Update `test:db` to execute all `*.db.test.ts` files deterministically.

### Phase 4 — Docker gate

Inspect `.github/workflows/docker.yml` and ensure the release branch path produces a clean application image/build using the frozen lockfile and current production build contract.

### Phase 5 — Playwright promotion

After Plan 07 demonstrates reliability:

```text
manual -> staging automatic -> release PR automatic -> required
```

Do not mark a flaky E2E workflow required merely to satisfy the checklist.

### Phase 6 — Failure evidence

CI failures should expose enough artifacts/logs to diagnose:

```text
DB startup/reset
migration failure
Vitest failure
Playwright trace/report
Docker build failure
```

No secrets in artifacts.

## Tests / Validation

Use workflow dispatch/PR on a test branch to prove each required check actually executes. Deliberately break a DB test in an isolated validation commit/branch if needed to prove the gate fails closed, then revert before merge.

## Acceptance Criteria

```text
[ ] Verify is required for staging/master promotion
[ ] Database Integration is required and cannot silently skip
[ ] Docker Build is required for release promotion
[ ] DB tests split by Module with shared helpers only where necessary
[ ] test:db executes the complete real DB suite
[ ] Playwright promotion path documented and eventually required when reliable
[ ] CI failure artifacts/logs are actionable and secret-safe
```

## Non-Goals

- New CI platform.
- Matrix explosion across unsupported Node versions.
- Duplicating module tests in E2E.
