# Database Design & Migration Rules

Tracknologia uses PostgreSQL managed through Supabase.

The MVP intentionally favors a small schema with sufficiently rich rows rather than premature normalization.

---

## Core Application Tables & Projections

```text
providers
provider_user_profiles
provider_memberships
provider_invitations
public_provider_profiles (view)
provider_service_modes
repair_requests
repairs
repair_status_events
repair_updates (Feature 04; not materialized yet)
```

Authentication identities live in Supabase-managed `auth.users`.

A `tracking_events` table may be added for pilot analytics when required.

---

## Relationships

```text
auth.users
    │
    ├──< provider_user_profiles (1:1 canonical person profile)
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

---

## Table Definitions

### 1. `providers`

Represents both Repair Shops and Independent Repairers. Direct table access is restricted to authenticated members; anonymous access uses `public_provider_profiles`.

- `id` (uuid, PK)
- `provider_type` (`SHOP` | `INDEPENDENT`)
- `display_name` (text, 2–120 characters)
- `slug` (text, UNIQUE)
- `description` (maximum 1,000 characters), `profile_image_url` (maximum 2,048)
- `contact_phone` (maximum 40), `contact_email` (maximum 254)
- `public_address` (nullable, maximum 300 for Independent Repairers)
- `service_area` (nullable, maximum 300)
- `supported_devices` (text array, maximum 20 nonblank values of maximum 80 characters each)
- `accepting_requests` (boolean, default true)
- `created_at`, `updated_at` (timestamptz)

### 2. `provider_user_profiles`

Canonical person profile for authenticated provider users (OWNER and STAFF).

- `user_id` (uuid, PK, FK $\to$ `auth.users.id`)
- `display_name` (text, required, 2–120 characters)
- `contact_phone` (text, nullable, maximum 40)
- `avatar_url` (text, nullable, maximum 2,048)
- `created_at`, `updated_at` (timestamptz)

### 3. `provider_memberships`

Connects `auth.users` to Providers (pure authorization relationship link only).

- `id` (uuid, PK)
- `provider_id` (uuid, FK $\to$ `providers.id`)
- `user_id` (uuid, FK $\to$ `auth.users.id`)
- `role` (`OWNER` | `STAFF`, explicit required)
- `created_at` (timestamptz)
- `CONSTRAINT unique_provider_user UNIQUE(provider_id, user_id)`

### 4. `provider_invitations`

Governs secure, Owner-authorized Staff onboarding (LD-01).

- `id` (uuid, PK)
- `provider_id` (uuid, FK $\to$ `providers.id`)
- `email` (text)
- `role` (`STAFF`)
- `token_hash` (text, UNIQUE) — stores one-way SHA-256 cryptographic digest of raw token.
- `invited_by_user_id` (uuid, FK $\to$ `auth.users.id`)
- `created_at`, `expires_at` (7 days default), `accepted_at`, `accepted_by_user_id`, `revoked_at`

### 5. `public_provider_profiles` (View)

Public projection exposing only public-safe fields for active providers accepting requests.

- `id`, `provider_type`, `display_name`, `slug`, `description`, `profile_image_url`, `public_address`, `service_area`, `supported_devices`, `service_modes`, `accepting_requests`, `created_at`
- excludes Providers where `accepting_requests = false`
- excludes internal contact fields and `updated_at`

### 6. `provider_service_modes`

Repeating relation of supported modes (`DROP_OFF`, `MEETUP`, `HOME_SERVICE`, `OTHER`).

- `PRIMARY KEY(provider_id, mode)`
- optional `details` with a 240-character check
- authenticated members have read access for their Provider
- direct authenticated writes are denied; Owners use atomic, Provider-serialized `set_provider_service_modes(jsonb)` replacement

### 7. `repair_requests`

Customer-submitted intake awaiting Provider decision (`SUBMITTED`, `ACCEPTED`, `DECLINED`). Not an authoritative Repair.

- Provider ownership, globally unique `REQ-[A-F0-9]{16}` Request Reference,
  customer/device/problem snapshot, optional preferred Service Mode, and
  decision audit columns.
- status defaults `SUBMITTED`; check constraint keeps status, decision time, and
  acting User consistent.
- customer/device/problem text bounds mirror server-side Zod limits.
- `(provider_id, status, submitted_at DESC)` supports inbox filtering.
- authenticated Provider members can read only their Provider rows; direct
  client mutation is denied.
- anonymous submission is available only through `submit_repair_request`, which
  returns Reference + submission time and creates no Repair.

### 8. `repairs`

The authoritative repair record containing customer and device snapshots.

- `repair_request_id` is nullable and unique so one Repair Request can create at most one Repair.
- composite source foreign key requires Request and Repair to share Provider.
- `origin` is `CUSTOMER_REQUEST` for Feature 03 acceptance;
  `PROVIDER_CREATED` remains available for Feature 04 direct creation.
- Ticket Number matches `TN-YYYY-[A-F0-9]{10}` and is unique per Provider.
- Tracking Code matches `TRK-[A-F0-9]{24}` and is globally unique.
- customer/device fields are authoritative snapshots; Reported Problem,
  Diagnosis, and Internal Notes remain distinct columns.
- Lifecycle: `IN_PROGRESS`, `WAITING_FOR_PARTS`, `AWAITING_APPROVAL`, `READY`, `COMPLETED`.
- Feature 03 creates only initial `IN_PROGRESS` Repairs. Later state behavior is
  implemented by Feature 04.

### 9. `repair_status_events`

- append-oriented audit log with `from_status`, `to_status`, acting User, and
  timestamp;
- initial event is `NULL -> IN_PROGRESS` and is committed atomically with
  Request-origin Repair creation;
- authenticated reads derive Provider ownership through parent Repair;
- direct client writes are denied.

### Planned Feature 04: `repair_updates`

Customer-visible progress messages independent of status changes. This table is
part of the accepted conceptual model but is not created by the Feature 03
migration.

---

## Supabase Migration Rules & Lifecycle

These rules govern all database changes and are derived from `docs/Tracknologia_Supabase_Migration_Rules.md`.

### 1. Core Migration Rule

> **A committed migration represents an intentional database transition, not a debugging diary.**

- **Experimental Phase**: During active feature development with disposable development databases, migrations may be corrected, squashed, or replaced.
- **Accepted Phase**: Once reviewed and approved by the Technical Lead as part of an accepted shared baseline, migrations become **immutable**. All subsequent modifications must be authored as new forward migrations.

### 2. Location & Naming

All migration files reside in `supabase/migrations/` using timestamped descriptive filenames:

```text
supabase/migrations/YYYYMMDDHHMMSS_action_target.sql
```

_Good_: `20260820000001_create_provider_identity.sql`
_Avoid_: `fix.sql`, `temp_workaround.sql`, `fix_rls_again.sql`

### 3. Fresh-Database Reproducibility

Every migration chain must apply cleanly from an empty database to full schema, RLS, and functions without manual interventions or dashboard-only patches:

```bash
npx supabase db push
```

### 4. Row Level Security & Least Privilege

- **Mandatory RLS**: Enabled on all provider-owned tables (`providers`, `provider_user_profiles`, `provider_memberships`, `provider_invitations`, `repairs`, etc.).
- **Prohibited Client Self-Assignment**: Direct client `INSERT` on `provider_memberships` is strictly forbidden.
- **Atomic SECURITY DEFINER Procedures**:
  - `create_provider_with_owner(...)`: Transactionally provisions new Provider, initial business profile, person profile, and links caller as explicit `OWNER`.
  - `create_provider_with_owner_and_modes(...)`: Composes the accepted creation procedure with description/request configuration and Service Mode replacement in the same transaction.
  - `set_provider_service_modes(service_modes)`: Owner-only atomic replacement of repeating Service Mode configuration, serialized with a Provider-row lock.
  - `accept_staff_invitation(token_hash, display_name, contact_phone)`: Transactionally locks invitation, verifies SHOP provider and single active membership invariant, creates person profile and `STAFF` membership, and marks token accepted.
  - `submit_repair_request(...)`: Public allow-listed submission that locks the
    Provider configuration and verifies current Request availability/mode.
  - `decline_repair_request(request_id)`: Provider-authorized terminal decline
    with Request row locking.
  - `create_repair_from_request(request_id, verified_input...)`: Provider-
    authorized Request lock plus atomic Repair, initial Status Event, and
    accepted Request state.
- All `SECURITY DEFINER` functions must explicitly set:
  ```sql
  SET search_path = public, pg_temp;
  ```
- Authenticated Provider profile updates use column-level grants. Provider type,
  slug, IDs, ownership, and timestamps are not client-editable.
- Provider/person-profile checks enforce durable text lengths and supported-device
  cardinality/element bounds; email/URL syntax and device de-duplication remain
  application validation responsibilities.
- Database triggers maintain `updated_at` for `providers` and
  `provider_user_profiles`; Feature 03 also applies it to `repairs`.

### 5. Supabase CLI & State Hygiene

- `supabase/.temp/` is environment-specific CLI state and must **never** be committed (`.gitignore` enforced).
- No uncaptured manual changes made via the Supabase Dashboard.

---

## Deliberately Deferred Tables

Do not add without a validated requirement:

- `customers`, `devices`, `technicians`, `branches`, `inventory`, `parts`, `payments`, `invoices`, `appointments`, `ratings/reviews`.

Customer and device details remain point-in-time snapshots attached to a Repair or Repair Request.
