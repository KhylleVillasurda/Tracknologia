# Plan 01 — Release Baseline, Issue Governance, and Change Control

**Plan type:** release-governance chore/process  
**Recommended branch:** `chore/release-baseline-control`  
**Authoritative source:** `00_POST_MVP_MASTER_HANDOFF.md`, `01_RELEASE_BASELINE_AND_CHANGE_CONTROL.md`

> Derived from the [Handoff Bundle](../handoff/00_POST_MVP_MASTER_HANDOFF.md). Shared guardrails, verification gates, and the multi-agent strategy live in [00_MASTER_INDEX_AND_DEPENDENCY_MAP.md](00_MASTER_INDEX_AND_DEPENDENCY_MAP.md#shared-execution-context); this file carries only plan-specific content.

## Objective

Turn `staging` at the reviewed baseline into a controlled release-hardening line instead of continuing open-ended feature delivery.

## Deliverables

1. A v0.1.0 hardening milestone/backlog convention.
2. A required issue template/record containing severity, affected Module, reproduction, security/data impact, regression surface, owner, release-blocker flag, and status.
3. A documented state machine:
   `TRIAGE -> ACCEPTED -> IN PROGRESS -> REVIEW -> VERIFIED -> CLOSED`, with `DEFERRED` as an explicit branch.
4. Soft-freeze PR expectations and release-justification fields.
5. A documented feature-discovery rule that permits only scope-implied, bounded missing behavior before v0.1.0.
6. A forward-only migration rule for shared release databases.

## Repository Areas to Inspect First

```text
AGENTS.md
CONTRIBUTING.md
.github/
docs/agents/issue-tracker.md
docs/agents/triage-labels.md
docs/17_TESTING_STRATEGY.md (or current testing doc)
README.md / development docs if they describe branch flow
```

Do not create duplicate governance documents if one of these already owns the rule; update the canonical location.

## Implementation Steps

### Phase 1 — Freeze the fixed point

- Record baseline SHA `8fffcb52...` as the release-hardening reference.
- Confirm `staging` is the integration branch and `master` is production promotion.
- Document allowed soft-freeze change classes: bug/security/reliability, scope-valid missing behavior, CI/testing/deployment, required accessibility/UX.
- Document rejected default changes: new actors, new business Modules, major redesigns, speculative infrastructure.

### Phase 2 — Issue/backlog schema

Define required issue fields:

```text
ID/title
P0/P1/P2/P3
affected Module(s)
route/database impact
reproduction
expected behavior
security/data impact
required tests
owner
release blocker yes/no
status
```

If GitHub issue forms/templates exist, implement the fields there. Otherwise document the template in the existing issue-tracker guidance rather than inventing a new tracker.

### Phase 3 — Severity and status discipline

- P0: tenant escape, credential compromise, destructive corruption, critical data leak -> immediate release stop.
- P1: core workflow/security/reliability/deployment blocker -> must close.
- P2: important bounded defect -> fix or Lead-approved defer.
- P3: enhancement/future -> post-release.
- Define `VERIFIED` as integrated behavior passing its required regression surface, not merely merged code.

### Phase 4 — PR release justification

Every PR into `staging` must answer:

```text
Why must this ship in v0.1.0?
Which Module/interface owns it?
What regression surface changes?
Which tests must rerun?
```

Use the existing PR template if present; do not introduce another parallel template.

### Phase 5 — Feature-discovery gate

Accept a newly discovered pre-release feature only when all are true:

```text
current MVP scope already implies it
absence makes an existing workflow incomplete/unsafe/misleading
no major new domain model
bounded implementation
known regression surface
tests can be added
```

Examples explicitly allowed by the source include Staff offboarding, missing validation, retry/idempotency protection, required error states, and core accessibility completion. Inventory/POS/customer accounts/marketplace/ratings/multi-branch/advanced analytics/AI diagnosis/staff scheduling remain deferred unless Lead explicitly changes scope.

### Phase 6 — Database change policy

- Treat accepted/shared migrations as forward-only.
- Require both fresh-history and upgrade-path rehearsal before production.
- Do not manually mutate shared databases without a version-controlled migration.

## Acceptance Criteria

```text
[ ] v0.1.0 hardening milestone/backlog convention exists
[ ] every open release issue has P0/P1/P2/P3 severity
[ ] all P0/P1 have owners
[ ] soft freeze rules are documented
[ ] staging PRs require release justification
[ ] feature-discovery acceptance rule is documented
[ ] VERIFIED explicitly means integrated regression passed
[ ] forward-only migration rule is documented
```

## Non-Goals

- No application feature implementation.
- No new issue-tracker platform.
- No branch-strategy redesign beyond the existing developer -> feature/fix/chore -> staging -> master flow.
- No automated policy that blocks legitimate emergency hotfixes without a documented escape path.

## Handoff Evidence

Return the exact documentation/template files changed and an example release issue/PR showing the required fields.
