# Plan 05 — Production Configuration and Email Reliability

**Plan type:** P1 deployment/reliability chore  
**Recommended branch:** `chore/production-config`  
**Authoritative source:** `02_SECURITY_AND_RELIABILITY_HARDENING.md` §D, `05_LOAD_RESILIENCE_AND_PERFORMANCE.md` dependency drills, `07_RELEASE_CANDIDATE_AND_DEPLOYMENT.md`

> Derived from the [Handoff Bundle](../handoff/00_POST_MVP_MASTER_HANDOFF.md). Shared guardrails, verification gates, and the multi-agent strategy live in [00_MASTER_INDEX_AND_DEPENDENCY_MAP.md](00_MASTER_INDEX_AND_DEPENDENCY_MAP.md#shared-execution-context); this file carries only plan-specific content.

## Objective

Fail fast on missing or unsafe production configuration and make invitation/password-reset email behavior explicit under dependency failure.

Required production configuration:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_APP_URL
RESEND_API_KEY
RESEND_FROM_EMAIL
```

Production app origin must be explicit HTTPS; localhost fallback is not acceptable in production.

## Implementation Phases

### Phase 1 — Central server configuration validation

Locate current environment reads and introduce one small validated configuration seam. Validate at startup/build/request initialization according to what the current Next.js runtime safely supports.

Rules:

- `NEXT_PUBLIC_APP_URL` must parse as an absolute URL.
- Production requires `https:` and rejects localhost/loopback.
- Required Resend values must be present when production email paths are enabled.
- Never expose `RESEND_API_KEY` to client bundles.
- Public Supabase values may remain public by design.

### Phase 2 — Remove production fallbacks

Any fallback such as inferred host, `localhost:3000`, fake sender, or test toggle must be limited to explicit local/test environments. Production misconfiguration returns a clear operational failure rather than silently constructing a bad callback URL.

### Phase 3 — Email send semantics

For Staff invitation and password reset flows:

```text
business state persisted only according to intentional workflow
email send attempted
email failure surfaced explicitly
raw invitation credential never logged in production
retry/share fallback behavior explicit
```

For Staff invitation, if database invitation creation succeeds but Resend fails, the UI must tell the OWNER what happened and provide only the currently approved safe fallback/share path. Do not accidentally create duplicate invitations on retry; coordinate with Plan 06.

### Phase 4 — Dependency-failure drill

Simulate Resend unavailable/invalid credentials and verify:

```text
no false "email sent" success
invitation state remains internally consistent
retry does not create duplicate membership/invitation state
no raw token in production logs
```

Simulate Supabase unavailable and verify authenticated operations surface temporary infrastructure failure safely.

### Phase 5 — Documentation and deployment checks

Update setup/production docs with required variables, secret/public classification, HTTPS requirement, sender verification, and smoke commands. Do not commit real secrets.

## Likely Files

```text
src/lib or existing config/env seam (inspect before adding)
src/features/auth/**
src/features/providers/** invitation email path
src/app auth callback/actions where origin is constructed
.env.example or existing environment example
docs/SETUP / SECURITY / deployment docs
CI/deployment validation script if appropriate
```

## Tests

```text
production missing each required variable -> validation failure
production HTTP/localhost NEXT_PUBLIC_APP_URL -> validation failure
local development fallback remains explicit if currently supported
Resend failure -> safe non-success result
no raw invitation token in non-development logs
password reset uses explicit production origin
```

## Acceptance Criteria

```text
[ ] all required production config validates explicitly
[ ] production app origin is explicit HTTPS
[ ] no production localhost fallback
[ ] Resend missing/invalid config fails safely
[ ] invitation/email failure does not corrupt lifecycle
[ ] no secrets/raw invitation credentials logged
[ ] deployment docs identify required values and sender verification
```
