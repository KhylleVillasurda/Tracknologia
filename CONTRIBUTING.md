# Contributing to Tracknologia

## Principles

- Preserve MVP scope.
- Keep Tracknologia terminology consistent with `CONTEXT.md`.
- Prefer feature locality over generic technical-layer folders.
- Keep module interfaces small and implementations deep.
- Do not introduce a dependency, table, workflow or abstraction without a concrete requirement.
- Security and Provider isolation are acceptance criteria, not cleanup work.

## Soft freeze (v0.1.0 hardening)

Until v0.1.0 ships, `staging` accepts only:

- bug/security/reliability fixes;
- scope-valid missing behavior (see the feature-discovery gate below);
- CI/testing/deployment work;
- required accessibility/UX fixes.

New domain actors, new business Modules, large redesigns, and speculative infrastructure are rejected by default. Every PR into `staging` must complete the release-justification section of the PR template. Full rules: [`docs/release/v0.1.0-hardening/handoff/00_POST_MVP_MASTER_HANDOFF.md`](docs/release/v0.1.0-hardening/handoff/00_POST_MVP_MASTER_HANDOFF.md).

### Feature-discovery gate

Testing sometimes reveals missing behavior. Include it in v0.1.0 only when **all** are true:

1. current MVP scope already implies the behavior;
2. absence makes an existing workflow incomplete, unsafe, or misleading;
3. no major new domain model is required;
4. implementation scope is bounded;
5. the regression surface is known;
6. tests can be added.

Everything else goes to the backlog unless the Lead explicitly expands release scope.

## Branches

Use short descriptive branches, for example:

```text
feature/repair-request-form
feature/provider-profile
fix/repair-rls
refactor/repairs-interface
docs/setup-guide
```

## Commits

Keep commits coherent. Avoid combining unrelated formatting, refactors and feature work unless they are necessary for the same change.

## Database changes

Accepted/shared migrations are forward-only. Never mutate a shared database without a version-controlled migration in `supabase/migrations/`. Before production, rehearse both paths: an empty database replaying the full migration history, and a release-like database applying only pending migrations.

## Required checks

Before opening a PR:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:run
pnpm build
pnpm db:reset
pnpm test:db
```

`pnpm db:reset` and `pnpm test:db` require local Supabase to be running and configured. The database suite runs against real PostgreSQL/Supabase behavior; security-sensitive database changes, including schema, RLS, policies, constraints, triggers, or RPCs, require the real DB suite before completion. See [`docs/17_TESTING_STRATEGY.md`](docs/17_TESTING_STRATEGY.md) for the full testing strategy.

Run Playwright for user-flow changes:

```bash
pnpm exec playwright test
```

## Pull request description

Include:

- what changed;
- why it changed;
- affected Tracknologia feature/domain terms;
- database/security implications;
- tests added or updated;
- screenshots for meaningful UI changes;
- known follow-ups that are intentionally outside the PR.

## Architecture changes

Before introducing a new top-level source folder, database table, framework, ORM, client-state library or separate deployable application, confirm that the current architecture cannot satisfy the requirement cleanly.

Use an ADR only when the decision is hard to reverse, surprising without context, and represents a real trade-off.
