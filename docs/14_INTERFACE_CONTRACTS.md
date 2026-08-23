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
listRepairRequests(filter?) -> RepairRequestSummary[]
getRepairRequest(requestId) -> RepairRequestDetail | null
```

Both Interfaces resolve trusted Provider context internally. The persistence
query includes `provider_id` and RLS repeats membership isolation. URL/query
identifiers never grant access.

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
createRepair(context, input) -> RepairResult
```

Guarantees:

- Provider ownership is derived from trusted context, not client-supplied provider id;
- input validates;
- origin is `PROVIDER_CREATED`;
- status begins `IN_PROGRESS`;
- Ticket Number and Tracking Code are unique under chosen scopes;
- initial Status Event is appended.

## Repairs — changeRepairStatus

```text
changeRepairStatus(context, repairId, { nextStatus }) -> RepairDetail
```

Guarantees:

- Repair belongs to Provider context;
- transition is allowed;
- `current_status` and Status Event are committed atomically;
- completion timestamp is maintained consistently.

`WAITING_FOR_PARTS` and `AWAITING_APPROVAL` are optional states, never mandatory stages.

## Repairs — addCustomerUpdate

```text
addCustomerUpdate(context, repairId, message) -> CustomerUpdate
```

Guarantees:

- Provider owns Repair;
- message validates;
- update is customer-visible;
- Repair status does not need to change.

This interface must not accept/republish Internal Notes accidentally.

## Tracking — lookupRepairByTrackingCode

```text
lookupRepairByTrackingCode(code) -> PublicRepairView | NotFound
```

`PublicRepairView` may include:

- Provider display name;
- safe device summary;
- current Repair Status;
- customer-safe updates;
- last-updated timestamp;
- selected Service Mode where useful.

It must not contain:

- customer phone/email;
- Internal Notes;
- raw internal ids;
- Provider-private fields;
- unrestricted Diagnosis/private technical notes.

Unknown/invalid codes reveal minimal information and are subject to rate limits.
