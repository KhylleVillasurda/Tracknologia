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

The public tracking feature returns only a safe `PublicRepairView`, for example:

```text
provider name
device summary
current status
customer-visible update
last updated timestamp
```

Never expose internal notes, private identifiers, contact data or complete Repair rows through the public interface.

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

Production exposure still needs:

- abuse/rate limiting before broad public exposure;
- optional CAPTCHA/bot protection only when actual abuse warrants it.

## Request decision integrity

Authenticated clients can read only Provider-owned Request/Repair/history rows
and cannot mutate those tables directly. Narrow decision RPCs lock the Request
before checking `SUBMITTED`. Acceptance commits Request `ACCEPTED`, one
`CUSTOMER_REQUEST` Repair, and its initial `IN_PROGRESS` Status Event together.
Unique `repair_request_id` prevents duplicate Repair creation on retry.

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
- accepted Repair Request cannot create multiple Repairs;
- concurrent acceptance creates one Repair and one initial Status Event;
- decline creates no Repair and cannot be repeated;
- Provider B cannot list, accept, or decline Provider A Request;
- anonymous callers cannot read Request contact/device/problem data;
- closed Provider and unsupported Service Mode public submissions fail;
- illegal Repair status transitions are rejected.
