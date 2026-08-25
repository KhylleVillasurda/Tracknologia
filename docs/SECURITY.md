# Security

Tracknologia uses defense in depth rather than relying on Next.js alone.

## Security layers

```text
Supabase Auth
      |
      v
Tracknologia authorization
      |
      v
PostgreSQL Row Level Security
      |
      v
Database
```

## Authentication

Supabase Auth owns authentication/session mechanics:

- signup/login;
- password handling;
- password reset;
- session/JWT handling;
- authenticated user identity.

Tracknologia must not implement its own password hashing or JWT system.

## Authorization

Tracknologia owns application permissions:

- current Provider membership;
- membership role;
- Provider ownership of Repair/Repair Request;
- allowed Repair state changes;
- public vs private data exposure.

An authenticated user is not automatically authorized for a resource.

## Provider isolation

Provider A must not read or mutate Provider B's Repairs or Repair Requests.

Enforce this twice:

1. application authorization in Tracknologia features;
2. PostgreSQL RLS policies as defense in depth.

Feature 03 Provider queries include the trusted `provider_id` from
`requireProviderContext()` and RLS independently checks
`get_auth_user_provider_ids()`. Accept/decline RPCs derive `auth.uid()` again,
hide cross-tenant rows as not found, and never trust URL/form ownership fields.

Provider profile mutation is additionally constrained by column-level grants:
Owners may edit operating/profile fields, but authenticated clients cannot
rewrite Provider type, slug, ownership, IDs, or timestamps. Direct writes to
`provider_service_modes` are denied; the Owner-only
`set_provider_service_modes` RPC replaces modes atomically and serializes
same-Provider calls with a row lock. Database checks bound direct profile values
that bypass application validation.

Feature 04 Provider operations likewise derive trusted context inside the
Repairs Module. Authenticated members may update only the explicitly granted
Repair snapshot/detail columns for their Provider. They cannot directly insert
Repairs or Status Events, or rewrite Provider ownership, source Request,
origin, ticket/tracking identifiers, lifecycle state, actors, or timestamps.

An actual Repair `service_mode` change is additionally guarded by
`enforce_repair_service_mode_update`. The trigger locks the owning Provider row
`FOR SHARE` and rejects unsupported new non-null values, so direct Supabase
writes cannot bypass configured-mode validation and concurrent Owner mode
replacement cannot create a stale-check success. Unchanged historical modes
remain valid after later Provider configuration removal.

Direct creation uses `create_provider_repair` to commit one Repair and initial
Status Event atomically. Lifecycle changes use `change_repair_status`, which
locks the Repair, rechecks the exact transition graph, appends history, and
maintains `completed_at` in one transaction. Cross-Provider identifiers are
hidden as not found. Customer Updates are Provider-scoped and append-only;
authenticated users cannot edit/delete them, and anonymous roles cannot read
the raw table.

## Public Provider and invitation projections

Anonymous users cannot read raw Provider rows. `public_provider_profiles`
allow-lists public identity, address/area, devices, Service Modes, and request
availability only for Providers accepting Requests. It excludes internal
contact fields and update timestamps.

Possessing a Staff invitation token permits a restricted lookup of the invited
email and public Shop identity. The lookup does not return the Provider's
private contact email or phone.

## Server Actions and Route Handlers

Treat every mutation interface as externally callable.

Every write must:

1. resolve authenticated context;
2. validate input;
3. verify Provider/resource authorization;
4. invoke the relevant feature module;
5. expose only the necessary result.

## Input validation

Use Zod on the server for untrusted input.

Client-side validation improves usability but is not a security control.

## Public tracking

Tracking codes must be difficult to enumerate and should not equal sequential ticket numbers.

The public tracking feature returns only a safe `PublicRepairView` through
`lookup_public_repair(text)`, for example:

```text
provider name
device summary
current status
customer-visible update
last updated timestamp
```

