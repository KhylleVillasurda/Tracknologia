# 13 — Conceptual Data Model

## Design goal

The MVP schema should be **information-rich without becoming table-heavy**.

Rule:

> Keep single-valued or Repair-snapshot information as columns. Create separate tables only for genuinely repeating relationships/history or relationships that need their own constraints.

## Core tables & projections

1. `providers`
2. `provider_user_profiles`
3. `provider_memberships`
4. `provider_invitations`
5. `public_provider_profiles` (view)
6. `provider_service_modes`
7. `repair_requests`
8. `repairs`
9. `repair_status_events`
10. `repair_updates`

Supabase manages `auth.users` separately.

`tracking_events` is optional validation telemetry, not a required domain table.

## provider_user_profiles

```text
user_id               uuid PK, FK -> auth.users.id
display_name          text
contact_phone         text nullable
avatar_url            text nullable
created_at            timestamptz
updated_at            timestamptz
```

This table holds the canonical person profile for authenticated Provider Users (both `OWNER` and `STAFF`). Membership contains the authorization link only.
Database checks bound `display_name` to 2–120 characters, `contact_phone` to
40 characters, and `avatar_url` to 2,048 characters.

## providers

```text
id                    uuid PK
provider_type         SHOP | INDEPENDENT
display_name          text
slug                  text UNIQUE
description           text nullable
profile_image_url     text nullable
contact_phone         text nullable
contact_email         text nullable
public_address        text nullable
service_area          text nullable
supported_devices     text[] nullable
accepting_requests    boolean default true
created_at            timestamptz
updated_at            timestamptz
```

A `SHOP` may have only one Provider User, including an owner who is also the working technician. No separate technician table is required.

An `INDEPENDENT` Provider may leave `public_address` null and use `service_area` instead.

`provider_type` and `slug` are stable Provider identity fields. Owner settings
may change the operating/profile columns, but authenticated clients do not have
column privileges to rewrite identity, ownership, or timestamps. The database
maintains `updated_at` on Provider profile changes.

Database checks preserve the Module's durable size limits: Provider names are
2–120 characters, description is at most 1,000, image URLs are at most 2,048,
phone/email are at most 40/254, address and Service Area are at most 300, and
supported devices contain at most 20 nonblank values of at most 80 characters.
Email/URL syntax and device de-duplication remain application validation rules.

## provider_memberships

```text
id                    uuid PK
provider_id           uuid FK -> providers.id
user_id               uuid FK -> auth.users.id
role                  OWNER | STAFF
created_at            timestamptz

UNIQUE(provider_id, user_id)
```

This table links Supabase identity to Tracknologia Provider authority.

## provider_invitations

```text
id                    uuid PK
provider_id           uuid FK -> providers.id
email                 text
role                  membership_role (STAFF)
token_hash            text UNIQUE
invited_by_user_id    uuid FK -> auth.users.id
created_at            timestamptz
expires_at            timestamptz
accepted_at           timestamptz nullable
accepted_by_user_id   uuid FK -> auth.users.id nullable
revoked_at            timestamptz nullable
```

Governs Owner-authorized, secure, single-use Staff onboarding (LD-01).

## provider_service_modes

```text
provider_id           uuid FK -> providers.id
mode                  DROP_OFF | MEETUP | HOME_SERVICE | OTHER
details               text nullable

PRIMARY KEY(provider_id, mode)
CHECK(details IS NULL OR char_length(details) <= 240)
```

A Provider may support several modes; therefore this remains a separate
repeating relation. Authenticated members may read their Provider's modes, but
only Owners may atomically replace them through `set_provider_service_modes`.
The function locks the Provider row so concurrent whole-set replacements are
serialized and cannot leave a mixed union.

## repair_requests

```text
id                         uuid PK
provider_id                uuid FK -> providers.id
reference_code             text UNIQUE

customer_name              text
customer_phone             text
customer_email             text nullable

device_type                text
brand                      text nullable
model                      text nullable
serial_number              text nullable
color_variant              text nullable
device_specs               text nullable

reported_problem           text
problem_started_at         text nullable
preceding_event            text nullable
troubleshooting_attempted  text nullable
additional_information     text nullable

preferred_service_mode     service_mode nullable
service_mode_details       text nullable

status                     SUBMITTED | ACCEPTED | DECLINED
submitted_at               timestamptz
accepted_at                timestamptz nullable
declined_at                timestamptz nullable
accepted_by_user_id        uuid nullable
declined_by_user_id        uuid nullable
```

A Repair Request belongs to exactly one Provider and is not an authoritative Repair.

The implemented Feature 03 schema also enforces:

- `reference_code` format `REQ-` + 16 uppercase hexadecimal characters;
- bounded, nonblank customer name/phone, device type, and Reported Problem;
- maximum lengths aligned with the Repair Requests Zod schema;
- Service Mode details only when a preferred Service Mode exists;
- terminal lifecycle consistency between status, timestamp, and acting User;
- index `(provider_id, status, submitted_at DESC)` for the Provider inbox.

## repairs

