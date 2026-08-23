# 26 — Initial Database Schema Draft

This is an implementation-oriented schema reference reflecting Lead Decisions LD-01, LD-02, and LD-03.

## Enum concepts

```text
provider_type: SHOP | INDEPENDENT
membership_role: OWNER | STAFF
service_mode: DROP_OFF | MEETUP | HOME_SERVICE | OTHER
repair_request_status: SUBMITTED | ACCEPTED | DECLINED
repair_origin: CUSTOMER_REQUEST | PROVIDER_CREATED
repair_status: IN_PROGRESS | WAITING_FOR_PARTS | AWAITING_APPROVAL | READY | COMPLETED
```

## Table inventory

```text
Supabase managed:
  auth.users

Tracknologia core:
  providers
  provider_user_profiles
  provider_memberships
  provider_invitations
  public_provider_profiles (view)
  provider_service_modes
  repair_requests
  repairs
  repair_status_events
  repair_updates

Optional validation telemetry:
  tracking_events
```

## Relationship sketch

```text
auth.users
    │
    ├──< provider_memberships >── providers
    │                             │
    ├──< provider_invitations <───┤ (Staff invitations)
    │                             │
    │                             ├──< provider_service_modes
    │                             ├──< repair_requests
    │                             │       │
    │                             │       └── 0..1 accepted source
    │                             │                │
    │                             └──< repairs <───┘
    │                                     │
    │                                     ├──< repair_status_events
    │                                     └──< repair_updates
```

## Key database invariants

### Provider membership & Staff invitations (LD-01)

- `UNIQUE(provider_id, user_id)` on `provider_memberships`.
- `UNIQUE(token_hash)` on `provider_invitations`.
- Direct client `INSERT` on `provider_memberships` is forbidden to prevent unauthorized self-assignment.
- Independent Repairer & Shop Owner onboarding use atomic
  `create_provider_with_owner_and_modes` composition, which provisions Provider,
  person profile, OWNER membership, operating fields, and Service Modes in one transaction.
- Shop Staff onboarding uses atomic `accept_staff_invitation` procedure.

### Provider Service Modes

- `PRIMARY KEY(provider_id, mode)` prevents duplicate modes.
- `details` is limited to 240 characters.
- authenticated members can read modes for their Provider;
- direct authenticated writes are denied;
- Owners replace modes atomically through `set_provider_service_modes`;
- a Provider-row lock serializes concurrent replacements for the same Provider.

### Provider profile update surface

Authenticated `UPDATE` grants on `providers` are limited to the explicit
operating/profile columns. Provider type, slug, IDs, ownership, and timestamps
are not client-editable. `providers.updated_at` and
`provider_user_profiles.updated_at` are database-maintained by triggers.
Database checks enforce Provider/person-profile text lengths and supported-device
cardinality/element bounds so direct REST updates cannot bypass durable limits.
Email/URL syntax and device de-duplication remain Module validation rules.

### Repair Request

- belongs to one Provider;
- status begins `SUBMITTED`;
- Request Reference is unique and matches `REQ-[A-F0-9]{16}`;
- terminal status, actor, and timestamp columns remain consistent by check
  constraint;
- Service Mode details require a selected preferred Service Mode;
- customer/device/problem fields have durable bounds matching Module schemas;
- `(provider_id, status, submitted_at DESC)` supports the Provider inbox.

### Request to Repair

`repairs.repair_request_id` is nullable + unique.

This prevents a single Request from creating two accepted Repairs.

The implemented composite foreign key `(provider_id, repair_request_id)` also
references `(repair_requests.provider_id, repair_requests.id)`, preventing a
cross-Provider source relationship even for privileged direct writes.

### Repair identity

- Tracking Code globally unique;
- Ticket Number unique within Provider scope;
- `current_status` begins `IN_PROGRESS`.

Implemented Feature 03 formats are:

```text
ticket_number  TN-YYYY-[A-F0-9]{10}
tracking_code  TRK-[A-F0-9]{24}
```

### History

Every status change appends one `repair_status_events` row in the same transaction as the Repair status update.

Request acceptance writes the initial `NULL -> IN_PROGRESS` event in the same
transaction as Repair creation and Request acceptance. Direct Provider creation
also writes its Repair and initial event atomically. Feature 04 lifecycle
transitions lock the Repair row and commit status, `completed_at`, and one
matching event together.

Customer Updates are separate repeatable rows and do not require status changes.
`repair_updates` is materialized with a nonblank 2,000-character message bound,
authenticated author default, cascading Repair foreign key, and stable history
index. Provider members may append/read their Provider's updates but cannot
edit/delete them; anonymous roles have no raw access.

## Why arrays/text columns are acceptable here

For MVP, `providers.supported_devices` may be a text array because device-category support is profile metadata without an independent lifecycle.

Likewise, `public_address` and `service_area` remain columns because the current MVP does not manage multiple branches or geospatial routing.

## No separate technician table

Provider Users are represented through membership. Technician assignment is not an MVP workflow.

One person may be:

```text
Provider type: SHOP
Membership: OWNER
Operational reality: owner is also the technician
```

No duplicate "technician profile" is required.

## No Customer/Device registry yet

Customer and device details are captured on Repair/Request because Tracknologia currently manages repair transactions rather than persistent customer/device accounts.

## RLS direction

Provider-owned tables check current `auth.uid()` membership.

Child rows (`repair_status_events`, `repair_updates`) derive authorization through `repairs.provider_id`.

Public Repair Request insertion and public Tracking lookup use intentionally limited policies and restricted server interfaces.

Feature 03 implements public submission through `submit_repair_request` only;
anonymous roles have no direct Request/Repair/history table privileges.
Authenticated members receive Provider-scoped reads. Repair detail mutation is
limited to explicitly granted snapshot columns under an UPDATE policy; direct
Repair creation, lifecycle columns, Status Events, identifiers, ownership, and
audit fields remain protected. `create_provider_repair` and
`change_repair_status` provide the two narrow Feature 04 transactions required
for atomic creation/history and locked lifecycle/history consistency.