The function bounds and validates RPC input, fixes its `search_path`, returns
explicitly declared columns, and caps nested Updates at 25 message/timestamp
pairs. Only the server-only service-role client may execute it; anonymous and
authenticated callers also have no direct read privilege on Provider, Repair,
Customer Update, or Status Event tables. Disabling new Requests does not hide
Tracking for existing Repairs.

The Tracking Module rejects raw input longer than 128 characters before
normalization or persistence, strictly validates the database row, and
constructs output field-by-field. Invalid, oversized, and unknown codes share a
neutral result, and the public form uses POST rather than a credential-bearing
URL.

Never expose customer identity/contact, Internal Notes, Diagnosis, serial
numbers/specifications, free-form Service Mode details, Ticket Number, echoed
Tracking Code, private identifiers, Update authors, audit history, or complete
Repair rows through the public Interface.

The public Server Action derives connection metadata, converts it to a keyed
HMAC digest, and atomically consumes the shared PostgreSQL Tracking budget
before the lookup. Malformed and unknown codes remain the same neutral result.

## Analytics telemetry

Successful Tracking observation uses the separate
`record_successful_tracking_view(text)` function. The function bounds and
normalizes input, resolves an existing Repair internally, stores only
`repair_id` and server time, fixes its `search_path`, and returns no existence or
Repair data.

`tracking_events` has RLS enabled with no anonymous/authenticated direct table
privileges or policies. Telemetry excludes Tracking Codes, customer/contact and
Provider snapshots, IP addresses, user agents, cookies, fingerprints, Auth ids,
tokens, and arbitrary metadata. Repeated views are not represented as unique
Customers. Analytics persistence errors are sanitized and do not fail an
otherwise successful public Tracking result. The `/track` Server Action keeps
the submitted code inside its server closure and uses Next.js `after()` so an
unresolved Analytics operation is outside the response path. The serialized
action result contains neither the credential nor Analytics state.

The observation function is service-role only. Observation explicitly inherits
the successful Tracking lookup budget: it is scheduled at most once, after one
successful budgeted lookup. Analytics remains post-response and non-fatal, so
it does not add a second blocking limiter to the Tracking response path.

## Public Repair Requests

Implemented controls:

- server-side Zod validation;
- bounded database checks matching Module limits;
- default Server Action request/body-size controls;
- no anonymous direct table read/write grants;
- one allow-listed `submit_repair_request` RPC returning only Reference and time;
- Provider availability and configured Service Mode rechecked under a Provider
  row lock;
- unpredictable `REQ-[A-F0-9]{16}` public Request References.

Public operations trust boundary:

- The application server invokes the public operation RPCs
  (`lookup_public_repair`, `record_successful_tracking_view`,
  `submit_repair_request`) with the server-only service-role credential via
  `src/lib/supabase/service.ts`; `anon`/`authenticated` EXECUTE is revoked
  (`20260825120000_restrict_public_rpc_grants.sql`). The publishable key alone
  cannot reach Postgres, so abuse control in the application layer cannot be
  bypassed by direct database calls.
- The Tracking and Repair Request Server Actions atomically consume isolated,
  configurable PostgreSQL budgets before invoking their owning features.
  Durable rows contain only the operation, an opaque server-keyed HMAC actor
  key, the bounded window/count, and expiry. Expiry ends a row's logical effect
  immediately. A later check physically prunes at most 100 expired rows; rows
  may remain while the service is idle, but idle periods create no new rows.

The final public trust boundary is:

```text
browser
-> trusted production ingress strips/overwrites internal headers and injects proof
-> Next.js Server Action verifies ingress proof and checks durable abuse control
-> service-role-only narrow public-operation RPC
```

Production ingress must strip incoming `x-tracknologia-proxy-secret` and
`x-tracknologia-client-ip` headers, overwrite the client-IP header, inject the
proof secret, and prevent direct access to the Next.js upstream. The action
accepts the client IP only after a constant-time proof check and fails closed
when proof or metadata is absent/invalid. `PUBLIC_ABUSE_HMAC_SECRET` and the
separate `PUBLIC_ABUSE_TRUSTED_PROXY_SECRET` are server-only, must each contain
at least 32 characters, and must be shared by the relevant app/ingress
instances. Never reuse one as the other.

