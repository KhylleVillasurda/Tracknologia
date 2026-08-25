# Feature — Repairs

**Code location:** `src/features/repairs/`

## Description

The Repairs feature is the **authoritative operational core of Tracknologia**. It represents accepted repair work from intake through completion.

A Repair may originate from:

- an accepted Repair Request; or
- direct Provider creation.

After creation, both origins use exactly the same lifecycle.

## Primary goal

Give Providers one reliable, low-friction source of truth for active and completed repair work while giving Customers enough structured information for meaningful public tracking.

## Feature goals

- Allow direct Repair creation without requiring a Repair Request.
- Accept verified Request-originated intake from the Repair Requests feature.
- Store customer/device information as Repair-owned snapshots for the MVP.
- Keep `Reported Problem` separate from `Diagnosis`.
- Generate a human-readable Ticket Number and unpredictable Tracking Code.
- Start every new Repair automatically as `IN_PROGRESS`.
- Use only meaningful lifecycle states rather than forcing technicians through artificial activity stages.
- Maintain durable status history through Status Events.
- Keep customer-visible Customer Updates separate from lifecycle Status Events.
- Keep Internal Notes private.
- Support completion and historical Repair lookup.
- Preserve Provider isolation and authorization on every protected operation.

## Non-goals

The MVP Repairs feature does not include:

- inventory/parts catalog management;
- supplier management;
- invoicing/payments/POS;
- appointments;
- technician assignment/workload scheduling;
- reusable Customer records;
- reusable Device registry;
- AI diagnosis;
- customizable status workflows;
- branches.

## Main actors

- **Provider User** — creates and maintains Repairs.
- **Customer** — indirectly consumes the customer-safe projection through Tracking.

## Owned data

### `repairs`

Authoritative repair snapshot including:

- Provider ownership;
- optional source Repair Request;
- origin;
- ticket/tracking identifiers;
- customer snapshot;
- device snapshot;
- Reported Problem;
- intake observation;
- Diagnosis;
- Internal Notes;
- Service Mode;
- current status;
- creator/timestamps/completion.

### `repair_status_events`

Append-oriented lifecycle history.

### `repair_updates`

Customer-visible progress messages that do not require status changes.

## Why customer/device data stays on Repair

The MVP needs the facts captured for **this repair engagement**, not a full CRM or device registry.

Therefore:

```text
Customer snapshot → columns on Repair
Device snapshot   → columns on Repair
```

Do not add `customers` or `devices` tables until repeat-customer/device history is a validated product requirement.

## Repair origins

```text
CUSTOMER_REQUEST
PROVIDER_CREATED
```

Origin is useful for validation/analytics and traceability. It must not produce separate lifecycle implementations.

## State model

```text
creation → IN_PROGRESS
IN_PROGRESS → WAITING_FOR_PARTS
IN_PROGRESS → AWAITING_APPROVAL
WAITING_FOR_PARTS → IN_PROGRESS
AWAITING_APPROVAL → IN_PROGRESS
IN_PROGRESS → READY
READY → COMPLETED
```

### `IN_PROGRESS`

General active work. It intentionally covers diagnosing, repairing, testing, and similar technical activity.

### `WAITING_FOR_PARTS`

Optional blocked state when required parts/materials prevent continuation.

### `AWAITING_APPROVAL`

Optional blocked state when Customer approval is required to continue.

### `READY`

Repair work is finished and the device is ready for return/handover according to its Service Mode.

### `COMPLETED`

Repair engagement and return/handover are finished.

## Conceptual Interface

```ts
createRepair(input): RepairResult
getRepair(repairId): RepairDetail | null
listRepairs(options?): RepairPage
getRepairCounts(): RepairCounts
updateRepairDetails(repairId, input): RepairDetail
changeRepairStatus(repairId, nextStatus): RepairDetail
addCustomerUpdate(repairId, message): CustomerUpdate
completeRepair(repairId): RepairDetail
```

