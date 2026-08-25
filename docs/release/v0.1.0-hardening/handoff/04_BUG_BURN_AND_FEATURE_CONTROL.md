# Part 04 — Bug Burn and Controlled Feature Completion

> Shared release context (repository, reviewed baseline, branch model, severity contract): see [00_POST_MVP_MASTER_HANDOFF.md](00_POST_MVP_MASTER_HANDOFF.md).

## Objective

Finish the MVP through testing without reopening uncontrolled scope.

## Bug-burn loop

```text
test
 -> capture
 -> severity
 -> Module owner
 -> root-cause fix
 -> regression test
 -> PR
 -> staging
 -> integrated verification
```

A merged fix is not finished until its integrated behavior is verified.

## Feature-discovery decision

When testing reveals missing behavior:

```text
Does current MVP scope imply it?
  no -> backlog unless Lead expands release scope
  yes
   |
Does absence block/sabotage an existing workflow?
  yes -> include
  no  -> P2/P3 decision
```

New actors, major persistent entities, new business processes, or cross-Module workflows require explicit Lead scope approval.

## Regression cost rule

Every added behavior pays for its regression surface.

UI-only:

```text
affected module tests
affected E2E smoke
```

Interface/business behavior:

```text
module tests
dependent Module tests
affected E2E
```

Schema/RLS/Auth/lifecycle/public operation:

```text
format
lint
typecheck
unit/module tests
fresh DB reset
real DB/RLS tests
build
affected E2E
security regression
```

## Active bug-hunting areas

Auth/Providers:

```text
invite expiration/revocation
email mismatch
Staff removal
owner-only settings
onboarding retries
callback/configuration errors
```

Requests:

```text
double submission
accept/decline races
closed Provider
Service Mode changes
pagination edges
verification corrections
```

Repairs:

```text
concurrent status changes
completed Repair restrictions
historical Service Mode behavior
large history
search edge cases
```

Tracking/Analytics:

```text
malformed/unknown codes
public-data leakage
high-volume requests
telemetry failure
retention/growth
direct RPC abuse
```

## Exit gate

```text
[ ] no P0
[ ] all known P1 fixed and verified
[ ] every P0/P1 has regression coverage
[ ] scope additions explicitly approved
[ ] no silent feature creep
[ ] bug arrival rate is declining
```
