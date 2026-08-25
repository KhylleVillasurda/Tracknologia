# Part 05 — Load, Resilience, and Performance Validation

> Shared release context (repository, reviewed baseline, branch model, severity contract): see [00_POST_MVP_MASTER_HANDOFF.md](00_POST_MVP_MASTER_HANDOFF.md).

## Objective

Determine whether the system supports the intended MVP/pilot load and identify the first real bottleneck before production.

## Test philosophy

Do not optimize for a vanity RPS number.

Measure:

```text
Where does latency rise?
Where do errors begin?
Where do DB connections/locks saturate?
Does the system fail safely?
Are domain invariants preserved under concurrency?
```

## Initial load profiles

| Operation                          |         Start |         Increase |
| ---------------------------------- | ------------: | ---------------: |
| Dashboard reads                    | 10 concurrent |               25 |
| Repair list/search                 |            10 |            25–50 |
| Tracking lookup                    |            25 |           50–100 |
| Public Request submit              |            10 |            25–50 |
| Status changes on separate Repairs |            10 |               25 |
| Same-Repair transition race        |             2 |  repeated bursts |
| Same-Request accept/decline race   |             2 |  repeated bursts |
| Analytics observation              |  25 sustained |              100 |
| Abuse burst                        |           100 | 200+ short burst |

These are test starting points, not permanent capacity promises.

## Initial pilot targets

```text
Provider-page p95 < 1.5 s
Tracking p95 < 2 s
mutation p95 < 2 s
system error rate < 1%
no tenant leakage
no data corruption
no sustained lock backlog
no connection-pool exhaustion
```

Revise after real measurements.

## Metrics

Collect:

```text
p50/p95/p99 latency
HTTP errors
429 responses
Next.js CPU/memory
Supabase/PostgREST latency
PostgreSQL CPU
active DB connections
slow queries
lock waits/deadlocks
database growth
tracking_events growth
```

## Likely hotspots to measure

Dashboard:

```text
repeated auth/context resolution
multiple Repair-count queries
```

First fix should be request-local context reuse, not distributed caching.

Repair search:

```text
OFFSET
wildcard ILIKE
```

Only if measured, consider PostgreSQL-native improvements such as cursor pagination or trigram indexing before external search infrastructure.

Repair detail:

```text
unbounded Provider-visible event/update history
```

If measured, move toward recent history + explicit pagination.

Analytics:

```text
one tracking_event per successful observation
```

Define retention/aggregation before indefinite public growth.

## Dependency-failure drills

Supabase unavailable:

```text
no false success
Tracking returns temporary unavailable
authenticated operations expose infrastructure failure safely
```

Resend unavailable:

```text
invitation state stays consistent
fallback/share behavior is explicit
no duplicate membership
```

Analytics unavailable:

```text
Tracking still succeeds
telemetry failure remains isolated
```

## Optimization rule

Any optimization PR must state:

```text
measured problem
before metric
after metric
new complexity
preserved invariant
```

Do not add Redis, Kafka, Elasticsearch, queues, or microservices without evidence.

## Exit gate

```text
[ ] repeatable load harness exists
[ ] baseline metrics recorded
[ ] rate controls hold under burst traffic
[ ] concurrency races preserve invariants
[ ] dependency failures are safe
[ ] no P0/P1 under intended pilot load
[ ] analytics retention decision recorded
```