The Interface should hide ticket/tracking generation, ownership checks, transition validation, Status Event creation, and persistence coordination.
Provider-facing operations derive trusted Provider context internally. The
Request-origin creation seam remains available only for the Repair Requests
Module, which already supplies trusted context.

## Direct creation workflow

```text
Provider User
  ↓ Auth / ProviderContext
/dashboard/repairs/new
  ↓
Enter customer snapshot
  ↓
Enter device snapshot
  ↓
Enter Reported Problem
  ↓
Optional intake observation / condition / accessories
  ↓
Validate
  ↓
Create Repair
  ↓
origin = PROVIDER_CREATED
status = IN_PROGRESS
Ticket Number + Tracking Code generated
Initial Status Event recorded
```

## Request-origin creation workflow

The Repair Requests feature provides verified intake data.

```text
Verified accepted-request input
       ↓
Repairs creates authoritative Repair
       ↓
origin = CUSTOMER_REQUEST
repair_request_id = source request
status = IN_PROGRESS
```

The database should enforce at most one Repair per source Request.

## Active Repair workflow

```text
Open Repair detail
    ↓
Review device/problem/intake
    ↓
Maintain Diagnosis / Internal Notes
    ↓
Preserve or intentionally change the recorded Service Mode
    ↓
Add Customer Update when useful
    ↓
Change status only when operational state meaningfully changes
```

A Customer Update does not need to change Repair Status.

## Completion workflow

```text
IN_PROGRESS
   ↓ work finished
READY
   ↓ device returned/handover finished
COMPLETED
```

`completed_at` should remain consistent with `COMPLETED` state.

## Routes and UI

```text
/dashboard/repairs
/dashboard/repairs/new
/dashboard/repairs/[repairId]
```

Dashboard may surface Repair summaries but should not duplicate Repairs business rules.

### Repair list design

Prefer device-first recognition, for example:

```text
Lenovo IdeaPad 3
TN-2026-00125
Juan Dela Cruz
Battery issue
IN_PROGRESS
Updated 10:32
```

### Repair detail UI

Suggested sections:

- status and primary actions;
- Customer information;
- Device Snapshot;
- Reported Problem;
- intake observation/condition/accessories;
- Diagnosis;
- Internal Notes;
- Customer Updates;
- lifecycle history;
- ticket/tracking information.

Provider-private and customer-visible information must be visually distinguishable.

## Relationships with other features

### Auth

All protected reads/mutations require `ProviderContext` and ownership checks.

### Providers

Every Repair belongs to one Provider. Current Provider Service Modes constrain
new Service Mode selections and may influence READY wording. Once recorded, a
Repair's Service Mode is a historical snapshot and may remain even if the
Provider later stops offering that mode.

### Repair Requests

Repair Requests may create a Repair. Repairs does not require a Request for direct creation.

### Tracking

Tracking consumes a restricted public projection of Repair, Provider identity, and Customer Updates.

### Analytics

Repair creation/origin and completion metrics are derived from `repairs`;
status-maintenance and READY-history metrics are derived from
`repair_status_events`. Feature 06 does not duplicate this authoritative state
into a generic analytics event stream.

## Important invariants

1. Repair belongs to exactly one Provider.
2. Provider identity is derived from trusted context for protected creation/action.
3. New Repair starts `IN_PROGRESS` automatically.
4. Source Request is optional.
5. `repair_request_id` is unique when present.
6. Ticket Number is unique within chosen Provider scope.
7. Tracking Code is globally unique/unpredictable enough for public credential use.
8. Reported Problem and Diagnosis remain separate.
9. Internal Notes never appear in public Tracking.
10. Every lifecycle transition creates a matching Status Event.
11. `current_status` and the Status Event must not contradict each other after a successful mutation.
12. Customer Updates do not imply status changes.
13. `WAITING_FOR_PARTS` and `AWAITING_APPROVAL` are optional branches, not mandatory stages.
14. An unrelated detail edit preserves the Repair's recorded Service Mode.
15. An intentional non-null Service Mode change must still be configured when
    the write commits; clearing the mode remains allowed.

