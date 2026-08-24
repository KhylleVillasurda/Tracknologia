# Feature Integration Map

## Purpose

This document explains how Tracknologia's feature Modules cooperate without becoming tightly coupled.

## System-level feature relationship

```text
                         ┌─────────────────┐
                         │      Auth       │
                         │ Provider Access │
                         └────────┬────────┘
                                  │ trusted ProviderContext
                                  ▼
┌───────────────┐       ┌─────────────────┐
│   Providers   │──────▶│ Repair Requests │──────▶┐
└───────┬───────┘       └─────────────────┘       │ accepted request
        │                                         ▼
        │ public/config data               ┌─────────────────┐
        └─────────────────────────────────▶│     Repairs     │
                                          └───────┬─────────┘
                                                  │ safe public projection
                                                  ▼
                                          ┌─────────────────┐
                                          │    Tracking     │
                                          └─────────────────┘

Analytics observes meaningful events from the system but should not become
required for core domain operations to succeed.
```

## Dependency principles

### Auth / Provider Access

Protected feature operations depend on Auth for trusted identity and Provider context. Auth must not contain Repair or Repair Request business behavior.

### Providers

Providers owns Provider identity and operating configuration. Repair Requests uses public Provider information to determine whether a provider-specific request page exists, whether Requests are accepted, and which Service Modes are supported. Repairs validates intentional Service Mode selections against that configuration, while preserving already-recorded modes as historical Repair snapshots. Provider mode replacement and Repair mode changes serialize through the Provider-row lock.

### Repair Requests → Repairs

This is the most important cross-feature transition.

An accepted Repair Request creates one authoritative Repair. The dependency should remain one-directional:

```text
Repair Requests → Repairs
```

Repairs must not call back into Repair Requests for ordinary lifecycle behavior. Once a Repair exists, its downstream lifecycle is independent of whether its origin was `CUSTOMER_REQUEST` or `PROVIDER_CREATED`.

### Tracking

Tracking is a public read model. It consumes only the customer-safe portion of:

- Provider identity;
- Repair device summary;
- Repair current status;
- Customer Updates;
- timestamps/service-mode information where useful.

Tracking never returns a raw `Repair` row and never mutates a Repair.

### Analytics

Analytics receives or records events after meaningful behavior occurs. Core features should not become unavailable merely because analytics collection fails.

## End-to-end flow A — Customer Repair Request

```text
Customer
  ↓
/p/[providerSlug]/request
  ↓
Providers: load public Provider profile + supported Service Modes
  ↓
Repair Requests: validate + create SUBMITTED Request
  ↓
Provider User opens Request
  ↓
Auth: resolve trusted ProviderContext
  ↓
Repair Requests: authorize ownership + verify request state
  ↓
Provider verifies/corrects intake data
  ↓
Repair Requests → Repairs: create authoritative Repair
  ↓
Request = ACCEPTED
Repair = IN_PROGRESS
Initial Status Event recorded
Ticket Number + Tracking Code generated
  ↓
Tracking can now expose the customer-safe Repair view
```

## End-to-end flow B — Direct Provider Repair

```text
Provider User
  ↓
Auth: resolve ProviderContext
  ↓
Repairs: validate intake + create Repair directly
  ↓
origin = PROVIDER_CREATED
status = IN_PROGRESS
Ticket Number + Tracking Code generated
  ↓
Provider maintains lifecycle
  ↓
Tracking exposes customer-safe view
```

A Repair Request is not required for this path.

## End-to-end flow C — Repair lifecycle

```text
Provider User
  ↓
Auth
  ↓
Repairs
  ├── update snapshot/Diagnosis/Internal Note
  ├── preserve or intentionally change recorded Service Mode
  ├── add Customer Update
  └── change lifecycle state
          ↓
      Status Event
          ↓
Tracking reads current safe state
```

Normal lifecycle:

```text
IN_PROGRESS → READY → COMPLETED
```

Optional blocking branches:

```text
IN_PROGRESS → WAITING_FOR_PARTS → IN_PROGRESS
IN_PROGRESS → AWAITING_APPROVAL → IN_PROGRESS
```

The blocking states are not mandatory sequential stages.

## End-to-end flow D — Customer tracking

```text
Customer
  ↓
/track
  ↓
Tracking: validate Tracking Code input
  ↓
restricted projection query
  ↓
PublicRepairView
  ↓
Customer sees Provider + device + status + Customer Updates
```

The customer does not authenticate and does not receive Provider-private data.

## Dashboard composition

`/dashboard` may compose:

```text
Repair Requests summaries
        +
Repair summaries grouped by state
        +
Create Repair action
```

Do not duplicate the underlying rules in the dashboard route. It should call feature Interfaces and render their outputs.

## Cross-feature invariants

1. Provider ownership comes from trusted authenticated membership, never from a browser-supplied `providerId`.
2. A Repair Request belongs to exactly one Provider.
3. One Repair Request creates at most one Repair.
4. A Provider can create a Repair without a Repair Request.
5. Both Repair origins converge on the same Repair lifecycle.
6. `Reported Problem` and `Diagnosis` remain distinct.
7. Repair status history and Customer Updates remain distinct concepts.
8. Tracking exposes a restricted projection, not internal Repair data.
9. Analytics must not become an availability dependency for normal repair management.
10. Removing a Provider Service Mode does not erase historical Repair
    arrangements; intentional Repair mode changes require current support at
    commit time.