```text
id                     uuid PK
provider_id            uuid FK -> providers.id
repair_request_id      uuid UNIQUE nullable
origin                 CUSTOMER_REQUEST | PROVIDER_CREATED

ticket_number          text
tracking_code          text UNIQUE

customer_name          text
customer_phone         text
customer_email         text nullable

device_type            text
brand                  text nullable
model                  text nullable
serial_number          text nullable
color_variant          text nullable
device_specs           text nullable
physical_condition     text nullable
accessories_received   text nullable

reported_problem       text
initial_observation    text nullable
diagnosis              text nullable
internal_notes         text nullable

service_mode           service_mode nullable
service_mode_details   text nullable

current_status         IN_PROGRESS | WAITING_FOR_PARTS | AWAITING_APPROVAL | READY | COMPLETED

created_by_user_id     uuid FK -> auth.users.id
created_at             timestamptz
updated_at             timestamptz
completed_at           timestamptz nullable
```

### Request relationship

`repair_request_id` is nullable and unique:

- direct Provider creation -> `NULL`, origin `PROVIDER_CREATED`;
- accepted Request -> source Request id, origin `CUSTOMER_REQUEST`.

This enforces "one Repair Request can produce at most one Repair" at the database level.

The composite Request foreign key also guarantees the source Request and
created Repair belong to the same Provider. Feature 04 creates
`PROVIDER_CREATED` Repairs directly while preserving the same downstream
lifecycle used by `CUSTOMER_REQUEST` Repairs.

Implemented identifiers use:

```text
Ticket Number   TN-YYYY-XXXXXXXXXX   unique per Provider
Tracking Code   TRK-XXXXXXXXXXXXXXXXXXXXXXXX   globally unique
```

The Tracking Code is random rather than sequential and remains distinct from
both Ticket Number and Request Reference.

## repair_status_events

```text
id                     uuid PK
repair_id              uuid FK -> repairs.id
from_status            repair_status nullable
to_status              repair_status
changed_by_user_id     uuid nullable
created_at             timestamptz
```

The initial event is `NULL -> IN_PROGRESS`.

Request acceptance inserts this initial event in the same database transaction
that creates the Request-origin Repair and marks the source Request `ACCEPTED`.
Direct Provider creation likewise commits the Repair and initial event
atomically. Later transitions lock the Repair and commit status,
`completed_at`, and one matching event together.

Status history remains separate because it is inherently repeating and required for lifecycle history/validation.

## repair_updates

```text
id                     uuid PK
repair_id              uuid FK -> repairs.id
message                text
created_by_user_id     uuid FK -> auth.users.id
created_at             timestamptz
```

Customer Updates are independent of status changes. A Provider can post several updates while a Repair remains `IN_PROGRESS`.

Feature 04 materializes this table with a nonblank 2,000-character message
bound, authenticated author default, cascading Repair relationship, Provider-
scoped RLS, and `(repair_id, created_at DESC, id DESC)` index. Provider members
may append and read updates for their own Repairs, but cannot edit or delete
them. Anonymous roles receive no raw table access.

## Public Tracking read model

`PublicRepairView` is an application read model backed by the
`lookup_public_repair(text)` database function, not another domain table and
not a raw SQL view over `repairs`.

Its durable projection is restricted to:

```text
Provider display name
device type + optional brand/model
current Repair Status
selected Service Mode
Repair/Customer-Update last activity time
latest 25 Customer Update message/timestamp pairs
```

The existing globally unique `repairs.tracking_code` index supplies the lookup
path. Provider request availability does not affect tracking of an existing
Repair. Customer identity/contact, technical/private fields, Ticket Number,
internal identifiers, credentials, Update authors, and Status Event history do
not enter the read model.

## Why no customers table yet

Customer identity is not currently an account or reusable profile. Contact information is stored as a snapshot on Request/Repair.

Normalize Customer only if repeat-customer history becomes a validated requirement.

## Why no devices table yet

Tracknologia needs the device state at intake, not a permanent asset registry. Device information remains a Repair-owned snapshot.

Normalize Device only if reusable device history becomes a validated requirement.

## Suggested indexes and constraints

- unique `providers.slug`
- unique `(provider_id, user_id)` membership
- unique `provider_invitations.token_hash`
- primary/unique `(provider_id, mode)` service mode
- Provider/person-profile size checks matching durable Module bounds
- unique `repair_requests.reference_code`
- index `repair_requests(provider_id, status, submitted_at)`
- unique `repairs.tracking_code`
- unique `repairs.repair_request_id` where non-null
- unique `(provider_id, ticket_number)`
- index `repairs(provider_id, current_status, updated_at)`
- index `repairs(provider_id, created_at)`
- index `repair_status_events(repair_id, created_at)`
- index `repair_updates(repair_id, created_at DESC, id DESC)`

## RLS ownership path

For Provider-owned rows:

```text
auth.uid()
  -> provider_memberships.user_id
  -> provider_memberships.provider_id
  -> repair/provider provider_id
```

Child history tables derive Provider ownership through their parent Repair.
