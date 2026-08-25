# Feature — Tracking

**Code location:** `src/features/tracking/`

## Description

The Tracking feature gives Customers **accountless, customer-safe visibility into an accepted Repair** through an unpredictable Tracking Code.

Tracking is intentionally a restricted public read model rather than public access to the internal Repairs feature.

## Primary goal

Reduce repeated status inquiries by giving Customers a simple, trustworthy view of meaningful repair progress without requiring a Tracknologia account.

## Feature goals

- Allow public lookup by Tracking Code.
- Require no Customer login/account.
- Return a purpose-built `PublicRepairView` rather than a raw Repair record.
- Show only information useful and safe for Customers.
- Show current Repair Status and customer-visible updates.
- Use Provider-neutral wording that works for Shops and Independent Repairers.
- Avoid leaking whether arbitrary internal ids/resources exist.
- Protect the public lookup surface against code enumeration/abuse.
- Record tracking-view metrics when validation instrumentation is enabled.

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

- **Customer** — person tracking an accepted Repair.

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
- current Repair Status plus customer-facing label/description;
- at most the latest 25 Customer Updates, newest first;
- last-updated timestamp across Repair and Customer Update activity;
- selected Service Mode without free-form arrangement details;
- Provider-neutral handover wording when `READY`.

Must not include:

- customer phone/email;
- customer name;
- Internal Notes;
- Diagnosis, serial number, or detailed technical snapshot;
- raw internal ids;
- Ticket Number or echoed Tracking Code;
- authenticated user ids;
- Provider-private fields;
- Customer Update authors and Status Event history;
- unrelated customer information;
- unrestricted internal technical notes.

## Workflow

```text
Customer opens /track
        ↓
Enter Tracking Code in POST-backed form
        ↓
Validate input format
        ↓
Lookup restricted public projection
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

- Tracking Code input;
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

The implemented route uses a thin Server Action and `useActionState`. The
Tracking Code is submitted in a POST body rather than placed in URL query
parameters or browser history.

## Relationships with other features

### Repairs

Tracking reads only a customer-safe projection of Repair state and Customer Updates. Tracking never mutates Repair lifecycle.

### Providers

Tracking may display intentionally public Provider identity.

### Auth

No Provider authentication is required for normal customer lookup.

### Analytics

After a successful public projection is validated, Tracking asks Analytics to
record one successful view. Malformed, unknown, failed, or invalid-projection
lookups record nothing. Analytics failure is sanitized and does not replace a
successful customer result. Only the resolved Repair id and observation time
are persisted; the Tracking Code and customer information are not stored.

## Security requirements

### Tracking Code

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
it. Controls must protect the directly callable Supabase RPC as well as the
Next.js page; an application-process memory limiter would not satisfy this
requirement. Broad production exposure remains gated on a durable gateway or
equivalent control.

### Data minimization

Public output is whitelisted field-by-field. Never serialize a full Repair object and then attempt to remove a few private fields afterward.

## Status presentation

Use customer-friendly meanings consistent with the domain:

- `IN_PROGRESS` — repair is actively being worked on;
- `WAITING_FOR_PARTS` — work is waiting on required part/material;
- `AWAITING_APPROVAL` — Provider is waiting for Customer approval;
- `READY` — work is finished and device is ready for the appropriate handover arrangement;
- `COMPLETED` — repair engagement and handover are finished.

Do not invent mandatory sub-stages such as Diagnosing/Testing unless the domain model changes.

## Important edge cases

### Valid Ticket Number but wrong Tracking Code

Ticket Number alone should not grant public access unless product requirements explicitly change.

### Unknown Tracking Code

Return a minimal not-found result. Do not reveal internal identifiers or Provider/customer details.

### Internal Note exists

It remains invisible regardless of current status.

### Customer Update exists while status is unchanged

Show the update. Customer Updates and status transitions are independent concepts.

## Testing expectations

Test:

- valid Tracking Code returns safe view;
- invalid/unknown code returns minimal failure;
- oversized raw input is rejected before normalization or persistence;
- customer contact information is excluded;
- Internal Notes are excluded;
- internal ids/auth ids are excluded;
- Customer Updates are included;
- only the latest 25 Customer Updates are returned in newest-first order;
- status labels/semantics are correct;
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
- `20260824030000_add_public_tracking_lookup.sql` for the bounded,
  allow-listed `lookup_public_repair` function;
- feature-local tests for normalization, projection fail-closed behavior,
  every status meaning, update bounds, and READY wording;
- real PostgreSQL integration coverage for anonymous lookup, both Repair
  origins, closed-Provider continuity, raw-table denial, and field exclusion.
- a best-effort Feature 06 observation after successful projection validation;
  analytics failure does not change the public Tracking result.

The lookup function returns only named public columns and nested Update
message/timestamp pairs. Anonymous callers retain no direct table access.
Successful-view analytics is owned by Feature 06 and is not an availability
dependency.

## Definition of done

The feature is healthy when a Customer can understand where an accepted Repair currently stands without contacting the Provider, while the system reveals no Provider-private or unrelated customer data.
