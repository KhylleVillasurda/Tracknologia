# Tracknologia Feature Documentation

**Baseline:** Tracknologia v0.3 MVP architecture  
**Repository location:** `docs/features/`

This directory documents Tracknologia **per feature Module**. It explains what each feature is responsible for, what it must not own, how it interacts with other features, which routes/UI surfaces expose it, its important domain invariants, security expectations, and the behavior that should be covered by tests.

The repository uses `src/features/` as the physical directory name, while each feature is treated architecturally as a **Module** with a deliberately small Interface and a cohesive implementation.

## Feature map

| Feature                                      | Primary goal                                               | Main actors                           | Key system relationship                                                    |
| -------------------------------------------- | ---------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------- |
| [Auth / Provider Access](01_AUTH.md)         | Establish trusted authenticated Provider context           | Provider User                         | Supplies authorization context to protected features                       |
| [Providers](02_PROVIDERS.md)                 | Represent and configure a Repair Provider                  | Provider User, Customer (public view) | Supplies Provider identity/configuration to Requests and Tracking          |
| [Repair Requests](03_REPAIR_REQUESTS.md)     | Capture customer pre-repair intake for one Provider        | Customer, Provider User               | May create exactly one Repair when accepted                                |
| [Repairs](04_REPAIRS.md)                     | Manage the authoritative repair record and lifecycle       | Provider User                         | Central operational feature consumed by Tracking and observed by Analytics |
| [Tracking](05_TRACKING.md)                   | Give Customers safe accountless repair visibility          | Customer                              | Reads a restricted public projection of Repair data                        |
| [Analytics / Pilot Metrics](06_ANALYTICS.md) | Measure whether the MVP is producing the intended behavior | Product/team                          | Derives domain metrics and records successful Tracking views best-effort   |

See [00_FEATURE_INTEGRATION_MAP.md](00_FEATURE_INTEGRATION_MAP.md) for end-to-end interaction flows and dependency rules.

## Architectural rule

The normal dependency direction is:

```text
Next.js routes / pages / Server Actions
                ↓
          feature Modules
                ↓
     server-only persistence
                ↓
        Supabase/PostgreSQL
```

Cross-feature calls should be deliberate and one-directional. Avoid generic `services/`, `repositories/`, or orchestration layers that only pass calls through.

## Dashboard note

The Provider Dashboard is **not a separate business feature Module** in the MVP. It is an application composition surface that displays summaries and actions from:

- Repair Requests;
- Repairs;
- Provider configuration where useful.

Do not create a `dashboard` feature merely to forward those queries. Create a dedicated dashboard Module only if the dashboard later develops substantial independent behavior that cannot remain a thin composition surface.

## Documentation maintenance

When behavior changes, update the relevant feature document in the same change. Also update higher-level documents when applicable, especially:

- `CONTEXT.md` for accepted domain terminology only;
- `docs/ARCHITECTURE.md` for architectural changes;
- `docs/DATABASE.md` for schema/constraint changes;
- `docs/SECURITY.md` for auth/RLS/public-access changes;
- `docs/TESTING.md` for testing-strategy changes;
- ADRs only for hard-to-reverse, surprising trade-off decisions.
