# Feature — Analytics / Pilot Metrics

**Code location:** `src/features/analytics/`

## Description

The Analytics / Pilot Metrics feature measures whether Tracknologia's MVP is producing the behaviors needed to validate the product hypothesis.

This feature is intentionally small. It should not become an enterprise analytics platform or a dependency that complicates core Repair operations.

## Primary goal

Collect just enough reliable behavioral data to answer whether Providers actually use Tracknologia for real repairs and whether Customers use accountless tracking.

## Feature goals

Measure events such as:

- Provider registered/created;
- Repair Request submitted;
- Repair Request accepted;
- Repair Request declined;
- Repair created;
- Repair origin (`CUSTOMER_REQUEST` vs `PROVIDER_CREATED`);
- Repair status changed;
- Customer tracking viewed;
- Repair completed.

Support derived questions such as:

- Are Providers entering real Repairs?
- Do Providers return and use the system repeatedly?
- Are Repairs kept current through status changes/updates?
- What percentage of Repairs originate from customer Requests vs direct creation?
- Do Customers actually use Tracking?
- How many Repairs reach completion?
- How long do Requests wait before Provider action?

## Non-goals

The MVP Analytics feature does not require:

- advanced BI dashboards;
- cohort analysis infrastructure;
- machine learning;
- attribution systems;
- detailed technician productivity monitoring;
- surveillance-style user behavior collection;
- a large analytics schema;
- blocking business operations on analytics writes.

## Main users

- Tracknologia product/team during validation;
- potentially project evaluators reviewing pilot evidence.

This is not primarily a Provider-facing feature in the MVP.

## Implemented strategy

Feature 06 avoids a duplicated general-purpose event stream. Provider, Request,
Repair, lifecycle, origin, and completion measurements are derived from their
authoritative tables. Only successful public Tracking views need dedicated
storage because no domain table otherwise retains that observation.

`tracking_events` therefore contains only:

```text
id
repair_id
viewed_at
```

The Tracking Code is used transiently by a narrow database function to resolve
the Repair and is never stored in telemetry.

## Conceptual Interface

```ts
recordSuccessfulTrackingView(trackingCode): Promise<boolean>
```

`true` means the observation was recorded; `false` means analytics was
unavailable. The operation never throws into Tracking. No generic `recordEvent`
abstraction is introduced for one retained event type.

## Event design principles

The successful-view record identifies only the internal Repair and observation
time. It excludes the Tracking Code, customer/provider snapshots, contact
information, IP address, user agent, cookies, device fingerprints, Auth ids,
tokens, and arbitrary metadata.

## Relationship with other features

### Providers

Provider creation metrics come from committed `providers` rows.

### Repair Requests

Submission, decision, conversion, and timing metrics come from committed
`repair_requests` rows and timestamps.

### Repairs

Creation, origin, and completion metrics come from `repairs`; lifecycle metrics
come from `repair_status_events`.

### Tracking

Tracking returns a validated public projection without depending on Analytics.
The `/track` Server Action schedules `recordSuccessfulTrackingView` with Next.js
`after()` only for a successful result. Failed or not-found lookups schedule
nothing.

### Auth

Analytics does not replace audit/authorization logging and should not receive secrets/session tokens.

## Availability rule

Core business operations and public Tracking do not fail only because analytics
recording fails.

Preferred mental model:

```text
Durable domain operation succeeds
        ↓
Analytics observation attempted
```

The `/track` Server Action schedules the observation with Next.js `after()` and
returns the public result without awaiting Analytics. The Analytics Interface
still catches persistence failure, logs a constant sanitized message, and
returns `false` inside the deferred task.

## Privacy/data-minimization requirements

- Do not record passwords/tokens/secrets.
- Avoid customer phone/email unless a specific validated metric genuinely requires them.
- Prefer internal correlation ids over personal data.
- Do not expose analytics data to public Tracking.
- Treat analytics as measurement, not a substitute for domain/audit state.
- Do not claim that repeated views represent distinct Customers; the MVP does
  not use identity tracking or fingerprinting.

## UI

No dedicated analytics dashboard is required for the MVP.

Pilot results may be inspected through:

- direct queries;
- a simple internal report;
- external analytics tooling.

Only build a productized analytics dashboard if Provider/customer needs validate it.

## Important metric definitions

### Repair creation count

Count successfully created authoritative Repairs, not Repair Requests.

### Request conversion

```text
accepted Requests / submitted Requests
```

Interpret carefully during a small pilot; declines or unreviewed Requests may have operational context.

### Repair origin split

```text
CUSTOMER_REQUEST vs PROVIDER_CREATED
```

Useful for deciding whether the pre-request flow is actually valuable.

### Tracking adoption

At minimum distinguish:

- Repairs that received at least one successful tracking view;
- total successful tracking views.

Do not treat repeated refreshes by one Customer as equivalent to many Customers without appropriate deduplication assumptions.

## Testing expectations

Test where analytics implementation is code-owned:

- successful Tracking projection records one view;
- malformed, unknown, failed, or rejected projections record nothing;
- repeated successful views remain distinct raw observations but one adopted
  Repair;
- direct and Request-origin Repairs use the same observation path;
- no secret/private fields or Tracking credential enter stored rows or logs;
- a successful action result returns before an unresolved deferred Analytics
  operation starts;
- Analytics failure remains sanitized inside the deferred task;
- anonymous and authenticated callers cannot read or write the telemetry table
  directly;
- direct RPC input over 128 bytes returns no existence detail and creates no
  telemetry.

## Implemented baseline

Feature 06 is implemented through:

- `src/features/analytics/` for the narrow best-effort Interface and server-only
  persistence adapter;
- `20260825010000_add_tracking_analytics.sql` for `tracking_events`, its index,
  RLS/grants, and the bounded `record_successful_tracking_view` function;
- the `/track` Server Action, which uses Next.js `after()` to schedule
  observation only after Tracking returns a validated successful lookup;
- authoritative-table pilot queries documented in
  `docs/16_VALIDATION_AND_ANALYTICS.md`;
- route-action/feature-local tests plus real PostgreSQL permission, bounded-
  input, origin, repeat-view, and data-minimization coverage.

## Definition of done

The feature is healthy when the team can answer the MVP validation questions
from authoritative domain rows plus minimal successful-view telemetry, without
analytics complexity distorting the product architecture or public Tracking
availability.
