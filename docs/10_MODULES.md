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
createRepair(context, input): RepairResult
getRepair(context, repairId): RepairDetail
listRepairs(context, filter?): RepairSummary[]
updateRepairDetails(context, repairId, input): RepairDetail
changeRepairStatus(context, repairId, input): RepairDetail
addCustomerUpdate(context, repairId, message): CustomerUpdate
completeRepair(context, repairId): RepairDetail
```

Feature 03 implements the narrow `createRepairFromRequest` seam needed by
Request acceptance. Direct creation, Repair queries, detail updates, lifecycle
transitions, and Customer Updates remain owned by Feature 04 rather than being
partially implemented inside Repair Requests.

### Hides

- Ticket Number generation;
- Tracking Code generation;
- initial `IN_PROGRESS` status;
- transition validation;
- Status Event append;
- Provider ownership checks;
- Request origin linkage;
- completion timestamps;
- persistence transaction details.

## 5. Tracking Module

**Location:** `src/features/tracking/`

### Responsibility

Resolve a public Tracking Code into a restricted customer-safe view.

```ts
lookupRepairByTrackingCode(code): PublicRepairView
```

`PublicRepairView` must never be a raw `repairs` row.

It excludes Provider-private information, Internal Notes, contact information not intended for display, and internal identifiers.

## 6. Analytics / Pilot Metrics Module

**Location:** `src/features/analytics/`

This is intentionally small and can initially delegate to an external analytics event stream or an optional `tracking_events` table.

Measures only what is needed to validate the MVP hypothesis.

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
