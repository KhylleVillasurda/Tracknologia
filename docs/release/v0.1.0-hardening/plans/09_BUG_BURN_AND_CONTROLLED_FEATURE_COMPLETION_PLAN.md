# Plan 09 — Bug Burn and Controlled Feature Completion

**Plan type:** release execution process with per-defect fix branches  
**Recommended branch:** `fix/<defect>`  
**Authoritative source:** `04_BUG_BURN_AND_FEATURE_CONTROL.md`, `01_RELEASE_BASELINE_AND_CHANGE_CONTROL.md`

> Derived from the [Handoff Bundle](../handoff/00_POST_MVP_MASTER_HANDOFF.md). Shared guardrails, verification gates, and the multi-agent strategy live in [00_MASTER_INDEX_AND_DEPENDENCY_MAP.md](00_MASTER_INDEX_AND_DEPENDENCY_MAP.md#shared-execution-context); this file carries only plan-specific content.

## Objective

Run a disciplined defect-burn loop against the integrated MVP without reopening uncontrolled scope.

## Required Loop

```text
test
-> capture evidence
-> assign severity
-> identify owning Module
-> fix root cause at owning seam
-> add regression
-> PR
-> staging
-> integrated verification
```

A merged fix is not complete until its integrated regression surface is green.

## Per-Defect Implementation Template

Every defect ticket must include:

```text
symptom/reproduction
P0/P1/P2/P3
owning Module
root invariant
expected behavior
security/data implications
files/areas likely affected
regression test that should fail before fix
required verification commands
release blocker yes/no
```

Use `diagnosing-bugs`/test-first workflow for hard bugs: build a red-capable reproduction, minimize it, identify the owning seam, then lock the fix with regression coverage.

## Feature Discovery Gate

When testing reveals missing behavior:

```text
MVP scope implies it?
  no -> backlog unless Lead expands scope
  yes -> does absence block/sabotage existing workflow?
           yes -> bounded release implementation
           no  -> P2/P3 decision
```

Any new actor, major persistent entity, new business process, or cross-Module workflow requires explicit Lead scope approval.

## Regression Cost by Change Type

UI-only:

```text
affected Module/component tests
affected E2E smoke
```

Business Interface:

```text
owning Module tests
dependent Module tests
affected E2E
```

Schema/RLS/Auth/lifecycle/public operation:

```text
format
lint
typecheck
unit/module
fresh DB reset
real DB/RLS
build
affected E2E
security regression
```

## Directed Bug-Hunting Campaigns

### Auth/Providers

```text
invite expiration/revocation
email mismatch
Staff removal
owner-only settings
onboarding retry
callback/config failure
```

### Repair Requests

```text
double submit
accept/decline race
closed Provider
Service Mode changes
pagination edge
verification correction
```

### Repairs

```text
concurrent status change
COMPLETED restrictions
historical Service Mode behavior
long history
search edge
```

### Tracking/Analytics

```text
malformed/unknown code
public-data leakage
high-volume request
audit/telemetry failure
retention growth
direct RPC abuse
```

## Stop/Exit Criteria

```text
[ ] no P0
[ ] all known P1 fixed + verified
[ ] every P0/P1 has regression coverage
[ ] scope additions explicitly approved
[ ] no silent feature creep
[ ] defect arrival rate is declining across repeated validation cycles
```

## Non-Goals

This plan does not predefine fixes for bugs that have not been reproduced. It defines the controlled workflow for discovering, fixing, and verifying them.
