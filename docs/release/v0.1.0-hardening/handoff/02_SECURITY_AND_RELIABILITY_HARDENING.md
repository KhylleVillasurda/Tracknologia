# Part 02 — Security and Reliability Hardening

> Shared release context (repository, reviewed baseline, branch model, severity contract): see [00_POST_MVP_MASTER_HANDOFF.md](00_POST_MVP_MASTER_HANDOFF.md).

## Objective

Close non-feature blockers required for broad public deployment.

## A. Durable public-operation protection

Public seams:

```text
Repair Request submission
Tracking lookup
Tracking analytics observation
Auth registration/reset where abuse becomes relevant
```

Required shape:

```text
Internet
 -> durable/edge abuse control
 -> bounded validated operation
 -> feature Module
 -> narrow database operation
```

A process-memory-only Next.js limiter is insufficient if callers can directly invoke the Supabase operation.

Acceptance:

```text
[ ] direct public DB/RPC path cannot bypass control
[ ] malformed/unknown Tracking remains neutral
[ ] no raw tracking/customer data in abuse logs
[ ] thresholds are configurable
[ ] burst/load tests verify limits
[ ] normal customer path remains fast
```

CAPTCHA is deferred unless evidence shows it is needed.

## B. Staff offboarding

Add a narrow OWNER-controlled behavior, conceptually:

```text
removeStaffMember(membershipId)
```

Invariants:

```text
caller is OWNER
same Provider
target is STAFF
cannot remove OWNER through Staff operation
removed Staff loses ProviderContext
RLS also denies removed Staff
cross-Provider attempt denied/neutral
```

Do not add a broad RBAC subsystem.

## C. Auth/session reliability

Goals:

```text
trusted ProviderContext resolved once per server request where practical
public accountless routes avoid unnecessary auth work
infrastructure failure is not presented as logout
```

Preserve error distinctions:

```text
UNAUTHENTICATED
NO_MEMBERSHIP
UNAUTHORIZED_ROLE
AMBIGUOUS_PROVIDER_CONTEXT
INFRASTRUCTURE_FAILURE
```

Do not add Redis merely to deduplicate request-local auth work.

## D. Production configuration

Fail fast on missing/invalid production configuration:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_APP_URL
RESEND_API_KEY
RESEND_FROM_EMAIL
```

Production app origin must be explicit HTTPS; no localhost fallback.

## E. Invitation lifecycle

Choose an intentional policy for duplicate active pending invites for the same Shop/email:

```text
reuse existing
OR
replace/revoke previous
```

Avoid accidental multiple valid invitations from retries/double clicks.

## Required regression

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:run
pnpm db:reset
pnpm test:db
pnpm build
affected E2E
```

## Exit gate

```text
[ ] durable public abuse protection implemented
[ ] Staff offboarding implemented
[ ] removed Staff denied by app + RLS
[ ] Auth errors classified safely
[ ] production config validates explicitly
[ ] invitation duplicate policy defined/tested
```
