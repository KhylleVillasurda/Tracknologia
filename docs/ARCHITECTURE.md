# Architecture

Tracknologia is an MVP-oriented modular monolith hosted by Next.js.

## Runtime view

```text
Browser
  |
  v
Next.js
  |
  v
Tracknologia feature modules
  |
  v
Supabase adapter / PostgreSQL
```

Next.js hosts the web UI and server runtime, but Tracknologia's business behavior is concentrated in feature modules rather than pages.

## Source structure

```text
src/
├── app/
├── features/
│   ├── auth/
│   ├── providers/
│   ├── repair-requests/
│   ├── repairs/
│   ├── tracking/
│   └── analytics/
├── components/
│   ├── ui/
│   └── shared/
└── lib/
    └── supabase/
```

## Feature module principle

Each feature should expose a small interface and hide its implementation.

Example Repairs interface:

```text
createRepair
getRepair
listRepairs
changeRepairStatus
completeRepair
```

Callers should not need to know how ticket codes, status history, validation, persistence or authorization are implemented internally.

## Dependency direction

Allowed:

```text
app -> features -> infrastructure/database
```

Avoid:

```text
features -> app
features -> React pages
features -> route-local UI
```

## Next.js adapters

Server Actions and Route Handlers are adapters at the web seam.

Example:

```text
Create Repair form
      |
      v
Server Action
      |
      v
Repairs feature
      |
      v
PostgreSQL
```

The Server Action should parse/adapt input and establish authenticated context; the Repairs feature owns Repair behavior.

## Public tracking

Public tracking is a distinct feature even though it reads Repair data.

It exposes a restricted `PublicRepairView` rather than the full Repair representation. This gives the interface a security role as well as a design role.

## Analytics / pilot metrics

Analytics derives Provider, Request, Repair, origin, lifecycle, and completion
metrics from authoritative domain tables. The Next.js adapter composes Tracking
and Analytics without coupling the two feature Modules:

```text
Tracking -> PublicRepairView
                  ↓
       /track Server Action
        ├── response to Customer
        └── after() -> Analytics -> Supabase/PostgreSQL
```

The Analytics Interface hides best-effort persistence for minimal successful-
view telemetry. Analytics latency/failure is outside the response path and does
not make Tracking/domain operations unavailable. No dashboard, broad event
platform, or external analytics dependency is part of the MVP architecture.

## Future native mobile

A native mobile client is deferred. If validated later, stable HTTP Route Handlers or a separate backend can adapt to the same business rules. Do not build a broad REST layer solely for hypothetical future mobile use.
