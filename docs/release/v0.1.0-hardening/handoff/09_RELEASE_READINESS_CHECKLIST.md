# Part 09 — Tracknologia v0.1.0 Release Readiness Checklist

> Shared release context (repository, reviewed baseline, branch model, severity contract): see [00_POST_MVP_MASTER_HANDOFF.md](00_POST_MVP_MASTER_HANDOFF.md).

Use this as the final Lead go/no-go checklist.

## Scope and governance

```text
[ ] MVP Modules implemented
[ ] soft freeze completed
[ ] hard freeze active
[ ] every open issue has P0/P1/P2/P3
[ ] no unresolved P0
[ ] no unresolved P1
[ ] accepted P2 risks documented
```

## Architecture

```text
[ ] src/app remains application/framework adaptation
[ ] business behavior remains in src/features
[ ] Module Interfaces remain caller/test seams
[ ] no unjustified generic service/manager/repository stack
[ ] no new cross-Module dependency cycle
```

## Auth / Provider access

```text
[ ] unauthenticated access denied
[ ] missing membership fails closed
[ ] OWNER works
[ ] STAFF works
[ ] cross-Provider access denied
[ ] Staff offboarding works
[ ] removed Staff denied by app + RLS
[ ] Auth infrastructure errors handled distinctly
```

## Provider onboarding / Staff

```text
[ ] Independent onboarding works
[ ] Shop Owner onboarding works
[ ] Staff joins by secure invitation only
[ ] invitation single-use
[ ] invitation expires
[ ] invitation revocable
[ ] email binding works
[ ] duplicate-active-invite policy defined
[ ] production email delivery works
```

## Repair Requests

```text
[ ] public submission works
[ ] closed Provider rejects submission
[ ] unsupported Service Mode rejected
[ ] Provider isolation holds
[ ] accept creates exactly one Repair
[ ] decline creates none
[ ] accept/decline races safe
[ ] durable abuse protection active
```

## Repairs

```text
[ ] direct creation works
[ ] Request-origin creation works
[ ] IN_PROGRESS initial status
[ ] transitions valid
[ ] Status Events consistent
[ ] Customer Updates safe
[ ] completion terminal
[ ] cross-Provider mutation denied
[ ] concurrency regression green
```

## Tracking / Analytics

```text
[ ] malformed/unknown codes neutral
[ ] safe allow-listed public projection
[ ] no private leakage
[ ] updates bounded
[ ] durable public rate protection
[ ] analytics failure does not fail Tracking
[ ] no raw Tracking credential stored
[ ] telemetry retention/growth policy defined
```

## Automated verification

```text
[ ] pnpm format:check
[ ] pnpm lint
[ ] pnpm typecheck
[ ] pnpm test:run
[ ] pnpm db:reset
[ ] pnpm test:db
[ ] pnpm build
[ ] Docker Build
[ ] core Playwright release suite
[ ] no release-critical flaky tests
```

## CI / governance

```text
[ ] Branch Policy required
[ ] Verify required
[ ] Database Integration required for staging/master
[ ] Docker Build required for release promotion
[ ] Playwright required once proven reliable
[ ] master promotion remains staging-only
```

## Load / resilience

```text
[ ] dashboard load tested
[ ] Tracking load tested
[ ] Request submission load tested
[ ] concurrency races repeated
[ ] no connection-pool exhaustion under intended pilot load
[ ] no sustained lock backlog
[ ] acceptable p95/error rate
[ ] dependency failure behavior tested
```

## UAT

```text
[ ] Shop Owner flow accepted
[ ] Shop Staff flow accepted
[ ] Independent flow accepted
[ ] Customer Request accepted
[ ] Customer Tracking accepted
[ ] hostile/cross-tenant checks accepted
[ ] mobile core flows accepted
[ ] accessibility blockers resolved
```

## Configuration / migration / recovery

```text
[ ] production Supabase configuration
[ ] explicit HTTPS app origin
[ ] production Resend configuration
[ ] no test-only toggles
[ ] fresh migration rehearsal
[ ] upgrade migration rehearsal
[ ] backup/snapshot available
[ ] restore/forward-fix process understood
```

## Release Candidate

```text
[ ] immutable v0.1.0-rc.N tag
[ ] two consecutive full green validation cycles
[ ] release notes ready
[ ] known limitations recorded
[ ] exact approved commit deployed
[ ] production smoke green
[ ] v0.1.0 tag identifies production commit
```

## Approval

```text
Release decision: __________________________
Approved by: ______________________________
Candidate commit: _________________________
RC tag: ___________________________________
Production release tag: ___________________

Accepted P2 risks:
1. ________________________________________
2. ________________________________________
3. ________________________________________
```
