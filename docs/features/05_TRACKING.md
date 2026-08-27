# Feature — Tracking

**Code location:** `src/features/tracking/`

## Description

The Tracking feature gives Customers **accountless, customer-safe visibility into an accepted Repair or submitted Request** through an unpredictable Tracking Code (`TRK-...`) or Request Reference (`REQ-...`).

Tracking is intentionally a restricted public read model rather than public access to the internal Repairs or Repair Requests feature.

## Primary goal

Reduce repeated status inquiries by giving Customers a simple, trustworthy view of meaningful repair or request progress without requiring a Tracknologia account.

## Feature goals

- Allow public lookup by Tracking Code (`TRK-...`) or Request Reference Code (`REQ-...`).
- Seamlessly transition status from Request intake (`SUBMITTED`/`DECLINED`) to active Repair progress (`IN_PROGRESS`, `WAITING_FOR_PARTS`, `AWAITING_APPROVAL`, `READY`, `COMPLETED`) under the same lookup seam.
- Require no Customer login/account.
- Return a purpose-built `PublicRepairView` rather than a raw Repair or Request record.
- Show only information useful and safe for Customers.
- Show current Status and customer-visible updates.
- Use Provider-neutral wording that works for Shops and Independent Repairers.
- Avoid leaking whether arbitrary internal ids/resources exist.
- Protect the public lookup surface against code enumeration/abuse.
- Record tracking-view metrics for active repairs when validation instrumentation is enabled.

## Non-goals

The MVP Tracking feature does not provide:

- customer mutation of Repair data;
- customer approval workflow inside Tracknologia;
- customer chat;
- customer authentication/profile;
- full Repair history/internal status audit;
- Internal Notes;
- Provider-private Diagnosis/technical data unless explicitly deemed public-safe;
- map/navigation features.

## Main actor

- **Customer** — person tracking an accepted Repair or submitted Request.

Provider Users may preview the public view, but the Interface is designed for unauthenticated access.

## Conceptual Interface

```ts
lookupRepairByTrackingCode(code): PublicRepairView | null
```

Keep the public Interface narrow.

## PublicRepairView

The implemented view includes only:

- Provider display name;
- device type plus optional brand/model composed as one safe summary;
- current Status (`IN_PROGRESS`, `WAITING_FOR_PARTS`, `AWAITING_APPROVAL`, `READY`, `COMPLETED`, `SUBMITTED`, `DECLINED`) plus customer-facing label/description;
- at most the latest 25 Customer Updates, newest first;
- last-updated timestamp across activity;
- selected Service Mode without free-form arrangement details;
- Provider-neutral handover wording when `READY`;
- tracking type (`"REPAIR" | "REQUEST"`) and normalized reference code.

Must not include:

- customer phone/email;
- customer name;
- Internal Notes;
- Diagnosis, serial number, or detailed technical snapshot;
- raw internal ids;
- Ticket Number;
- authenticated user ids;
- Provider-private fields;
- Customer Update authors and Status Event history;
- unrelated customer information;
- unrestricted internal technical notes.

## Workflow

```text
Customer opens /track
        ↓
Enter Tracking Code or Request Reference in POST-backed form
(Optional: REQ reference pre-filled from submission receipt URL)
        ↓
Validate input format
        ↓
Lookup restricted public projection via service-role backend RPC
        ↓
Not found OR PublicRepairView
        ↓
Render Provider + Device + Status + Customer Updates
```

## Routes and UI

```text
/track
```

The page can contain:

### Lookup state

- Tracking Code / Request Reference input;
- clear submit action;
- minimal help text.

### Success state

Emphasize:

1. current status;
2. device identity;
3. Provider identity;
4. latest Customer Update;
5. last updated;
6. service/handover context where useful.

### Failure state

Use a neutral result such as invalid/not found without exposing internal lookup details.

The implemented route uses a thin Server Action and `useActionState`. Tracking Codes (`TRK-...`) are submitted strictly via POST body and never prefilled via URL query parameters or browser history to preserve credential privacy. Request References (`REQ-...`) may be prefilled from the submission receipt for customer convenience.

## Relationships with other features

### Repairs

Tracking reads only a customer-safe projection of Repair state and Customer Updates. Tracking never mutates Repair lifecycle.

### Repair Requests

Tracking allows customers to check the status of unaccepted/declined requests using their reference code. When accepted, it smoothly displays the active repair progress.

