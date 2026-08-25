# Plan 10 — Load, Resilience, Performance, and Analytics Retention Validation

**Plan type:** release validation/performance chore  
**Recommended branch:** `chore/load-test-harness`  
**Authoritative source:** `05_LOAD_RESILIENCE_AND_PERFORMANCE.md`

> Derived from the [Handoff Bundle](../handoff/00_POST_MVP_MASTER_HANDOFF.md). Shared guardrails, verification gates, and the multi-agent strategy live in [00_MASTER_INDEX_AND_DEPENDENCY_MAP.md](00_MASTER_INDEX_AND_DEPENDENCY_MAP.md#shared-execution-context); this file carries only plan-specific content.

## Objective

Build a repeatable load/resilience harness, establish pilot baselines, prove concurrency invariants under stress, and optimize only measured bottlenecks.

## Initial Load Profiles

Use the source-defined starting points, not promises:

| Operation                          |         Start |         Increase |
| ---------------------------------- | ------------: | ---------------: |
| Dashboard reads                    | 10 concurrent |               25 |
| Repair list/search                 |            10 |            25-50 |
| Tracking lookup                    |            25 |           50-100 |
| Public Request submit              |            10 |            25-50 |
| Status changes on separate Repairs |            10 |               25 |
| Same-Repair transition race        |             2 |  repeated bursts |
| Same-Request accept/decline race   |             2 |  repeated bursts |
| Analytics observation              |  25 sustained |              100 |
| Abuse burst                        |           100 | 200+ short burst |

## Pilot Targets

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

Revise only after recording real measurements.

## Harness Design

Choose a lightweight script/tool already acceptable to the repository. Keep load scripts outside production runtime code. The harness must support:

```text
configurable base URL/test credentials
concurrency/ramp profile
operation-specific scenarios
latency distribution
HTTP/error counts
429 counts
repeatable race bursts
machine-readable result capture
```

Do not add a large observability stack solely for this milestone.

## Metrics to Capture

```text
p50/p95/p99 latency
HTTP errors / 429s
Next.js CPU/memory where available
Supabase/PostgREST latency
PostgreSQL CPU
active DB connections
slow queries
lock waits/deadlocks
database growth
tracking_events growth
```

## Targeted Hotspot Experiments

### Dashboard

Measure repeated ProviderContext resolution and multiple Repair-count queries. First optimization, if proven, is request-local context reuse/query consolidation—not Redis.

### Repair search

Measure OFFSET/wildcard `ILIKE`. Only when demonstrated problematic, evaluate PostgreSQL-native cursor pagination or trigram indexing.

### Repair detail

Measure long Provider-visible status/update history. Only if it materially degrades latency, plan bounded recent history plus explicit pagination.

### Analytics

Measure growth from one `tracking_event` per observation.

## Analytics Retention Decision

The source requires a recorded retention/aggregation policy before indefinite public growth. Before implementation, Lead must select a bounded rule such as time-based retention and/or aggregated historical metrics. Do not silently delete data until the policy is approved.

Once chosen:

- represent cleanup/aggregation as a deliberate database/job mechanism compatible with current hosting;
- test that Tracking is independent from analytics cleanup/failure;
- document storage-growth assumptions.

## Dependency-Failure Drills

### Supabase unavailable

```text
no false mutation success
Tracking returns temporary unavailable safely
authenticated operations expose infrastructure failure, not logout
```

### Resend unavailable

```text
invitation state consistent
fallback/share behavior explicit
no duplicate membership/invite
```

### Analytics unavailable

```text
Tracking still succeeds
telemetry failure isolated
```

## Optimization PR Rule

Every performance optimization PR states:

```text
measured problem
before metric
after metric
new complexity
preserved invariant
```

## Acceptance Criteria

```text
[ ] repeatable load harness committed/documented
[ ] baseline metrics recorded
[ ] source load profiles executed
[ ] public rate controls hold during burst
[ ] same-Repair and same-Request races preserve invariants
[ ] dependency failures are safe
[ ] no P0/P1 under intended pilot load
[ ] analytics retention/aggregation decision recorded
[ ] any optimization has before/after evidence
```
