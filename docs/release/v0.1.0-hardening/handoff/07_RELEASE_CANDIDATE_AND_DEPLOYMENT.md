# Part 07 — Release Candidate, Hard Freeze, and Deployment

> Shared release context (repository, reviewed baseline, branch model, severity contract): see [00_POST_MVP_MASTER_HANDOFF.md](00_POST_MVP_MASTER_HANDOFF.md).

## Objective

Produce an immutable release candidate, prove it in a production-like environment, and deploy the exact approved commit.

## RC entry requirements

```text
[ ] all P0 closed
[ ] all P1 closed
[ ] public abuse controls active
[ ] Staff offboarding complete
[ ] core E2E green
[ ] Database Integration required and green
[ ] Docker Build green
[ ] production config validation green
[ ] trusted-ingress/public-abuse configuration verified in rehearsal
[ ] UAT core flows accepted
```

## Candidate tags

```text
v0.1.0-rc.1
v0.1.0-rc.2
...
```

Never move an existing RC tag. Any code change creates a new candidate.

## Hard freeze

After RC1:

```text
P0/P1 fixes -> allowed
low-risk Lead-approved release correction -> allowed
normal feature -> rejected
optional refactor -> rejected
cosmetic redesign -> rejected
unrelated dependency upgrade -> rejected
```

## Full candidate suite

```text
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:run
pnpm db:reset
pnpm test:db
pnpm build
Docker Build
full Playwright release suite
production-config validation
email/invite smoke
password-reset smoke
public Request smoke
Tracking smoke
```

Require two consecutive complete green validation cycles for the unchanged candidate.

## Deployment rehearsal 1 — fresh environment

```text
empty environment
 -> apply all migrations
 -> deploy production build
 -> configure production-like env
 -> run core smoke workflows
```

## Deployment rehearsal 2 — upgrade environment

Represent the previous schema/data state and apply only pending migrations.

Check:

```text
existing data preserved
constraints valid
RLS valid
functions/grants valid
existing rows still readable/writable as expected
```

## Backup and recovery

Before production:

```text
[ ] backup/snapshot available
[ ] responsible owner assigned
[ ] restore procedure understood
[ ] forward-fix vs rollback criteria understood
```

## Production configuration

Verify:

```text
Supabase URL/key
NEXT_PUBLIC_APP_URL
Resend key
verified sender
HTTPS/domain
no test toggles
no committed secrets
```

## Release flow

```text
approved RC on staging
 -> PR staging -> master
 -> all required checks
 -> merge
 -> deploy exact master commit
 -> apply migrations
 -> immediate smoke
 -> create/release v0.1.0
```

## Immediate smoke

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

## Exit gate

```text
[ ] immutable RC tag exists
[ ] hard freeze active
[ ] two full green cycles
[ ] fresh rehearsal passes
[ ] upgrade rehearsal passes
[ ] backup/recovery ready
[ ] exact RC promoted/deployed
[ ] production smoke passes
[ ] v0.1.0 identifies deployed commit
```
