# Plan 12 — Release Candidate, Deployment Rehearsal, Migration Upgrade, and Recovery

**Plan type:** release engineering chore/process  
**Recommended branch:** `chore/release-candidate-deployment`  
**Authoritative source:** `07_RELEASE_CANDIDATE_AND_DEPLOYMENT.md`, `09_RELEASE_READINESS_CHECKLIST.md`

> Derived from the [Handoff Bundle](../handoff/00_POST_MVP_MASTER_HANDOFF.md). Shared guardrails, verification gates, and the multi-agent strategy live in [00_MASTER_INDEX_AND_DEPENDENCY_MAP.md](00_MASTER_INDEX_AND_DEPENDENCY_MAP.md#shared-execution-context); this file carries only plan-specific content.

## Objective

Produce an immutable v0.1.0 release candidate, validate it twice without code changes, rehearse both fresh and upgrade deployments, establish backup/recovery readiness, and deploy the exact approved commit.

## RC Entry Gate

Do not create RC1 until:

```text
all P0 closed
all P1 closed
public abuse controls active
Staff offboarding complete
core E2E green
Database Integration required + green
Docker Build green
production config validation green
UAT core flows accepted
```

## Candidate Discipline

Tags:

```text
v0.1.0-rc.1
v0.1.0-rc.2
...
```

Never move an RC tag. Any code/config/migration change creates a new candidate.

## Hard Freeze

After RC1 allow only:

```text
P0/P1 fix
low-risk Lead-approved release correction
release configuration correction
```

Reject normal features, optional refactors, cosmetic redesigns, unrelated dependency upgrades.

## Full Candidate Suite

Execute on the exact RC commit:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:run
pnpm db:reset
pnpm test:db
pnpm build
# Docker Build workflow
# full Playwright release suite
# production-config validation
```

Then smoke:

```text
email/invite
password reset
public Request
Tracking
```

Require **two consecutive complete green validation cycles** for the unchanged candidate. If anything changes, restart the count on the next RC tag.

## Deployment Rehearsal A — Fresh Environment

```text
empty database/environment
-> apply complete migration history
-> deploy production build
-> set production-like config
-> run core smoke
```

Record migration duration/failures and final function/grant/RLS state where security-critical.

## Deployment Rehearsal B — Upgrade Environment

Create/restore a release-like previous schema/data state, then apply only pending migrations.

Verify:

```text
existing data preserved
constraints valid
RLS valid
functions/grants valid
existing rows remain readable/writable as intended
```

This is mandatory for forward migrations that fix previously deployed database functions or policies.

## Backup and Recovery

Before production record:

```text
backup/snapshot mechanism
responsible owner
restore steps
validation after restore
rollback vs forward-fix criteria
```

Do not claim rollback is available if a migration makes the previous application schema-incompatible.

## Production Configuration Check

Verify:

```text
Supabase URL/publishable key
NEXT_PUBLIC_APP_URL HTTPS
Resend API key
verified sender
production domain/TLS
no test toggles
no committed secrets
```

## Promotion Gate

After the immutable candidate has passed both deployment rehearsals and two complete green cycles, execute **Plan 14 — Release Readiness and Go/No-Go**. Production promotion is allowed only after that evidence gate records `GO`.

## Promotion Flow

```text
approved RC on staging
-> PR staging -> master
-> all required checks
-> merge exact candidate
-> deploy exact master commit
-> apply pending migrations
-> immediate smoke
-> tag/release v0.1.0 identifying deployed commit
```

## Immediate Production Smoke

```text
home/public Provider
login
dashboard
create Repair
submit Request
accept Request
Tracking
Staff access
email
database write
```

## Acceptance Criteria

```text
[ ] immutable RC tag exists
[ ] hard freeze active
[ ] two unchanged full green cycles
[ ] fresh rehearsal passes
[ ] upgrade rehearsal passes
[ ] backup/snapshot available
[ ] restore procedure understood
[ ] forward-fix vs rollback criteria documented
[ ] exact RC commit promoted/deployed
[ ] production smoke green
[ ] v0.1.0 tag identifies production commit
```
