# Feature — Tracking (Public Customer Tracking)

**Code location:** `src/features/tracking/`  
**Route location:** `src/app/(public)/track/`

## Description

The Tracking feature allows Customers to check the status of their active Repair or submitted Repair Request using a secure Tracking Code (`TRK-...`) or Request Reference Code (`REQ-...`) without creating an account or logging in.

## Primary goal

Provide a frictionless, secure, accountless way for Customers to stay informed about repair progress and repair request review status, reducing inbound phone/message inquiries for Providers while respecting customer privacy.

## Feature goals

- Allow accountless lookup by full Tracking Code (`TRK-[A-F0-9]{24}`) or Request Reference Code (`REQ-[A-F0-9]{16}`);
- Display current status, device summary, and intentionally public Customer Updates;
- Seamlessly transition customer visibility from submitted request review to active repair progress upon request acceptance;
- Display distinct, customer-safe guidance for `SUBMITTED` (awaiting review) and terminal `DECLINED` (declined request) states;
- Display Provider name and handover/collection details when ready/completed;
- Protect customer privacy and internal repair notes;
- Prevent brute-force scanning through unpredictable credentials, strict format bounds, rate limiting, and private database RPCs.

## Non-goals

- Customer login / account management;
- Customer self-service edit/cancellation of repairs;
- Live technician chat/messaging (updates are one-way broadcast from Provider);
- In-app payment processing (MVP relies on offline/manual settlement);
- Exposing internal tickets, private notes, or sensitive customer phone numbers on public views.

## User flows

### 1. Customer checks repair or request status

1. Customer navigates to `/track` (or follows `/track?code=REQ-...` link from their request receipt);
2. Customer enters their Tracking Code (`TRK-...`) or Request Reference (`REQ-...`);
3. System validates format and looks up the public record via restricted service-role RPC;
4. If found:
   - For `SUBMITTED` request: displays request review status and waiting guidance;
   - For `DECLINED` request: displays terminal decline status without implying future acceptance;
   - For active repairs (or accepted requests): displays current status, device summary, provider name, and chronological progress updates;
5. If not found: displays a neutral error message (`Status could not be found. Check the code and try again.`).

## UI surfaces and components

### `/track` route

- Search input accepting `TRK-` or `REQ-` code;
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
Next.js `after()`. In v0.1.0, Tracking-view Analytics records views from TRK-origin
codes (persisting only the resolved Repair id and observation timestamp). Request-only
or unaccepted requests do not record tracking events. Malformed, unknown, failed, or
invalid-projection lookups schedule nothing. Only the resolved Repair id and observation
time are persisted; the Tracking Code and customer information are not stored.

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

The public projection exposes **only**:

- Provider display name;
- device summary (`deviceType` + `brand` + `model`);
- normalized current status;
- customer updates (`message`, `createdAt`);
- service mode and handover instructions (when relevant).

Do **not** expose:

- customer name, phone, or address;
- serial number, pin, or internal diagnosis notes;
- internal database UUIDs (repair id, request id, provider id);
- repair cost / pricing details;
- assigned staff member identity.

## Testing expectations

- Valid `TRK-...` code returns expected public repair projection;
- Valid `REQ-...` code returns expected public request or converted repair projection;
- `DECLINED` status displays terminal decline guidance and never presents awaiting-review language;
- Corrupt/invalid database projections fail closed;
- Invalid, malformed, or nonexistent codes return `null` without throwing internal errors;
- Customer contact and internal provider notes are never present in returned payload;
- Updates array is ordered newest-first and capped at 25 entries;
- Direct RPC access is denied for `anon` and `authenticated` Supabase clients.

## Implemented baseline

The feature is implemented in:

- `src/features/tracking/`: Unified tracking queries, domain mapping, validation schemas, and types;
- `src/app/(public)/track/`: Public tracking page, server actions, and responsive status/timeline UI;
- `supabase/migrations/20260827100001_unified_public_tracking_rpc.sql`: Restricted `lookup_public_repair` RPC supporting both `TRK-` and `REQ-` resolution under `service_role`.
