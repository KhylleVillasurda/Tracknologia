# Feature — Repair Requests

**Code location:** `src/features/repair-requests/`

## Description

The Repair Requests feature captures **customer-submitted pre-repair information for one specific Provider**.

A Repair Request is an intake/request record awaiting Provider review. It is not yet an accepted Repair and must not be treated as authoritative technical diagnosis or final repair intake.

## Primary goal

Reduce friction for Customers who want to provide device/problem information before Provider acceptance, while preserving Provider control over what becomes an authoritative Repair.

## Feature goals

- Allow a Customer to submit a Request without creating an account.
- Target exactly one Provider through a provider-specific request page.
- Capture useful but lightweight customer/device/problem information.
- Record a Request Reference distinct from Repair ticket/tracking identifiers.
- Give the owning Provider a private Request inbox and detail view.
- Allow the Provider to decline a Request without creating a Repair.
- Allow the Provider to verify/correct customer-supplied data before accepting.
- Guarantee that one Request creates at most one Repair.
- Converge accepted Requests into the same Repairs feature used by direct Provider creation.

## Non-goals

The MVP does not include:

- a global lead/request pool;
- bidding or claiming;
- multi-Provider Request broadcasting;
- chat/messaging workflow;
- estimates/quotations;
- Recommendation Letter-like request workflows;
- customer authentication;
- a separate downstream lifecycle for Request-originated Repairs.

## Main actors

- **Customer** — submits the Request publicly.
- **Provider User** — reviews, accepts, or declines Requests owned by their Provider.

## Owned data

### `repair_requests`

Important categories:

#### Request identity

- `id`;
- `provider_id`;
- `reference_code`.

#### Customer snapshot

- name;
- phone;
- optional email.

#### Device/problem information

- device type;
- optional brand/model/serial/color/specs;
- Reported Problem;
- problem timing/context;
- troubleshooting attempted;
- additional information.

#### Service arrangement

- preferred Service Mode;
- optional mode details.

#### Request lifecycle

```text
SUBMITTED
ACCEPTED
DECLINED
```

## State model

```text
creation → SUBMITTED
SUBMITTED → ACCEPTED
SUBMITTED → DECLINED
```

`ACCEPTED` and `DECLINED` are terminal for the MVP Request lifecycle.

## Conceptual Interface

```ts
submitRepairRequest(providerSlug, input): RepairRequestReceipt
listRepairRequests(options?): RepairRequestPage
getRepairRequest(requestId): RepairRequestDetail | null
acceptRepairRequest(requestId, verifiedInput): AcceptedRepairResult
declineRepairRequest(requestId): RepairRequestDetail
```

`RepairRequestPage` contains up to 25 summaries plus the current page and
`hasPrevious`/`hasNext` navigation flags. Options include an optional status
and positive page number.

Provider-side Interfaces resolve trusted `ProviderContext` internally; callers
do not supply Provider/user ownership identifiers.

## Public submission workflow

```text
Customer opens /p/[providerSlug]/request
        ↓
Providers loads public Provider profile
        ↓
Check accepting_requests
        ↓
Show supported Service Modes
        ↓
Customer enters contact + device + Reported Problem
        ↓
Server validates untrusted input
        ↓
Create RepairRequest(SUBMITTED)
        ↓
Generate Request Reference
        ↓
Return submission receipt
```

No Repair is created at this stage.

## Provider review workflow

```text
Provider User
  ↓ Auth / ProviderContext
/dashboard/requests
  ↓
List only own Provider's Requests
  ↓
Open Request detail
  ↓
Review customer-reported information
  ↓
Accept & Create Repair OR Decline
```

## Acceptance workflow

```text
SUBMITTED Request
        ↓
Provider chooses Accept & Create Repair
        ↓
Verify/correct customer and device data
        ↓
Add Provider-only intake information
        ↓
Validate Request still SUBMITTED
        ↓
Create exactly one authoritative Repair
        ↓
Repair.origin = CUSTOMER_REQUEST
Repair.status = IN_PROGRESS
Ticket Number generated
Tracking Code generated
Initial Status Event generated
        ↓
Request.status = ACCEPTED
```

This operation should be atomic enough that a persistence failure cannot leave a logically accepted Request without its intended Repair or create duplicate Repairs on retry.

## Decline workflow

```text
SUBMITTED Request
        ↓
Provider declines
        ↓
Request.status = DECLINED
        ↓
No Repair is created
```

## Routes and UI

### Public

```text
/p/[providerSlug]/request
```

Suggested sections:

1. Provider identity and supported Service Modes;
2. Customer Details;
3. Device Details;
4. Reported Problem;
5. Preferred Service Mode;
6. Review and Submit.

### Provider

```text
/dashboard/requests
/dashboard/requests/[requestId]
```

Request detail must visually distinguish **customer-reported information** from Provider-authored technical information.

