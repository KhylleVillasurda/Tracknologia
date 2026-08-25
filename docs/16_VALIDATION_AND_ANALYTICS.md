# 16 — Validation and Analytics

Tracknologia is a FreLean MVP. Instrumentation exists to answer product
hypotheses, not to build an analytics suite.

## Measurement strategy

Authoritative domain tables are the source for Provider, Request, Repair,
origin, lifecycle, and completion measurements. Feature 06 does not duplicate
those facts into a generic event stream. Only successful public Tracking views
use dedicated `tracking_events` rows because no domain table otherwise retains
that observation.

Unless a query adds an explicit time window, its result is an all-time pilot
count. Small-pilot results require operational context and must not be presented
as statistically representative.

## Canonical metric sources

| Validation question                               | Source                                  |
| ------------------------------------------------- | --------------------------------------- |
| Provider creation and type split                  | `providers.created_at`, `provider_type` |
| Repairs created and repeat Provider use           | `repairs.created_at`, `provider_id`     |
| Repair origin split                               | `repairs.origin`                        |
| Request volume, conversion, and decision time     | `repair_requests` status/timestamps     |
| Status maintenance and optional waiting-state use | `repair_status_events`                  |
| Current Repair activity age                       | `repairs`, `repair_updates`             |
| READY ever reached                                | `repair_status_events.to_status`        |
| Repair completion                                 | `repairs.completed_at`                  |
| Successful Tracking views and adopted Repairs     | `tracking_events`                       |

Failed or rolled-back operations do not create contradictory analytics because
the queries read only committed authoritative state.

## Provider metrics

### Provider creation and type split

```sql
SELECT provider_type, count(*) AS providers_created
FROM public.providers
GROUP BY provider_type
ORDER BY provider_type;
```

### Repair creation adoption and origin

```sql
SELECT
  provider_id,
  count(*) AS repairs_created,
  count(*) FILTER (WHERE origin = 'CUSTOMER_REQUEST') AS request_origin,
  count(*) FILTER (WHERE origin = 'PROVIDER_CREATED') AS direct_origin
FROM public.repairs
GROUP BY provider_id
ORDER BY repairs_created DESC, provider_id;
```

Repairs per Provider is the MVP repeat-use signal. Registration count alone is
not adoption.

### Status maintenance

```sql
SELECT
  count(DISTINCT repair_id)
    FILTER (WHERE from_status IS NOT NULL) AS repairs_with_status_changes,
  count(DISTINCT repair_id)
    FILTER (WHERE to_status IN ('WAITING_FOR_PARTS', 'AWAITING_APPROVAL'))
      AS repairs_using_waiting_states,
  count(DISTINCT repair_id)
    FILTER (WHERE to_status = 'READY') AS repairs_ever_ready
FROM public.repair_status_events;
```

The initial `NULL -> IN_PROGRESS` event is creation history and is not counted
as Provider status maintenance.

Current activity age may include both Repair changes and Customer Updates:

```sql
SELECT
  r.id,
  now() - greatest(r.updated_at, coalesce(max(ru.created_at), r.updated_at))
    AS age_since_last_activity
FROM public.repairs r
LEFT JOIN public.repair_updates ru ON ru.repair_id = r.id
WHERE r.current_status <> 'COMPLETED'
GROUP BY r.id, r.updated_at
ORDER BY age_since_last_activity DESC;
```

### Repair Request behavior

```sql
SELECT
  count(*) AS requests_submitted,
  count(*) FILTER (WHERE status = 'ACCEPTED') AS requests_accepted,
  count(*) FILTER (WHERE status = 'DECLINED') AS requests_declined,
  count(*) FILTER (WHERE status = 'ACCEPTED')::numeric
    / NULLIF(count(*), 0) AS acceptance_rate,
  avg(coalesce(accepted_at, declined_at) - submitted_at)
    FILTER (WHERE status IN ('ACCEPTED', 'DECLINED')) AS average_decision_time
FROM public.repair_requests;
```

Unreviewed Requests remain in the denominator for the documented MVP
conversion definition. Report terminal-only conversion separately if the pilot
question changes.

### Completion

```sql
SELECT
  count(*) AS repairs_created,
  count(*) FILTER (WHERE completed_at IS NOT NULL) AS repairs_completed,
  count(*) FILTER (WHERE completed_at IS NOT NULL)::numeric
    / NULLIF(count(*), 0) AS completion_rate
FROM public.repairs;
```

## Customer metrics

### Tracking adoption

```sql
SELECT
  count(*) AS total_successful_tracking_views,
  count(DISTINCT repair_id) AS repairs_with_a_successful_view
FROM public.tracking_events;
```

```sql
SELECT
  count(DISTINCT te.repair_id)::numeric / NULLIF(count(DISTINCT r.id), 0)
    AS tracking_adoption
FROM public.repairs r
LEFT JOIN public.tracking_events te ON te.repair_id = r.id;
```

The denominator is authoritative Repairs issued Tracking credentials. Repeated
refreshes increase total views but not the distinct-Repair adoption count.

### Repeat tracking

```sql
SELECT repair_id, count(*) AS successful_views
FROM public.tracking_events
GROUP BY repair_id
ORDER BY successful_views DESC, repair_id;
```

This is repeat observation per Repair, not unique-Customer measurement. Feature
06 deliberately stores no identity, cookie, network, or fingerprint data.

### Customer communication outcome

During pilot interviews, compare whether Customers still need to call/message
for status after receiving Tracking access. That qualitative outcome is not
inferred from page refresh counts.

## Independent versus Shop comparison

Because both are main target segments, join Provider-owned metrics through
`repairs.provider_id` or `repair_requests.provider_id` and compare:

- Repair creation behavior;
- use of Repair Requests;
- use of Service Modes;
- mobile usage observations gathered during the pilot;
- completion/maintenance behavior.

Do not let a shop-heavy pilot hide poor fit for Independent Repairers.

## Avoid vanity metrics

Do not treat registration count alone as validation.

Stronger evidence:

- real Repairs entered;
- status maintained;
- Customers use Tracking;
- Providers request continued access.