The supported local Docker setup exposes Next.js directly and therefore does
not trust forwarding headers. Local development opts into one shared
abuse-control bucket by setting `PUBLIC_ABUSE_SHARED_DEV_BUCKET=true`; the
opt-in is explicit and environment-based, so a staging or production deployment
that forgets its ingress configuration fails closed instead of silently sharing
one bucket. Arbitrary forwarded values cannot create additional buckets.

The public Server Actions deliberately consume their budget before validating
form input, so hostile traffic cannot obtain free schema validation probes from
the application.

Production exposure still needs:

- optional CAPTCHA/bot protection only when actual abuse warrants it.

## Request decision integrity

Authenticated clients can read only Provider-owned Request/Repair/history rows.
Feature 03 Request rows remain read-only to clients. Narrow decision RPCs lock the Request
before checking `SUBMITTED`. Acceptance commits Request `ACCEPTED`, one
`CUSTOMER_REQUEST` Repair, and its initial `IN_PROGRESS` Status Event together.
Unique `repair_request_id` prevents duplicate Repair creation on retry.

Feature 04 grants only allow-listed Repair detail columns and Customer Update
insertion. Repair creation and lifecycle/history remain narrow transaction
surfaces rather than direct table writes. Service Mode detail editing remains a
single Repair update with a narrow changed-mode integrity trigger.

## Environment secrets

Browser-safe Supabase project configuration may use `NEXT_PUBLIC_*`.

Privileged service-role/secret keys must never use `NEXT_PUBLIC_*`, appear in browser bundles, or be committed to Git.

## Server-only implementation

Use server-only imports/structure around database and privileged implementation code so Client Components cannot accidentally depend on it.

## Security tests

At minimum test:

- Provider A can read Provider A Repair;
- Provider A cannot read/update Provider B Repair;
- Provider A cannot accept Provider B Repair Request;
- unauthenticated users cannot access Provider data;
- Provider Owners cannot rewrite Provider type or slug through profile updates;
- Staff cannot update Provider operating fields or Service Modes;
- Staff can update only their own person profile;
- failed configured onboarding and Service Mode replacement leave no partial state;
- concurrent Service Mode replacement leaves exactly one submitted set;
- direct profile writes cannot exceed durable database bounds;
- anonymous Provider/invitation projections exclude private contact fields;
- public tracking does not expose internal notes/contact data;
- invalid tracking identifiers reveal no sensitive information;
- public tracking caps Updates and returns message/timestamp pairs only;
- anonymous/authenticated callers cannot read or write `tracking_events`
  directly;
- malformed and unknown Tracking Codes create no telemetry;
- oversized direct observation input creates no telemetry or existence detail;
- successful-view telemetry contains only Repair correlation and observation
  time;
- Analytics latency/failure neither delays a successful Tracking response nor
  logs the credential/database detail;
- anonymous callers cannot read raw Repair/Update/Status Event tables;
- direct and Request-origin Repairs share one public projection;
- closing new Requests does not disable existing Repair tracking;
- accepted Repair Request cannot create multiple Repairs;
- concurrent acceptance creates one Repair and one initial Status Event;
- decline creates no Repair and cannot be repeated;
- Provider B cannot list, accept, or decline Provider A Request;
- anonymous callers cannot read Request contact/device/problem data;
- closed Provider and unsupported Service Mode public submissions fail;
- illegal Repair status transitions are rejected;
- direct Repair creation cannot leave a Repair without its initial event;
- direct authenticated status/identity edits and Status Event insertion fail;
- unrelated detail edits preserve removed historical Repair Service Modes;
- direct unsupported Repair Service Mode updates fail without changing durable
  state;
- concurrent Repair mode edits and Provider mode replacement serialize to a
  valid outcome;
- Customer Updates are Provider-scoped, append-only, and independent of status;
- concurrent lifecycle changes leave one consistent status/event outcome;
- completed Repairs cannot be reopened and have a matching completion time.