The inbox accepts `status` and `page` query parameters, for example
`/dashboard/requests?status=SUBMITTED&page=2`. Changing the status resets to
page 1. Previous/Next navigation preserves the selected status and omits the
page parameter for page 1.

## Relationships with other features

### Providers

Required for public Provider lookup, `accepting_requests`, and supported Service Modes.

### Auth

Required for all Provider-side Request reads/actions.

### Repairs

Acceptance invokes the Repairs capability to create the authoritative Repair. This dependency should remain one-way:

```text
Repair Requests → Repairs
```

Once created, the Repair does not need the Repair Requests Module for normal lifecycle behavior.

### Tracking

A Request Reference is not a Tracking Code. Public Repair tracking begins only after a Repair exists.

### Analytics

May record submitted/accepted/declined events and Request-origin conversion metrics.

## Important invariants

1. Request belongs to exactly one Provider.
2. Only that Provider's authorized users may review/act on it.
3. Request starts `SUBMITTED`.
4. Only `SUBMITTED` may transition to `ACCEPTED` or `DECLINED`.
5. One Request creates at most one Repair.
6. Declining creates no Repair.
7. Customer Reported Problem is not Diagnosis.
8. Provider may correct customer-supplied values before authoritative Repair creation.
9. Request Reference is distinct from Ticket Number and Tracking Code.

## Security and abuse controls

Public submission should include:

- server-side Zod validation;
- request-size limits as appropriate;
- rate limiting when available/needed;
- no privileged credentials in browser code;
- CAPTCHA only if actual abuse justifies it.

Provider-side operations require ownership checks and RLS.

## Important edge cases

### Duplicate acceptance

Two acceptance attempts occur nearly simultaneously.

Expected:

- at most one Repair exists;
- database uniqueness on `repair_request_id` reinforces this;
- second attempt returns a safe conflict/already-processed result.

### Provider stops accepting Requests

Existing `SUBMITTED` Requests remain reviewable. New public submissions should be rejected/disabled according to current Provider configuration.

### Preferred Service Mode changes

The customer's preferred mode is not immutable authority. Provider may verify/change the selected arrangement when creating the Repair.

### Inbox growth

The Provider inbox uses fixed 25-row pages rather than a hard maximum. Each
page fetches one look-ahead row and orders by `submitted_at DESC, id DESC`, so
older Requests remain reachable and equal submission timestamps do not make
page boundaries unstable.

## Testing expectations

Test:

- valid public submission;
- invalid Provider slug;
- Provider not accepting Requests;
- unsupported Service Mode;
- Provider A cannot read/action Provider B Request;
- Provider B cannot accept Provider A Request or create side effects;
- 60 matching Requests paginate as 25, 25, and 10 without tenant leakage;
- accept creates one Repair with correct origin/status;
- second accept cannot create another Repair;
- decline creates no Repair;
- accept-versus-decline concurrency commits exactly one terminal outcome;
- accept-after-decline and decline-after-accept are rejected without changing
  durable state;
- customer data can be corrected during acceptance.

## Implemented baseline

Feature 03 is implemented through:

- `src/features/repair-requests/` for validation, public submission,
  Provider-scoped queries, acceptance, decline, and persistence mapping;
- `src/features/repairs/` for the narrow Request-origin Repair creation seam;
- `/p/[providerSlug]/request` for accountless submission and receipt display;
- `/dashboard/requests` and `/dashboard/requests/[requestId]` for the private
  paginated Provider inbox, detail, verification, acceptance, and decline
  surfaces;
- `20260823120000_create_repair_requests.sql` for the schema, RLS, restricted
  RPCs, row locking, uniqueness, and atomic Request-to-Repair transaction.

Anonymous callers cannot insert or read `repair_requests` directly. They can
only call `submit_repair_request`, which verifies current Provider availability
and configured Service Modes while holding a Provider row lock. Provider reads
are RLS-scoped to membership. Acceptance and decline lock the Request so
concurrent terminal decisions serialize safely.

Inbox persistence fetches 26 rows for each 25-row page to derive `hasNext`
without an exact-count query. Status filtering composes with pagination, and
Provider context plus RLS continue to scope every page to one Provider.

This change materializes the Repair columns and initial Status Event required
for Request acceptance. It does not implement Feature 04's direct Repair
creation, Repair list/detail, lifecycle transitions, Customer Updates, or
public Tracking UI.

Server Action payloads retain the framework's default size protection and Zod
bounds. Dedicated rate limiting/CAPTCHA remains an operational hardening step
to add only when a production exposure plan or observed abuse justifies it.

## Definition of done

The feature is healthy when Customers can submit low-friction Provider-specific intake information, every Request remains reachable through the Provider inbox, and Providers can safely turn only accepted, verified Requests into authoritative Repairs without duplicate or cross-tenant behavior.
