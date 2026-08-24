# 15 — Security and Privacy

## Security model

Tracknologia does not rely on Next.js alone for security. Use layered enforcement:

```text
Next.js request/server surface (src/app)
        ↓
Supabase Auth (identity/session)
        ↓
Tracknologia authorization (Provider membership/business rules in src/features/auth/)
        ↓
PostgreSQL Row Level Security
        ↓
Database
```

## Authentication versus authorization

### Supabase Auth owns authentication

Supabase handles identity/session mechanics such as login, passwords, sessions, token issuance/refresh, and password reset.

Tracknologia does not implement password hashing or custom JWT authentication.

### Tracknologia owns authorization

Authentication only proves who the user is. Tracknologia must still determine:

- which Provider the user may act for;
- membership role (`OWNER` | `STAFF`);
- whether the Provider owns a Repair/Request;
- whether the requested business operation is allowed.

Centralize this through `src/features/auth/` rather than repeating ad hoc checks in pages. Authorization must **fail closed** (`NO_MEMBERSHIP`, `AMBIGUOUS_PROVIDER_CONTEXT`) and never mutate business state during read lookups.

## Row Level Security

Enable RLS on Provider-owned application tables exposed through Supabase.

Core invariants:

> A user belonging to Provider A cannot read or mutate Provider B's Provider data, Repair Requests, Repairs, status history, updates, or invitations.

> Direct client INSERT/UPDATE/DELETE on `provider_memberships` is strictly prohibited. Memberships must only be created via authorized atomic `SECURITY DEFINER` procedures (Owner onboarding / Staff invitation acceptance).

> Authenticated clients receive only column-level `UPDATE` privileges for
> Provider operating fields. Provider type, slug, ownership, IDs, and timestamps
> are not client-editable. Direct Service Mode writes are denied; Owners replace
> modes through the narrow atomic, Provider-serialized
> `set_provider_service_modes` function. Database checks also bound direct
> Provider/person-profile values that bypass application validation.

Application authorization remains required even with RLS. RLS is defense in depth, not a replacement for domain checks.

## Staff Invitation Security (LD-01)

Every Staff invitation is:

- created only by an authorized Provider `OWNER` of a `SHOP` provider;
- bound to exactly one Provider;
- single-use;
- expiring (7-day default);
- revocable by an OWNER;
- stored by one-way cryptographic digest (`token_hash = sha256(raw_token)`), never raw token;
- never exposed as a reusable credential in pending invitation lists;
- consumed atomically with `STAFF` membership and person profile creation via `accept_staff_invitation` RPC;
- database-enforced against users who already have an active Provider membership while multi-membership is unsupported.
- pre-auth invitation detail lookup returns only the invited email and public
  Shop identity; it does not expose Provider contact email or phone.

## Public Provider Projections

Anonymous and unauthenticated visitors cannot access raw `providers` table rows. Public access is strictly projected through `public_provider_profiles` which explicitly selects only safe public columns (`id`, `provider_type`, `display_name`, `slug`, `description`, `profile_image_url`, `public_address`, `service_area`, `supported_devices`, `service_modes`, `accepting_requests`, `created_at`) and only includes Providers accepting Requests. Internal contact numbers, billing emails, private metadata, and update timestamps are never exposed anonymously.

## Redirect Path Hardening

All auth and onboarding redirect target parameters (`redirectTo`, `next`) are validated using `getSafeInternalRedirectUrl()`. Protocol-relative URLs (`//evil.com`), external URLs (`https://...`), and non-HTTP schemes are strictly rejected in favor of safe internal relative paths (e.g. `/dashboard`).

## Server Actions and Route Handlers

Treat every mutation interface as externally callable.

Each sensitive operation must:

1. resolve/verify authenticated user;
2. resolve Provider context;
3. validate input with Zod;
4. verify object ownership/business rule;
5. perform persistence transaction.

Do not assume a hidden button or protected page makes a Server Action authorized.

### Repair Request surfaces

Feature 03 uses Server Actions as transport adapters only:

- public submission validates bounded FormData with Zod and passes the Provider
  slug to the Repair Requests Module;
- Provider accept/decline actions derive authenticated membership through
  `requireProviderContext()` and never accept `providerId`, `userId`, or role;