## Persistence/transaction expectations

Operations that change lifecycle state should coordinate:

```text
repair.current_status
+
repair_status_event
+
completed_at when applicable
```

as one logical operation. Do not report a transition as successful if durable state is inconsistent.

Request acceptance should also avoid partial success between the source Request and created Repair.

Intentional Repair Service Mode changes serialize against Provider Service
Mode replacement through the shared Provider-row lock. This is a write-time
integrity guarantee, not a permanent foreign key: later configuration changes
must not invalidate historical Repair snapshots.

## Security expectations

- Provider A cannot read/write Provider B Repairs.
- Route ids do not authorize access.
- Server-side validation is required.
- RLS provides defense in depth.
- Customer/public projections exclude private fields.

## Important edge cases

### Direct creation

Valid even if no Repair Request ever existed.

### Waiting state

A Repair may return from a waiting state to `IN_PROGRESS`; waiting is not completion.
The dashboard's aggregate Waiting count links to a Repair list filter containing
both `WAITING_FOR_PARTS` and `AWAITING_APPROVAL`.

### Historical Service Mode

If a Provider removes a mode after a Repair recorded it, the edit form keeps
that recorded mode visible and selected with a "no longer offered" label.
Leaving it unchanged preserves the snapshot. Selecting no mode intentionally
clears it; selecting another non-null mode requires current Provider support.

### Attempted invalid transition

Example:

```text
WAITING_FOR_PARTS → COMPLETED
```

This is not in the current MVP transition model and should fail unless requirements are explicitly changed.

### Reopening completed work

Not supported by the current MVP baseline. Treat as a future decision rather than silently adding behavior.

## Testing expectations

Test:

- direct creation;
- Request-origin creation;
- initial status/event;
- ticket/tracking uniqueness behavior;
- allowed and rejected transitions;
- status/event consistency;
- completed timestamp behavior;
- Customer Update without status change;
- Internal Notes not present in public projection;
- Provider isolation;
- list/search/filter behavior;
- historical Service Mode preservation and explicit clearing;
- direct unsupported Service Mode update denial;
- Service Mode edit/replacement serialization;
- one Request cannot create two Repairs.

## Implemented baseline

Feature 04 is implemented through:

- `src/features/repairs/` for validation, direct and Request-origin creation,
  Provider-scoped list/detail/count queries, allow-listed detail editing,
  lifecycle transitions, completion, and Customer Updates;
- `/dashboard/repairs`, `/dashboard/repairs/new`, and
  `/dashboard/repairs/[repairId]` for responsive Provider operations;
- `20260824023000_complete_repairs.sql` for append-only `repair_updates`,
  restricted detail-edit privileges, atomic direct creation, and serialized
  lifecycle transitions;
- `20260824024000_harden_repair_service_mode_updates.sql` for write-time
  validation and Provider-serialized Repair Service Mode changes;
- real PostgreSQL integration coverage for direct creation, initial history,
  immutable fields, cross-Provider isolation, Customer Update separation,
  legal/illegal transitions, completion, historical Service Modes, direct mode
  bypass denial, and concurrent transition/configuration races.

Repair pages use 25-row look-ahead pagination ordered by
`updated_at DESC, id DESC`. Search is bounded, accepts ordinary human
punctuation, and quotes/escapes values before composing raw PostgREST OR
filters. The `WAITING` list filter aggregates both waiting states. Direct
creation and status transitions use narrow database transactions because they
require multiple durable writes. Detail edits use ordinary persistence with
column grants and RLS, plus a narrow trigger that validates and serializes only
actual Repair Service Mode changes. Customer Update insertion remains an
ordinary constrained append.

Public Tracking remains Feature 05. Feature 04 exposes Tracking Codes only to
the owning Provider and grants no anonymous access to raw Repair or Customer
Update rows.

## Definition of done

The feature is healthy when Providers can manage the complete accepted-repair lifecycle with minimal operational friction, consistent durable state, strong Provider isolation, and enough safe data for Customers to understand repair progress.
