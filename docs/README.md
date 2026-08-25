# Tracknologia Documentation

This directory contains the repository-facing engineering documentation for Tracknologia.

## Developer documentation

| Document                           | Purpose                                                        |
| ---------------------------------- | -------------------------------------------------------------- |
| [SETUP.md](SETUP.md)               | Complete local setup and Docker onboarding                     |
| [DEVELOPMENT.md](DEVELOPMENT.md)   | Day-to-day development workflow and conventions                |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Source layout, feature modules, seams and dependency direction |
| [DATABASE.md](DATABASE.md)         | Initial MVP relational model and invariants                    |
| [SECURITY.md](SECURITY.md)         | Authentication, authorization, RLS and public-surface security |
| [TESTING.md](TESTING.md)           | Unit/module, component and E2E testing strategy                |

## Domain documentation

`../CONTEXT.md` is the canonical glossary. It should contain domain terms and their meanings, not implementation details.

## Release hardening (v0.1.0)

`release/v0.1.0-hardening/` holds the release-hardening program for v0.1.0:

- `handoff/` — process parts: change control, security/reliability scope, testing/CI gates, bug burn, load, UAT, RC/deployment, stabilization, readiness checklist. Start at `00_POST_MVP_MASTER_HANDOFF.md`.
- `plans/` — executable implementation plans derived from the handoff, with dependency order and shared execution context. Start at `00_MASTER_INDEX_AND_DEPENDENCY_MAP.md`.

## Architecture Decision Records

Accepted architecture decisions belong in `adr/`.

Use an ADR only when a decision is:

1. costly to reverse;
2. surprising without context; and
3. the result of a real trade-off.

## Documentation rule

When implementation and documentation disagree, do not silently choose one. Determine which represents the accepted Tracknologia decision, correct the implementation or documentation, and record an ADR only when warranted.

# Tracknologia Per-Feature Documentation Package

This package contains repository-ready documentation for Tracknologia's current feature Modules.

Copy the `docs/features/` directory into the Tracknologia repository.

Included features:

- Auth / Provider Access
- Providers
- Repair Requests
- Repairs
- Tracking
- Analytics / Pilot Metrics
- Cross-feature Integration Map

These documents are aligned to the current Tracknologia v0.3 MVP model:
Provider-centric architecture, `SHOP` and `INDEPENDENT` parity, optional
customer Repair Requests, direct Provider Repair creation, minimal meaningful
Repair statuses, accountless Tracking, a lean core data model, and minimal
successful-view validation telemetry.
