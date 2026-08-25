# 10 — Application Modules

Tracknologia uses **deep modules**: small caller-facing interfaces that hide business rules, authorization, validation, and persistence coordination.

The repository directory is named `src/features/`, but each feature is still treated architecturally as a Module.

## 1. Auth / Provider Access Module

**Location:** `src/features/auth/`

### Responsibility

Resolve authenticated Provider context and enforce Provider membership/role assumptions.

### Conceptual interface

```ts
requireUser(): AuthenticatedUser
requireProviderContext(): ProviderContext
requireProviderRole(roles): ProviderContext
```

### Hides

- Supabase session/user lookup;
- membership lookup;
- Provider context resolution;
- authorization failure behavior.

## 2. Providers Module

**Location:** `src/features/providers/`

### Responsibility

Own Provider profile and operating configuration.

### Conceptual interface

```ts
createProvider(input): { providerId, membershipId, slug }
getProvider(providerId): Provider
getPublicProvider(slugOrId): PublicProviderProfile
getProviderServiceModes(providerId): ProviderServiceMode[]
updateProviderProfile(input): Provider
updateCurrentProviderUserProfile(input): ProviderUserProfile
setServiceModes(modes): ProviderServiceMode[]
createStaffInvitation(input): CreateStaffInvitationResult
acceptStaffInvitation(input): AcceptedStaffMembership
```

### Owns

- `SHOP` versus `INDEPENDENT`;
- Service Area;
- optional public address;
- supported device categories;
- request-acceptance flag;
- supported Service Modes;
- canonical person profiles;
- Owner-authorized Shop Staff invitation lifecycle.

The Module derives Provider and user identity from authenticated context for
mutations. Its persistence layer hides direct table queries and the narrow
atomic RPCs used for Provider creation, Service Mode replacement, and Staff
invitation acceptance.

## 3. Repair Requests Module

**Location:** `src/features/repair-requests/`

### Responsibility

Manage customer-submitted pre-acceptance Requests for exactly one Provider.

### Conceptual interface

```ts
submitRepairRequest(providerSlug, input): RepairRequestReceipt
listRepairRequests(options?): RepairRequestPage
getRepairRequest(requestId): RepairRequestDetail | null
acceptRepairRequest(requestId, verifiedInput): AcceptedRepairResult
declineRepairRequest(requestId): RepairRequestDetail
```

Provider-side Interfaces derive `ProviderContext` from the authenticated
Supabase session. Browser-supplied Provider/user identifiers are not part of
the mutation or query contracts. Persistence is server-only and hides direct
queries plus the submission/decision RPC mechanics.

The list Interface accepts an optional status and positive page number. It
returns at most 25 Provider-scoped summaries with `hasPrevious` and `hasNext`
flags. The Module hides offset/range calculation, deterministic
`submitted_at DESC, id DESC` ordering, and the one-row look-ahead query.

### Invariants

- Request belongs to exactly one Provider.
- Only that Provider may review/act on it.
- Request starts as `SUBMITTED`.
- Accepted Request creates at most one Repair.
- Declined Request creates no Repair.
- Provider may correct customer-supplied details during acceptance.

## 4. Repairs Module

**Location:** `src/features/repairs/`

### Responsibility

Own authoritative Repair behavior.

### Conceptual interface

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

Provider-facing Interfaces derive trusted Provider context internally. The
narrow `createRepairFromRequest` seam remains available to Repair Requests for
the accepted-request transaction, while both Repair origins converge on this
Module for later reads, edits, updates, and lifecycle behavior.

`listRepairs` returns at most 25 summaries plus page navigation flags and hides
quoted/escaped punctuation-safe search construction, the aggregate `WAITING`
filter, stable ordering, projections, and Provider scoping.
`getRepair` composes the authoritative snapshot with Status Events and Customer
Updates without exposing persistence mechanics to pages.

`updateRepairDetails` distinguishes omitted Service Mode input (preserve the
recorded snapshot) from an intentional clear. Changed non-null modes must be
currently configured, and PostgreSQL serializes the write-time recheck against
Provider Service Mode replacement.

### Hides

- Ticket Number generation;
- Tracking Code generation;
- initial `IN_PROGRESS` status;
- transition validation;
- Status Event append;
- Provider ownership checks;
- Request origin linkage;
- completion timestamps;
- historical Service Mode preservation and write-time serialization;
- persistence transaction details.

## 5. Tracking Module

**Location:** `src/features/tracking/`

### Responsibility

Resolve a public Tracking Code into a restricted customer-safe view.

```ts
lookupRepairByTrackingCode(code): PublicRepairView | null
```

The Module normalizes and validates the public credential, invokes one bounded
database projection, fails closed if that projection drifts, and composes
customer-facing device/status/Service Mode wording. Invalid and unknown codes
both return `null`.

`PublicRepairView` is never a raw `repairs` row. It contains Provider display
name, one safe device summary, current status presentation, selected Service
Mode, computed last activity time, READY handover guidance, and at most 25
message/timestamp-only Customer Updates. It excludes contact information,
customer identity, Internal Notes, Diagnosis, technical identifiers, ticket/
tracking credentials, database/auth ids, Update authors, and audit history.

## 6. Analytics / Pilot Metrics Module

**Location:** `src/features/analytics/`

### Responsibility

Measure only what is needed to validate the MVP hypothesis without duplicating
authoritative domain state or becoming an availability dependency.

```ts
recordSuccessfulTrackingView(trackingCode): Promise<boolean>
```

The Module hides the narrow Supabase RPC and converts persistence failure into
a sanitized `false` result. The `/track` Server Action schedules it with Next.js
`after()` only after Tracking returns a successful restricted projection, so
Tracking has no Analytics dependency and the customer response does not await
telemetry. `tracking_events` stores only Repair correlation and observation
time. Provider, Request, Repair, status, origin, and completion metrics are
derived directly from their owning tables.

## Suggested internal feature layout

Do not create every file until required.

```text
src/features/repairs/
├── index.ts          # public Module interface / selective barrel
├── commands.ts       # state-changing behavior
├── queries.ts        # reads
├── schemas.ts        # Zod input schemas
├── types.ts          # feature-owned types
├── persistence.ts    # server-only persistence implementation
└── repairs.test.ts
```

## Barrel-file rule

Use `index.ts` only at a meaningful Module seam.

Good:

```ts
import { createRepair, getRepair } from "@/features/repairs";
```

Avoid global barrels such as `src/features/index.ts`, `src/components/index.ts`, or `src/lib/index.ts` that re-export unrelated code.

## Dependency direction

```text
Next.js routes / Server Actions
             ↓
        feature Modules
             ↓
 server-only persistence adapters
             ↓
      Supabase/PostgreSQL
```

Feature Modules must not import Next.js page components. Pages should not bypass feature behavior to mutate Provider-owned tables directly.
