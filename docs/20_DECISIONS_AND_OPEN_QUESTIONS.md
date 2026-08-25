# 20 — Decisions and Open Questions

## Current product baseline

- Tracknologia is Provider-centric.
- Repair Shop and Independent Repairer are equal first-class Provider types.
- A Shop may consist of a single owner who is also the only technician.
- Customers do not require accounts for tracking.
- Provider can create a Repair directly.
- Customer can submit a Provider-specific Repair Request.
- Repair Request belongs to one Provider only.
- Request is not a Repair until accepted.
- Provider verifies/corrects Request data before authoritative Repair creation.
- Drop-off, Meetup, Home Service, Other are baseline Service Modes.
- Independent Repairers do not need to publish a private home address.
- Google Maps/general marketplace remains deferred.

## Repair status baseline

- `IN_PROGRESS`
- `WAITING_FOR_PARTS`
- `AWAITING_APPROVAL`
- `READY`
- `COMPLETED`

Waiting states are manually selected optional branches.

## Current MVP technical baseline

- Next.js App Router + React + TypeScript
- Tailwind CSS
- selective shadcn/ui
- Zod
- Supabase Auth
- PostgreSQL via Supabase
- PostgreSQL RLS
- Docker + Docker Compose development baseline
- feature-oriented `src/features/` structure
- Vitest + React Testing Library + Playwright
- full-stack Next.js rather than separate NestJS/Express backend
- no Axios/React Router/Prisma/Redux required initially

## Current database direction

Nine core application tables and one public projection:

- providers
- provider_user_profiles
- provider_memberships
- provider_invitations
- public_provider_profiles (view)
- provider_service_modes
- repair_requests
- repairs
- repair_status_events
- repair_updates

One minimal validation-telemetry table:

- tracking_events

Supabase manages `auth.users`.

Keep Customer/Device as snapshots rather than separate tables for MVP. Derive
domain analytics from authoritative tables. Store only successful public
Tracking observations in `tracking_events`; do not introduce external event
tooling or a generic analytics stream for the MVP.

## Open product questions

1. Do we need `CANCELLED` or `UNABLE_TO_REPAIR` during MVP?
2. Exact initial Device Type list.
3. Exact required/optional Device Snapshot fields.
4. Does public tracking need secondary verification beyond a strong Tracking Code?
5. Can Customer check Request status before it becomes a Repair?
6. Exact wording for Service Mode `OTHER`.
7. Should `AWAITING_APPROVAL` eventually generalize to a broader customer-blocked state?

## Open technical questions

1. Exact Tracking Code format and whether to store raw code or hash.
2. Exact rate-limiting provider/implementation.
3. Exact deployment platform.
4. Whether to introduce Prisma later if persistence ergonomics justify it.

## Deferred decisions

- native mobile framework;
- dedicated NestJS backend;
- Maps/location routing;
- marketplace ranking/bidding;
- ratings/reviews;
- branch/staff-assignment system;
- customer/device registries;
- inventory/payments/POS;
- microservices.
