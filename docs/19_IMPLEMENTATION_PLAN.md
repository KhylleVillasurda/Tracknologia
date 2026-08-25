# 19 — Implementation Plan

Build vertical slices that prove real user behavior end-to-end.

## M0 — Repository and reproducible environment

- scaffold Next.js App Router with TypeScript/Tailwind;
- initialize shadcn/ui;
- install Zod and Supabase packages;
- establish `src/app`, `src/features`, `src/components`, `src/lib`;
- add Dockerfile, Compose, `.dockerignore`, `.env.example`;
- pin Node LTS in Docker;
- commit `package-lock.json`;
- configure ESLint/typecheck/Vitest/Playwright;
- create Supabase development project/configuration;
- establish migrations and RLS policy workflow.

Acceptance criterion: Windows/Linux developers can clone, configure environment variables, run the same Docker Compose command, and reach the Next.js app.

## M1 — Auth and Provider profile

- Supabase Auth;
- `providers`;
- `provider_memberships`;
- one-person Shop supported naturally;
- Independent Provider supported naturally;
- profile/contact/address/service-area/supported-device fields;
- Provider Service Modes.

Acceptance criterion: one authenticated owner can create/access their Provider dashboard without any separate technician setup.

## M2 — Direct Repair creation

- Repair form;
- Device Snapshot fields;
- Reported Problem;
- Service Mode;
- Ticket/Tracking generation;
- origin `PROVIDER_CREATED`;
- initial `IN_PROGRESS` and initial Status Event;
- Provider Repair list/detail.

## M3 — Public tracking

- `/track`;
- safe `PublicRepairView`;
- difficult-to-enumerate Tracking Code;
- public rate-limit seam;
- minimal successful-view Tracking analytics.

## M4 — Repair lifecycle

- Diagnosis;
- Internal Notes;
- Customer Updates;
- `WAITING_FOR_PARTS`;
- `AWAITING_APPROVAL`;
- resume `IN_PROGRESS`;
- `READY`;
- `COMPLETED`;
- Status Events.

## M5 — Customer Repair Requests

- Provider-specific public Request page;
- Request Reference;
- Request inbox/detail;
- verify/correct data;
- Accept and create exactly one Repair;
- Decline;
- origin `CUSTOMER_REQUEST`.

## M6 — Security and provider-type polish

- RLS policies;
- cross-Provider authorization tests;
- `server-only` persistence boundaries;
- request/tracking rate limits;
- security headers/CSP production configuration;
- Independent Service Mode UX;
- provider-neutral READY wording;
- remove Shop-biased shared labels.

## M7 — Pilot hardening

- responsive/mobile-browser QA;
- Playwright critical journeys;
- logging/error handling;
- demo/seed data;
- analytics for MVP hypotheses;
- deployment configuration.

## Pilot gate

Do not automatically proceed to Maps, marketplace, full inventory/POS, native mobile, or a dedicated NestJS backend. Validate the MVP first.
