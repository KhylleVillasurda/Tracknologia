# Plan 11 — UAT, Accessibility, Mobile, and Day-in-the-Life Pilot

**Plan type:** release validation and bounded UX-fix plan  
**Recommended branch:** `chore/uat-pilot-validation`  
**Authoritative source:** `06_UAT_AND_PILOT_VALIDATION.md`

> Derived from the [Handoff Bundle](../handoff/00_POST_MVP_MASTER_HANDOFF.md). Shared guardrails, verification gates, and the multi-agent strategy live in [00_MASTER_INDEX_AND_DEPENDENCY_MAP.md](00_MASTER_INDEX_AND_DEPENDENCY_MAP.md#shared-execution-context); this file carries only plan-specific content.

## Objective

Verify real MVP personas can complete core workflows without developer assistance, then turn only release-blocking UAT findings into bounded fixes.

## Personas / Required Scenarios

### Shop Owner

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

### Shop Staff

```text
accept invite
login
permitted workspace
owner settings forbidden
permitted Repair/Request work
offboarding
```

### Independent Repairer

```text
Independent onboarding
Service Area
Meetup/Home Service
no mandatory Shop address
Request + Repair + Tracking lifecycle
```

### Customer Request

```text
open Provider page
understand Service Modes
submit valid Request
see clear result/reference
understand invalid/closed-provider state
```

### Customer Tracking

```text
enter Tracking Code
understand status/update
unknown code neutral
no private data
```

### Hostile user

```text
cross-Provider URLs
invalid IDs
owner-only paths
invalid/expired/revoked invitation
```

## Test Data Pack

Prepare repeatable realistic data containing:

```text
one-person Shop
Shop with multiple Staff
Independent Provider
many Requests
direct + Request-origin Repairs
WAITING/READY/COMPLETED
longer Repair histories
closed Request intake
expired/revoked invitations
```

Do not use production personal data.

## UAT Finding Record

Every finding records:

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

Classification:

```text
cannot complete workflow -> release fix
unsafe/misleading -> release fix
confusing but workable -> P2
nice improvement -> P3
new business capability -> later scope
```

## Accessibility Pass

Core routes must be checked for:

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

Use existing component primitives/tokens. Fix release-blocking accessibility issues at the owning component/route without redesigning the visual system.

## Mobile Matrix

Test:

```text
small phone
large phone
tablet
desktop
```

Focus on dashboard navigation, forms, lists/tables, Staff management, Repair detail, Tracking, and Request pages.

## Day-in-the-Life Pilot

Run a continuous scenario:

```text
morning -> OWNER reviews dashboard/new Requests
day -> Staff works, customers submit/track, Repairs change state
end -> READY/COMPLETED, OWNER reviews outstanding work
```

Capture sequencing/state defects that isolated tests miss.

## Fix Loop

For each release-blocking finding:

```text
create issue
-> owning Module
-> minimal fix
-> targeted regression
-> affected Playwright scenario
-> staging verification
-> rerun UAT step
```

Do not batch unrelated UAT fixes into one large redesign PR.

## Acceptance Criteria

```text
[ ] every MVP persona completes core workflow
[ ] no UAT P0/P1
[ ] Staff offboarding verified
[ ] Independent flow has no Shop-only assumptions
[ ] mobile core flows accepted
[ ] accessibility blockers resolved
[ ] day-in-the-life simulation completed
[ ] deferred P2/P3/new-capability feedback captured separately
```