- route `requestId` values remain untrusted and are checked again by Module
  validation, persistence filters, database membership checks, and RLS.

### Repair operation surfaces

Feature 04 Server Actions validate FormData and pass only Repair locators plus
allow-listed business input to the Repairs Module. The Module derives Provider
context internally; browser-supplied Provider/user IDs and roles are not part
of the contracts. Cross-Provider and invalid Repair locators return the same
not-found behavior.

Authenticated members may read their Provider's Repairs and receive column-
level `UPDATE` privileges only for the authoritative customer/device and
Provider-authored detail fields. They cannot directly change origin, source,
ticket/tracking identifiers, status, ownership, actors, or timestamps. Direct
Repair insertion and Status Event insertion remain denied.

Repair Service Mode is a historical snapshot. Direct and application writes
that actually change `service_mode` pass through a narrow `SECURITY DEFINER`
trigger. It locks the owning Provider row `FOR SHARE` and rejects an unsupported
new non-null mode, serializing with the Owner-only Service Mode replacement's
`FOR UPDATE` lock. Unchanged historical modes and later Provider mode removal
remain valid; no mutable-configuration foreign key is introduced.

`create_provider_repair` atomically creates a direct Repair plus its initial
Status Event. `change_repair_status` locks the Repair and atomically changes
status, appends history, and maintains `completed_at`. Both functions derive
`auth.uid()`, recheck membership, set `search_path = public, pg_temp`, and hide
cross-Provider existence. Customer Updates use constrained append-only INSERT;
their RLS derives ownership through the parent Repair, and authenticated users
cannot edit or delete them.

## Proxy usage

Current Next.js uses `proxy.ts` terminology. Use Proxy for session refresh and coarse navigation/redirect behavior only.

Do not put the full Tracknologia authorization model in Proxy.

## Server-only code

Use `server-only` for sensitive persistence/auth implementation modules where useful to prevent accidental client imports:

- `src/features/repairs/persistence.ts`
- `src/features/tracking/persistence.ts`
- `src/features/tracking/queries.ts`
- `src/features/repair-requests/persistence.ts`
- `src/features/repair-requests/commands.ts`
- `src/features/repair-requests/queries.ts`
- `src/features/providers/persistence.ts`
- `src/features/providers/commands.ts`
- `src/features/providers/queries.ts`
- `src/features/auth/context.ts`
- `src/features/auth/persistence.ts`
- `src/features/auth/services.ts`
- `src/lib/supabase/server.ts`

## Input validation

Use Zod on the server for:

- Repair Request submission;
- direct Repair creation;
- Repair acceptance verification;
- status transitions;
- Provider profile changes;
- Staff invitation creation and acceptance;
- Tracking Code lookup shape/limits.

Browser validation is UX only.

Feature 03's database checks mirror the durable maximum lengths for Request and
Request-origin Repair snapshots. The browser cannot bypass status consistency,
same-Provider Request/Repair ownership, source uniqueness, or identifier shape.
Feature 04 applies the same snapshot bounds to direct creation and later detail
editing, bounds Customer Updates to nonblank 2,000-character messages, and
rechecks the exact Repair transition graph inside the database transaction.
Detail-edit input distinguishes omission from an intentional Service Mode
clear, while PostgreSQL repeats changed-mode support at write time.

## Public Repair Request submission

Anonymous callers have no direct `SELECT`, `INSERT`, `UPDATE`, or `DELETE`
privileges on `repair_requests`, `repairs`, or `repair_status_events`.
`submit_repair_request` is the only anonymous mutation surface. It is
`SECURITY DEFINER` with `search_path = public, pg_temp`, returns only Request
Reference and submission time, and rechecks:

- Provider exists and currently accepts Requests;
- preferred Service Mode is currently configured for that Provider;
- Service Mode/details pairing and durable input bounds.

The operation holds a shared Provider-row lock so profile/mode changes cannot
race the availability check. No Repair or private Provider row is returned.
Application/edge rate limiting remains required before broad hostile-Internet
exposure; CAPTCHA is deferred until observed abuse warrants it.

## Provider Request decisions

