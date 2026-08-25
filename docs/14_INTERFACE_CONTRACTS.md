# 14 — Software Interface Contracts

These contracts describe feature-Module interfaces, invariants, and expected failure behavior. Next.js pages/actions adapt framework input to these interfaces.

## Auth — requireProviderContext

```text
requireProviderContext() -> ProviderContext
```

Returns the authenticated user's current Provider context, including at minimum `userId`, `providerId`, and membership role.

Failure: unauthenticated or no valid Provider membership.

## Providers — createProvider

```text
createProvider(input) -> { providerId, membershipId, slug }
```

Guarantees:

- caller is authenticated and has no existing Provider membership;
- Provider, canonical owner profile, `OWNER` membership, operating profile,
  and initial Service Modes commit atomically;
- Provider type is `SHOP` or `INDEPENDENT`;
- raw browser-supplied Provider/user ownership identifiers are not accepted;
- an invalid or duplicate Service Mode rolls back the entire onboarding write.

## Providers — updateProviderProfile

```text
updateProviderProfile(input) -> Provider
```

Guarantees:

- caller is the authenticated `OWNER` of the Provider derived from membership;
- only operating/profile columns are editable;
- Provider `id`, `provider_type`, `slug`, ownership, and timestamps cannot be
  changed through the client-facing update grant;
- server-side validation bounds all public text, URL, email, and device inputs;
- database checks enforce durable size/cardinality bounds for direct writes.

## Providers — setServiceModes

```text
setServiceModes(modes) -> ProviderServiceMode[]
```

Guarantees:

- only the authenticated Provider `OWNER` may replace modes;
- supported values are `DROP_OFF`, `MEETUP`, `HOME_SERVICE`, and `OTHER`;
- `(provider_id, mode)` remains unique;
- replacement commits atomically, so invalid input cannot leave partial modes;
- replacements for the same Provider are serialized, so concurrent calls leave
  exactly one submitted set rather than a mixed union;
- direct authenticated insert/update/delete on `provider_service_modes` is denied.

## Providers — updateCurrentProviderUserProfile

```text
updateCurrentProviderUserProfile(input) -> ProviderUserProfile
```

Guarantees the authenticated user can update only their canonical person
profile's display name, contact phone, and avatar URL. It does not change role,
membership, Provider identity, or another user's profile.

## Repair Requests — submitRepairRequest

```text
submitRepairRequest(providerSlug, input) -> RepairRequestReceipt
```

Guarantees:

- target Provider exists and accepts Requests;
- input validates server-side;
- selected preferred Service Mode is valid or intentionally represented as `OTHER`;
- Request is `SUBMITTED`;
- returned Request Reference is safe to show publicly;
- no Repair is created.

Implementation notes:

- the public Server Action validates with `submitRepairRequestSchema`;
- anonymous/authenticated clients call a narrow `submit_repair_request` RPC;
- direct anonymous table insert/read is denied;
- Provider availability and Service Mode support are rechecked at write time.

## Repair Requests — list/get

```text
listRepairRequests(options?) -> RepairRequestPage
getRepairRequest(requestId) -> RepairRequestDetail | null
```

`options` may contain a Request `status` and positive integer `page`. Page 1 is
the default. `RepairRequestPage` contains up to 25 `items`, the normalized page
number, and `hasPrevious`/`hasNext` flags. Persistence fetches one additional
row to derive `hasNext` without a full count query and orders by
`submitted_at DESC, id DESC` for stable page boundaries.

The Module rejects non-integer or non-positive page values. The Next.js route
adapts malformed URL page values to page 1. Status changes reset to page 1;
Previous/Next links preserve the active status.

Both list/get Interfaces resolve trusted Provider context internally. The
persistence query includes `provider_id` and RLS repeats membership isolation.
URL/query identifiers never grant access.

## Repair Requests — acceptRepairRequest

```text
acceptRepairRequest(requestId, verifiedInput)
  -> AcceptedRepairResult
```

Guarantees:

- caller acts for owning Provider;
- Request is still `SUBMITTED`;
- Provider-verified values become authoritative Repair values;
- exactly one Repair is created;
- Repair origin is `CUSTOMER_REQUEST`;
- Request becomes `ACCEPTED`;
- Repair starts `IN_PROGRESS`;
- initial Status Event exists;
- Ticket Number and Tracking Code are generated.

A second acceptance attempt must not create another Repair.

The implementation delegates authoritative Repair creation to the Repairs
Module's Request-origin seam. PostgreSQL locks the Request and commits Repair,
initial `NULL -> IN_PROGRESS` Status Event, and Request `ACCEPTED` state in one
transaction. Unique `repairs.repair_request_id` remains defense in depth.

## Repair Requests — declineRepairRequest

```text
declineRepairRequest(requestId) -> RepairRequestDetail
```

Guarantees:

- caller owns Request through Provider context;
- only a `SUBMITTED` Request can be declined;
- no Repair is created.

The implementation locks the Request before the terminal update, so accept vs
decline and repeated-decision races produce one durable outcome.

## Repairs — createRepair

