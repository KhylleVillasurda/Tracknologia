# Plan 06 — Staff Invitation Duplicate/Retry Policy and Idempotency

**Plan type:** P1/P2 reliability fix requiring product policy choice  
**Recommended branch:** `fix/invitation-lifecycle`  
**Authoritative source:** `02_SECURITY_AND_RELIABILITY_HARDENING.md` §E, `04_BUG_BURN_AND_FEATURE_CONTROL.md`

> Derived from the [Handoff Bundle](../handoff/00_POST_MVP_MASTER_HANDOFF.md). Shared guardrails, verification gates, and the multi-agent strategy live in [00_MASTER_INDEX_AND_DEPENDENCY_MAP.md](00_MASTER_INDEX_AND_DEPENDENCY_MAP.md#shared-execution-context); this file carries only plan-specific content.

## Objective

Prevent retries/double-clicks from producing multiple simultaneously valid Staff invitations for the same Shop/email.

## Required Decision Before Coding

The handoff intentionally leaves one policy choice open:

```text
A. reuse existing active pending invite
OR
B. revoke/replace previous active pending invite
```

Lead must select one and record it in the issue/PR. The implementation may not accidentally create multiple active invitations while this decision is unresolved.

### Recommended minimal policy

`Reuse existing active pending invite` minimizes churn and avoids invalidating a link merely because an OWNER double-clicks. If product behavior requires a fresh credential on every resend, choose revoke/replace instead and test the invalidation explicitly.

## Durable Invariant

For a given:

```text
provider_id + normalized recipient email
```

there must be at most one invitation that is simultaneously:

```text
accepted_at IS NULL
revoked_at IS NULL
expires_at > now()
```

Because expiry is time-dependent, enforce this through the narrow invitation transaction/locking strategy rather than assuming a simple partial unique index can express `now()` safely.

## Implementation Phases

### Phase 1 — Normalize semantics

- Email comparison uses normalized lowercase/trimmed form.
- Only SHOP OWNER may create/reuse/replace.
- Expired/revoked/accepted invitations do not count as active.

### Phase 2 — Race-safe creation

The narrow invitation creation persistence operation should serialize competing creates for the same Provider/email, recheck active invitation state, then apply the chosen policy atomically.

Possible approaches include an advisory lock keyed by Provider + normalized email or a locking query over a durable key. Choose the smallest approach consistent with current PostgreSQL conventions.

### Phase 3A — Reuse policy

If reuse is selected:

```text
existing active pending invite -> return/reuse deliberate result
no second invitation row
email resend behavior must not expose the stored digest as raw token
```

Important: because only a digest is persisted, the system cannot reconstruct the original raw invitation credential. Therefore "reuse" may mean reusing the durable invitation row while issuing/replacing a credential only if the current design supports that securely. If raw-token reconstruction is impossible, this policy requires a deliberate credential strategy before coding.

### Phase 3B — Revoke/replace policy

If replace is selected:

```text
lock active invite
mark it revoked
create new digest/expiry
return only new raw credential to application
```

The old link must fail immediately.

### Phase 4 — UI retry behavior

Disable or debounce duplicate submission for UX, but treat that as convenience only; durable DB behavior remains authoritative.

### Phase 5 — Email failure interaction

Coordinate with Plan 05 so a resend after Resend failure follows the chosen duplicate policy and does not create uncontrolled active links.

## Tests

```text
double-click/parallel create for same Shop/email
parallel creates result in one active invitation
same email in different Shop follows Provider isolation rules
expired invitation permits new active invite
revoked invitation permits new active invite
accepted invitation permits new invite only if domain membership rules allow recipient eligibility
old token invalid after replacement policy
```

## Likely Files

```text
src/features/providers/commands.ts
src/features/providers/persistence.ts
src/features/providers/providers.test.ts
supabase/migrations/<forward migration>.sql if transaction/function changes
tests/integration/providers.db.test.ts or current db test
affected Team invitation UI/action
```

## Acceptance Criteria

```text
[ ] Lead-selected duplicate policy documented
[ ] one active pending invitation maximum per Shop/email under concurrency
[ ] retry/double-click cannot create accidental valid duplicates
[ ] email failure retry follows same policy
[ ] expiration/revocation/single-use semantics preserved
[ ] raw token remains non-persistent
```
