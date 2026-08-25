# Part 06 — UAT and Pilot Validation

> Shared release context (repository, reviewed baseline, branch model, severity contract): see [00_POST_MVP_MASTER_HANDOFF.md](00_POST_MVP_MASTER_HANDOFF.md).

## Objective

Verify that real MVP personas can complete core workflows without developer assistance.

## Personas and scenarios

Shop Owner:

```text
register/login
Shop onboarding
Provider settings
Service Modes
Staff invite/remove
Request review
direct Repair
Request -> Repair
updates/statuses/completion
```

Shop Staff:

```text
accept invite
login
permitted workspace
forbidden owner settings
Repair/Request permitted behavior
offboarding
```

Independent Repairer:

```text
Independent onboarding
Service Area
Meetup/Home Service
no mandatory Shop address
Request + Repair + Tracking lifecycle
```

Customer requesting repair:

```text
open Provider page
understand Service Modes
submit valid Request
see clear result/reference
understand invalid/closed-provider state
```

Customer tracking:

```text
enter Tracking Code
understand status/update
unknown code remains neutral
no private data appears
```

Hostile user:

```text
cross-Provider URLs
invalid IDs
owner-only Staff/settings paths
invalid/expired/revoked invitation
```

## Realistic test data

Include:

```text
one-person Shop
Shop with multiple Staff
Independent Provider
many Requests
direct + Request-origin Repairs
WAITING/READY/COMPLETED states
longer Repair histories
closed Request intake
expired and revoked invites
```

## UAT finding record

```text
persona
scenario
step
expected
actual
severity
reproducibility
evidence
Module owner
release blocker yes/no
```

## Accessibility pass

Core routes:

```text
keyboard navigation
focus visibility
form labels
error association
button semantics
responsive layout
contrast
screen-reader-friendly status/error text
```

## Mobile pass

Test:

```text
small phone
large phone
tablet
desktop
```

Focus on dashboard navigation, forms, lists/tables, Staff management, Repair detail, Tracking, and Request pages.

## Day-in-the-life pilot

Simulate:

```text
morning: owner reviews dashboard/new Requests
day: Staff works, customers submit/track, Repairs change state
end: READY/COMPLETED, owner checks outstanding work
```

This catches sequencing defects isolated tests miss.

## Feedback classification

```text
cannot complete workflow -> release fix
unsafe/misleading -> release fix
confusing but workable -> P2
nice improvement -> P3
new business capability -> later scope
```

## Exit gate

```text
[ ] every MVP persona completes core workflow
[ ] no UAT P0/P1
[ ] Staff offboarding verified
[ ] Independent flow has no Shop-only assumptions
[ ] mobile core flows work
[ ] accessibility blockers resolved
[ ] pilot simulation completed
[ ] deferred feedback captured
```