```text
createRepair(input) -> RepairResult
```

Guarantees:

- Provider ownership is derived from trusted context, not client-supplied provider id;
- input validates;
- origin is `PROVIDER_CREATED`;
- status begins `IN_PROGRESS`;
- Ticket Number and Tracking Code are unique under chosen scopes;
- initial Status Event is appended.

The Module derives Provider identity from authenticated membership. PostgreSQL
commits the Repair and initial Status Event together and rechecks the configured
Service Mode at write time.

## Repairs — listRepairs / getRepair

```text
listRepairs(options?) -> RepairPage
getRepair(repairId) -> RepairDetail | null
getRepairCounts() -> RepairCounts
```

Guarantees:

- every result is scoped to authenticated Provider context and RLS;
- invalid/cross-Provider identifiers reveal only not-found behavior;
- list pages contain at most 25 summaries with deterministic ordering;
- search/filter/page options validate before persistence;
- search accepts bounded human punctuation and is quoted/escaped before raw
  PostgREST OR composition;
- the `WAITING` aggregate returns only `WAITING_FOR_PARTS` and
  `AWAITING_APPROVAL` Repairs;
- detail composes Status Events and Customer Updates without exposing raw
  persistence rows.

## Repairs — updateRepairDetails

```text
updateRepairDetails(repairId, input) -> RepairDetail
```

Guarantees:

- Provider owns Repair;
- authoritative snapshot input uses durable creation bounds;
- omitted Service Mode input preserves the recorded snapshot, explicit `null`
  clears it, and a changed non-null mode must be currently configured;
- changed modes are rechecked at write time under a shared Provider-row lock,
  serializing with Owner Service Mode replacement;
- later removal of a configured mode does not invalidate or erase historical
  Repair data;
- identity, ownership, source, ticket/tracking, lifecycle, actor, and timestamp
  columns are not client-editable;
- RLS and column-level grants repeat the allow-list in PostgreSQL;
- unsupported write-time changes return `UNSUPPORTED_SERVICE_MODE` without
  changing the durable snapshot.

## Repairs — changeRepairStatus

```text
changeRepairStatus(repairId, nextStatus) -> RepairDetail
completeRepair(repairId) -> RepairDetail
```

Guarantees:

- Repair belongs to Provider context;
- transition is allowed;
- `current_status` and Status Event are committed atomically;
- completion timestamp is maintained consistently.

`WAITING_FOR_PARTS` and `AWAITING_APPROVAL` are optional states, never mandatory
stages. `completeRepair` is the deliberate `READY -> COMPLETED` operation;
ordinary status change input does not silently complete a Repair.

## Repairs — addCustomerUpdate

```text
addCustomerUpdate(repairId, message) -> CustomerUpdate
```

Guarantees:

- Provider owns Repair;
- message validates;
- update is customer-visible;
- Repair status does not need to change.

This interface must not accept/republish Internal Notes accidentally.
Customer Updates are append-only for authenticated Provider members and do not
create Status Events.

## Tracking — lookupRepairByTrackingCode

```text
lookupRepairByTrackingCode(code) -> PublicRepairView | null
```

Guarantees:

- raw input longer than 128 characters is rejected before normalization or
  persistence;
- bounded input is trimmed, uppercased, and accepted only as
  `TRK-[A-F0-9]{24}`;
- malformed and unknown values both return `null` without revealing why;
- database lookup uses the existing globally unique Tracking Code index;
- Provider request availability does not hide an existing Repair;
- at most 25 Customer Updates are returned newest first;
- last activity is the later of Repair update time and newest public Update;
- persistence projection drift fails closed instead of adding fields to public
  output.

`PublicRepairView` contains only:

- Provider display name;
- safe device summary composed from device type and optional brand/model;
- current Repair Status plus customer-facing label/description;
- Customer Update message/timestamp pairs;
- computed last-updated timestamp;
- selected Service Mode label;
- Provider-neutral READY handover guidance.

It must not contain:

- customer name/phone/email;
- Internal Notes;
- Diagnosis, serial number, or detailed technical snapshot;
- raw internal/auth ids and Update authors;
- Ticket Number, echoed Tracking Code, or Request origin;
- Status Event history;
- Provider-private fields.

Unexpected persistence failures are surfaced to the Next.js adapter as an
unavailable outcome without exposing database details. Durable rate limiting
must cover the public RPC itself before broad production exposure.

After this projection is successfully validated, Tracking attempts the
Analytics observation below. Analytics failure does not change the returned
`PublicRepairView`.

## Analytics — recordSuccessfulTrackingView

```text
recordSuccessfulTrackingView(trackingCode) -> boolean
```

Guarantees:

- called only with a Tracking Code already normalized and successfully resolved
  by Tracking;
- invokes only `record_successful_tracking_view(text)`;
- returns `true` after successful persistence;
- catches persistence failure, emits one constant sanitized log message, and
  returns `false`;
- never exposes or stores the Tracking Code in analytics rows;
- never receives a Repair/customer object or private projection fields;
- does not turn successful Tracking into an unavailable response.