Authenticated clients receive read-only table grants. Accept/decline writes use
narrow `SECURITY DEFINER` functions that derive `auth.uid()`, resolve
membership, hide cross-Provider existence as `REQUEST_NOT_FOUND`, and lock the
Request before checking `SUBMITTED`. Acceptance atomically creates one Repair,
one initial Status Event, and one terminal Request state.

## Public tracking

Tracking Codes must be difficult to enumerate. Do not use sequential Ticket Numbers as the public credential.

Public lookup returns a dedicated `PublicRepairView`, never a complete Repair
row. `lookup_public_repair(text)` is the only anonymous database lookup surface.
It is `SECURITY DEFINER`, fixes `search_path`, rejects oversized/malformed input,
uses an explicit return-column allow-list, and caps nested Customer Updates at
25 message/timestamp pairs. Anonymous roles retain no direct `SELECT` privilege
on `providers`, `repairs`, `repair_updates`, or `repair_status_events`.

The Tracking Module validates the returned row with a strict Zod schema and
constructs the public object field-by-field. An unexpected database field or
oversized update list fails closed. Invalid and unknown codes share one neutral
not-found response. The Next.js form submits by POST so the credential is not
placed in a query string or browser history.

Never expose:

- Internal Notes;
- customer identity/contact information;
- Diagnosis, serial number, detailed specifications, and free-form Service Mode details;
- Ticket Number or an echoed Tracking Code;
- raw internal database ids;
- authentication ids, Update authors, and Status Event history;
- Provider-private information;
- privileged audit data.

Apply durable rate limiting before broad public exposure. It must protect the
direct Supabase RPC as well as the Next.js page; a process-memory limiter at the
web route alone is insufficient. Analytics remains optional and must not make
lookup availability depend on Feature 06.

## Secrets

Never expose Supabase secret/service-role credentials to the browser or prefix them with `NEXT_PUBLIC_`.

Browser-safe public/publishable configuration is distinct from privileged server credentials.

`.env.local` is never committed. Commit only `.env.example` with names/placeholders.

## Required security tests

- Provider A cannot read Provider B Repair or Provider data.
- Provider A cannot mutate Provider B Repair or Provider data.
- Provider A cannot accept Provider B Request.
- User B cannot self-assign membership to Provider A (tenant takeover prevention).
- Expired, revoked, or consumed staff invitations cannot be accepted.
- Staff invitations cannot be created or accepted for `INDEPENDENT` providers.
- An existing provider member cannot accept an invitation to join a second provider.
- Raw invitation tokens are never returned by pending listing APIs or stored in plain text.
- unauthenticated user cannot access Provider-owned operations.
- unauthenticated user can only query `public_provider_profiles` and not private provider columns.
- Provider Owner cannot mutate Provider type or slug through profile settings.
- Staff cannot mutate Provider operating fields or Service Modes.
- Staff can update only their own person profile, not another member's profile.
- failed Service Mode persistence rolls back Provider onboarding and replacement.
- concurrent Service Mode replacement leaves exactly one submitted set.
- direct profile writes cannot exceed durable database size/cardinality bounds.
- invitation detail lookup excludes private Provider contact fields.
- valid Tracking Code returns only public projection.
- invalid Tracking Code reveals minimal information.
- Internal Notes never enter public output.
- anonymous Tracking cannot read underlying Repair/Update rows directly;
- Tracking returns at most 25 message/timestamp-only Customer Updates;
- direct and Request-origin Repairs expose the same projection;
- disabling new Repair Requests does not disable an existing Repair's Tracking;
- repeated Request acceptance cannot create duplicate Repairs.
- concurrent accept/decline decisions serialize to one terminal outcome.
- anonymous callers cannot read Request/contact data or create Repairs directly.
- public submission rejects closed Providers and unsupported Service Modes.
- status transitions cannot bypass allowed business rules.
- direct Provider Repair creation commits one `IN_PROGRESS` Repair and initial
  Status Event or rolls back completely;
- authenticated clients cannot directly rewrite Repair lifecycle or identity
  columns;
- Customer Updates are Provider-scoped, append-only, and independent of Status
  Events;
- concurrent same-Repair transitions leave one consistent status/history pair;
- `COMPLETED` Repairs cannot be reopened and `completed_at` remains consistent.
