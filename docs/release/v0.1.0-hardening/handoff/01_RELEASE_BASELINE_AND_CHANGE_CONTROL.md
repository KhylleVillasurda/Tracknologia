# Part 01 — Release Baseline and Change Control

> Shared release context (repository, reviewed baseline, branch model, severity contract): see [00_POST_MVP_MASTER_HANDOFF.md](00_POST_MVP_MASTER_HANDOFF.md).

## Objective

Turn the current `staging` branch into a controlled release-hardening baseline rather than continuing open-ended development.

## Required release backlog record

Every issue should include:

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

Suggested states:

```text
TRIAGE -> ACCEPTED -> IN PROGRESS -> REVIEW -> VERIFIED -> CLOSED
                                  \-> DEFERRED
```

`VERIFIED` means the integrated fix passed its regression surface.

## Feature discovered during testing

Include before v0.1.0 only when all are true:

```text
1. Current MVP scope already implies the behavior.
2. Existing workflow is incomplete, unsafe, or misleading without it.
3. No major new domain model is required.
4. Implementation scope is bounded.
5. Regression surface is known.
6. Tests can be added.
```

Likely valid:

```text
Staff offboarding
missing validation
missing retry/idempotency protection
required error state
core accessibility completion
```

Likely defer:

```text
inventory
POS
customer accounts
marketplace
ratings
multi-branch
advanced analytics
AI diagnosis
new staff scheduling/dispatching
```

## Root-cause rule

For every defect ask:

```text
Which Module owns the invariant?
Which Interface should guarantee it?
Does PostgreSQL need a durable constraint?
Is an app adapter bypassing the Module?
Should RLS independently deny it?
Which test should have caught it?
```

Fix at the owning seam. Avoid generic pass-through manager/service/repository stacks.

## Database change rule

Accepted/shared migrations are forward-only.

Before production test both:

```text
empty database -> entire migration history
existing release-like database -> only pending migrations
```

## Exit gate

```text
[ ] v0.1.0 hardening milestone established
[ ] every open issue has severity
[ ] all P0/P1 owned
[ ] soft freeze communicated
[ ] release justification required in PRs
[ ] feature-discovery acceptance rule adopted
```