### Providers

Tracking may display intentionally public Provider identity.

### Auth

No Provider authentication is required for normal customer lookup.

### Analytics

Tracking returns the validated `PublicRepairView` without importing or waiting
for Analytics. After a successful result, the `/track` Server Action captures
the submitted code server-side and schedules one Analytics observation with
Next.js `after()` (for active repairs). Malformed, unknown, failed, or invalid-projection lookups
schedule nothing. Only the resolved Repair id and observation time are
persisted; the Tracking Code and customer information are not stored.

## Security requirements

### Tracking Code & Request Reference

The Tracking Code acts as a public credential and therefore must be:

- non-trivial;
- difficult to enumerate/guess;
- distinct from human-readable Ticket Number.

Do not expose sequential ticket numbers as the only public lookup credential.

The Tracking Module rejects raw input longer than 128 characters before
trimming or uppercasing it. PostgreSQL independently bounds direct RPC input
so callers cannot bypass the application guard.

### Rate limiting

Apply reasonable rate limiting to public lookup when infrastructure supports
it. Controls protect the public Next.js page; RPC access is strictly revoked from
`anon`/`authenticated`/`PUBLIC` roles and only executable by `service_role`. Broad production
exposure remains gated on a durable gateway or equivalent control.

### Data minimization

Public output is whitelisted field-by-field. Never serialize a full Repair object and then attempt to remove a few private fields afterward.

## Status presentation

Use customer-friendly meanings consistent with the domain:

- `IN_PROGRESS` — repair is actively being worked on;
- `WAITING_FOR_PARTS` — work is waiting on required part/material;
- `AWAITING_APPROVAL` — Provider is waiting for Customer approval;
- `READY` — work is finished and device is ready for the appropriate handover arrangement;
- `COMPLETED` — repair engagement and handover are finished;
- `SUBMITTED` — provider has received the repair request and is reviewing it;
- `DECLINED` — provider was unable to accept the repair request.

Do not invent mandatory sub-stages such as Diagnosing/Testing unless the domain model changes.

## Important edge cases

### Valid Ticket Number but wrong Tracking Code

Ticket Number alone should not grant public access unless product requirements explicitly change.

### Unknown Tracking Code / Reference Code

Return a minimal not-found result. Do not reveal internal identifiers or Provider/customer details.

### Internal Note exists

It remains invisible regardless of current status.

### Customer Update exists while status is unchanged

Show the update. Customer Updates and status transitions are independent concepts.

## Testing expectations

Test:

- valid Tracking Code returns safe view;
- valid Request Reference Code returns safe view;
- invalid/unknown code returns minimal failure;
- oversized raw input is rejected before normalization or persistence;
- customer contact information is excluded;
- Internal Notes are excluded;
- internal ids/auth ids are excluded;
- Customer Updates are included;
- only the latest 25 Customer Updates are returned in newest-first order;
- status labels/semantics are correct across all Repair and Request statuses;
- Provider-neutral READY presentation;
- direct and Request-origin Repairs share the same public view;
- Tracking continues after a Provider stops accepting new Requests;
- anonymous raw Repair/Customer Update access remains denied;
- rate-limit behavior where implemented.

## Implemented baseline

Feature 05 is implemented through:

- `src/features/tracking/` for pre-normalization input bounding, normalization,
  strict projection validation, customer-safe status/handover presentation,
  and the single `lookupRepairByTrackingCode` Interface;
- `/track` for the responsive accountless POST-backed lookup experience;
- `20260827100001_unified_public_tracking_rpc.sql` for the bounded,
  allow-listed `lookup_public_repair` function restricted to `service_role`;
- feature-local tests for normalization, projection fail-closed behavior,
  every status meaning, update bounds, and READY wording;
- real PostgreSQL integration coverage for anonymous lookup, both Repair
  origins, closed-Provider continuity, raw-table denial, and field exclusion;
- route-owned, post-response Feature 06 observation after successful projection
  validation; Analytics latency/failure does not delay or change the public
  Tracking result.

The lookup function returns only named public columns and nested Update
message/timestamp pairs. Anonymous callers retain no direct table or RPC access.
Successful-view analytics is owned by Feature 06 and is not an availability
dependency.

## Definition of done

The feature is healthy when a Customer can understand where an accepted Repair or submitted Request currently stands without contacting the Provider, while the system reveals no Provider-private or unrelated customer data.
