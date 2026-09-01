<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Tracknologia Engineering Rules

These instructions apply to all code, tests, database changes, configuration, and documentation in this repository.

The goal is not to produce the most code or the most abstractions. The goal is to produce a small, coherent, maintainable system whose structure reflects Tracknologia's actual domain.

## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub Issues for `Jacinth091/Tracknologia`. See `docs/agents/issue-tracker.md`.

### Triage labels

The Matt Pocock skill defaults are the canonical triage labels for this repo. See `docs/agents/triage-labels.md`.

### Domain docs

Tracknologia uses a single-context domain docs layout rooted at `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.

---

## Toolchain & commands

- Package manager is **pnpm** (`packageManager: pnpm@11.22.0`); Node must be `>=24 <25`. Do not use npm/yarn for installs.
- Quality gates, in CI order: `pnpm format:check` → `pnpm lint` → `pnpm typecheck` → `pnpm test:run` → `pnpm build`.
  - Prettier formatting is enforced by CI. Run `pnpm format` before committing.
  - `pnpm typecheck` runs `next typegen && tsc --noEmit` — it regenerates route types first, so run it after adding/changing routes.
- Tests use Vitest with `globals` and the node environment. `pnpm test` is watch mode; use `pnpm test:run` (covers `src/` and `tests/contracts/`). Run one file with e.g. `pnpm test:run tests/contracts/provider-security.contract.test.ts`.
  - The Vitest config aliases `@` to `src/` and `server-only` to an empty module, so feature modules import cleanly in tests.
  - Database integration tests (`pnpm test:db`, `tests/integration/db.test.ts`) hit real PostgreSQL via a local Supabase stack. Start Supabase, then run `pnpm db:reset` before `pnpm test:db`. **Any schema, RLS, policy, trigger, constraint, or RPC change requires this suite** — unit tests alone are not enough.
- Local env lives in `.env.local` (copy `.env.example`). Compose reads it via `env_file`. `NEXT_PUBLIC_REQUIRE_EMAIL_CONFIRMATION=false` skips email confirmation locally; `RESEND_API_KEY` is optional in dev (emails log to console). CI builds with placeholder Supabase values.
- Playwright E2E (`tests/e2e/`) runs with `pnpm test:e2e` and drives the real UI for the mandatory release scenarios (`docs/TESTING.md`). It requires a local Supabase stack: start it, run `pnpm db:reset`, and point `.env.local` at it (see `.env.example`). The destructive fixtures refuse non-local Supabase hosts, and retries are disabled by policy.

## Branches & commits

- Promotion path enforced by `.github/workflows/branch-policy.yml`: only `staging` merges into `master`; only `feature/NN/*`, `fix/*`, `hotfix/*`, `chore/*`, or `dependabot/*` merge into `staging`; any branch may PR into a protected `feature/**` integration branch. Active development lands on `staging`.
- Commit messages follow `tag[author_name]: description` (e.g., `feat[jnnzz]: add pilot analytics`) — see the `git-commit-rules` skill.

---

## 1. Read Before Writing

Before changing code:

1. Inspect the existing implementation related to the change.
2. Inspect the relevant feature under `src/features/`.
3. Inspect the relevant repository documentation.
4. For Next.js-specific behavior, follow the generated Next.js rule above and read the relevant documentation from the installed `next` package.
5. Preserve established conventions unless there is a concrete reason to change them.

Do not rewrite working code merely to make it look different.

Do not introduce a new pattern when an established repository pattern already solves the problem adequately.

---

## 2. Prefer Simple, Deliberate Code

Do not generate architectural or abstraction "slop."

Every abstraction must solve an actual problem.

Avoid:

- unnecessary wrappers;
- pass-through functions;
- interfaces with only one hypothetical implementation;
- generic managers;
- generic services;
- generic repositories created only for architectural appearance;
- helper files containing unrelated functions;
- duplicated schemas or types;
- speculative future-proofing;
- unused extension points;
- unnecessary inheritance;
- large configuration systems for simple requirements.

Prefer:

- direct code when direct code is sufficient;
- cohesive feature-local implementation;
- clear names;
- explicit business rules;
- small interfaces hiding meaningful behavior.

Use the deletion test:

> If deleting an abstraction only removes indirection and does not force meaningful complexity back into callers, the abstraction probably should not exist.

---

## 3. Design Deep Modules

A Module should expose a small Interface while hiding meaningful implementation complexity.

Tracknologia currently organizes business capabilities under:

```text
src/features/
├── auth/
├── providers/
├── repair-requests/
├── repairs/
├── tracking/
└── analytics/
```

These directories represent Modules even though the parent folder is called `features`.

A feature should own the knowledge related to that capability.

Example:

```text
src/features/repairs/
├── index.ts
├── commands.ts
├── queries.ts
├── schemas.ts
├── types.ts
└── persistence.ts
```

Do not create every file above automatically.

Only create a file when the feature has enough responsibility to justify it.

---

## 4. Preserve Dependency Direction

Preferred dependency direction:

```text
app
 ↓
features
 ↓
infrastructure / persistence
 ↓
Supabase / PostgreSQL
```

Do not reverse this direction.

In particular:

- `src/features/` must not depend on Next.js route files.
- features must not import from `src/app/`.
- persistence must not know about React components.
- business rules must not live inside pages merely because the page currently calls them.
- UI should not directly implement domain invariants.

Next.js hosts Tracknologia.

Next.js does not define Tracknologia's business model.

---

## 5. Keep `src/app` Thin

`src/app/` owns:

- routing;
- layouts;
- page composition;
- route-specific UI;
- Server Actions;
- Route Handlers when required;
- adapting browser/HTTP inputs to feature Interfaces.

It should not own core business rules.

Bad:

```text
Server Action
├── validate provider ownership
├── generate ticket number
├── generate tracking code
├── determine initial status
├── write Repair
├── write StatusEvent
└── enforce lifecycle rules
```

Preferred:

```text
Server Action
    ↓
Repairs Module
    ↓
Persistence
```

The Server Action should adapt the request to the Module, not become the Module.

---

## 6. Feature Locality

Keep code close to the feature that owns it.

Prefer:

```text
features/repairs/schemas.ts
features/repairs/types.ts
```

over global dumping grounds such as:

```text
src/types/
src/schemas/
src/services/
src/repositories/
src/helpers/
src/constants/
```

Do not create generic top-level folders unless several genuinely unrelated features require the same concept.

---

## 7. Barrel Files Are Interfaces, Not Convenience Dumps

Selective barrel files are allowed.

A feature may expose its public Interface through:

```text
src/features/repairs/index.ts
```

Callers should normally import through that Interface:

```ts
import { createRepair, getRepair, type RepairStatus } from "@/features/repairs";
```

Avoid deep imports across feature boundaries.

Avoid global barrels such as:

```text
src/features/index.ts
src/components/index.ts
src/lib/index.ts
```

that re-export large portions of the repository.

Do not export implementation details merely because they exist.

---

## 8. Domain Language Must Stay Precise

Use Tracknologia's established terminology consistently.

Important distinctions include:

- `Provider` is the general repair-provider concept.
- `SHOP` and `INDEPENDENT` are Provider types.
- Do not use "shop" as a generic synonym for every Provider.
- `User` is an authenticated person.
- `ProviderMembership` associates a User with a Provider.
- A shop may have only one User, and that User may be both owner and technician.
- Do not create a separate Technician entity unless the domain later requires it.
- `RepairRequest` is customer-submitted information awaiting Provider action.
- `Repair` is the authoritative accepted repair record.
- `ReportedProblem` comes from the customer.
- `Diagnosis` comes from the Provider.
- `ServiceMode` describes how the repair is arranged.
- supported Service Modes are:
  - `DROP_OFF`
  - `MEETUP`
  - `HOME_SERVICE`
  - `OTHER`

Do not silently introduce alternative terminology for existing concepts.

---

## 9. Repair Lifecycle

The current Repair states are:

```text
IN_PROGRESS
WAITING_FOR_PARTS
AWAITING_APPROVAL
READY
COMPLETED
```

A newly created Repair begins as:

```text
IN_PROGRESS
```

`WAITING_FOR_PARTS` and `AWAITING_APPROVAL` are optional blocking states, not mandatory workflow stages.

Do not recreate artificial sequential stages such as:

```text
RECEIVED
DIAGNOSING
REPAIRING
TESTING
```

unless the product requirements explicitly change.

Technical work can occur while the Repair remains `IN_PROGRESS`.

---

## 10. RepairRequest and Repair Must Remain Separate

A `RepairRequest` is not a `Repair`.

Customer path:

```text
RepairRequest
    ↓ Provider accepts
Repair
```

Provider-direct path:

```text
Provider
    ↓ create directly
Repair
```

A Provider must be able to create a Repair without a RepairRequest.

A RepairRequest may create at most one Repair.

Do not build separate downstream Repair workflows based on the Repair's origin.

---

## 11. Avoid Premature Database Complexity

Tracknologia is an MVP.

Do not add tables merely because they may be useful someday.

The current design intentionally avoids premature entities such as:

- customers;
- devices;
- branches;
- technician assignments;
- inventory;
- parts catalogs;
- payments;
- invoices;
- reviews;
- provider-location hierarchies;
- appointment systems.

Prefer columns for single-valued or snapshot information.

Use separate tables where information is genuinely repeating, relational, or historical.

Current examples that justify separate tables include:

- `provider_memberships`;
- `provider_service_modes`;
- `repair_status_events`;
- `repair_updates`.

Any new table must have a present product requirement.

---

## 12. Database Changes & Supabase Migrations

Tracknologia uses PostgreSQL managed through Supabase.

When changing the database:

- preserve relational integrity;
- add appropriate foreign keys;
- add uniqueness constraints for domain invariants;
- consider nullability carefully;
- consider RLS implications (avoid recursive subqueries on the same table);
- update schema documentation;
- update tests affected by the change.

Do not modify a shared or remote database manually and leave the repository unaware of the change. All schema, table, enum, trigger, and RLS changes must be committed as versioned SQL migration files.

### Migration Workflow & Structure

1. **Location**: All migrations live in `supabase/migrations/` using timestamped naming:
   ```text
   supabase/migrations/YYYYMMDDHHMMSS_description.sql
   ```
2. **Applying Migrations**:
   - Link project once:
     ```bash
     npx supabase link --project-ref <your-project-ref>
     ```
   - Push new migrations to remote database:
     ```bash
     npx supabase db push
     ```
   - Local Docker development (alternative):
     ```bash
     npx supabase start
     ```
3. **Environment Configuration (`.env.local`)**:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your-publishable-key>
   ```
4. **Trigger & RLS Writing Rules**:
   - `SECURITY DEFINER` trigger functions on `auth.users` must explicitly set:
     ```sql
     SET search_path = public, pg_temp;
     ```
   - Always grant table and schema permissions to `authenticated`, `service_role`, and `anon` where appropriate.
   - Avoid self-referencing subqueries inside RLS policies on the same relation to prevent `infinite recursion detected` errors.

---

## 13. Authentication and Authorization Are Different

Supabase Auth owns authentication:

```text
Who is this user?
```

Tracknologia owns authorization:

```text
Which Provider do they belong to?
What role do they have?
Can they perform this action?
Does this Repair belong to their Provider?
```

Do not treat a valid Supabase session as sufficient authorization.

---

## 13A. Application Owns Business Operations; PostgreSQL Owns Persistence Guarantees

Tracknologia uses Next.js as the full-stack application runtime. Supabase provides authentication and PostgreSQL infrastructure; it is not the default owner of Tracknologia business use cases.

Use this responsibility flow by default:

```text
Browser
   ↓
Next.js Server Action / Route Handler
   ↓
Owning feature Module
   ↓
Persistence
   ↓
Supabase / PostgreSQL
```

The layers have different responsibilities.

### Next.js adapters

Server Actions and Route Handlers should:

- receive browser/HTTP input;
- adapt route/form values into feature input;
- call the owning feature Interface;
- translate deliberate feature outcomes into redirects, revalidation, or responses.

They must not become the business/domain layer.

### Feature Modules

The owning feature Module should:

- own the use case and domain vocabulary;
- validate business input and preconditions;
- derive or require trusted authorization context;
- make business/domain decisions;
- orchestrate the operation and its required side effects;
- expose a small, meaningful Interface to `src/app` and other Modules.

Examples include:

```text
Providers.createProvider(...)
Providers.createStaffInvitation(...)
Providers.acceptStaffInvitation(...)
Repairs.changeRepairStatus(...)
RepairRequests.acceptRepairRequest(...)
```

Do not move these semantics into SQL merely because persistence uses Supabase.

### Persistence

Server-only persistence code should:

- hide `supabase-js`, query, and RPC mechanics;
- translate feature inputs into persistence operations;
- return explicit results and failures;
- avoid inventing product semantics that belong to the feature.

Direct `.from(...).select/insert/update/delete` calls are acceptable inside persistence when a single statement plus RLS and constraints provides the required correctness guarantee.

An RPC is not automatically better than direct persistence.

### Supabase Auth

Supabase Auth owns authentication mechanics:

```text
identity
passwords
sessions
email/auth tokens
```

Tracknologia owns authorization and business behavior.

Do not put Provider creation, Staff onboarding, Repair lifecycle behavior, or other feature use cases into Auth merely because the authenticated user is involved.

### PostgreSQL / Supabase database

PostgreSQL should own persistence guarantees such as:

- durable storage;
- foreign keys and relational integrity;
- uniqueness and check constraints;
- RLS and least-privilege enforcement;
- narrow atomic transactions;
- row locking and concurrency protection;
- write-time rechecking of security/integrity invariants where races matter.

Application ownership does **not** mean trusting the application alone. Critical authorization and integrity invariants should still be enforced again by RLS, constraints, and transactional checks where appropriate.

### RPC / database-function rule

Use a PostgreSQL RPC/function when the current `supabase-js` architecture needs a database-side transaction or race-safe operation that cannot safely be represented as independent calls.

Good RPC responsibilities include:

```text
lock a row
verify a credential/invitation is still valid at write time
prevent an invalid duplicate or second membership
insert multiple required rows atomically
advance/consume durable state atomically
commit everything or roll everything back
```

Do **not** use an RPC as the default business-service layer.

An RPC should normally not decide:

```text
which feature owns the operation
what a domain concept means
which onboarding screen comes next
which profile concept exists
fallback display-name semantics
notification/email behavior
redirect/revalidation behavior
cross-feature orchestration
```

Those decisions belong to the owning feature/application layer.

Even when a database transaction repeats a business invariant for integrity or security, the feature Module remains the semantic owner of the use case.

### Atomicity rule

If several writes together define one required durable state, do not split them into unchecked calls.

Bad:

```text
create Provider + OWNER atomically
then perform a separate required Provider-profile UPDATE
then ignore the UPDATE result
```

Preferred:

```text
Feature Module decides the complete operation
        ↓
Persistence invokes one narrow transaction when atomicity is required
        ↓
PostgreSQL commits all required durable writes or rolls them all back
```

If a follow-up write is intentionally outside the transaction, its failure must be checked, surfaced, and safe to retry.

### Do not add infrastructure only to avoid RPCs

Do not introduce Prisma, a new PostgreSQL driver, or another persistence framework merely to move transaction syntax out of PostgreSQL.

If Tracknologia later adopts application-controlled SQL transactions, make that an explicit architecture decision with a present requirement and documented trade-off.

### Review rule

For every non-trivial mutation, reviewers should be able to answer:

1. Which feature owns the business operation?
2. Is the Next.js route/action only adapting transport/UI concerns?
3. Is persistence hiding database mechanics rather than defining product semantics?
4. Does PostgreSQL enforce the necessary RLS, constraints, and atomicity?
5. Is an RPC used only because a real transaction/concurrency/security boundary requires it?
6. Are required writes atomic, or are intentionally separate failures checked and recoverable?

If those answers are unclear, the responsibility boundary needs redesign before merge.

---

## 14. Authorization Must Be Enforced Close to Business Behavior

Use the authentication/authorization feature to resolve trusted context.

Conceptually:

```ts
const context = await requireProviderContext();
```

The trusted Provider must be derived from authenticated membership.

Do not trust identifiers supplied by the browser such as:

```text
providerId
userId
role
```

when they can be derived securely from the authenticated session.

Ownership checks must occur server-side.

---

## 15. RLS Is Required Defense in Depth

Provider-owned data must be protected using PostgreSQL Row Level Security where applicable.

Application authorization and RLS complement each other.

Do not rely exclusively on:

- page hiding;
- client-side checks;
- redirects;
- `proxy.ts`;
- disabled buttons.

Provider A must not be able to read or mutate Provider B's data even if an identifier is manually changed.

---

## 16. `proxy.ts` Is Not the Authorization System

`proxy.ts` lives at the repository root (this Next.js version uses `proxy.ts`, not `middleware.ts`). It may handle:

- session refresh;
- redirects;
- optimistic route protection.

It must not become the only enforcement mechanism for protected data.

Real authorization belongs closer to:

```text
feature Interface
        ↓
persistence
        ↓
RLS
```

---

## 17. Server and Client Separation

Prefer Server Components unless browser interactivity requires a Client Component.

Add:

```ts
"use client";
```

only when required for things such as:

- local interactive state;
- event handlers;
- browser-only APIs;
- client-only libraries.

Do not convert large component trees to Client Components unnecessarily.

Sensitive code and persistence implementations must remain server-only.

Use:

```ts
import "server-only";
```

where appropriate.

---

## 18. Never Expose Secrets

Never commit:

- `.env.local`;
- Supabase secret keys;
- service-role keys;
- database passwords;
- private credentials.

Never place privileged credentials inside:

```text
NEXT_PUBLIC_*
```

variables.

Browser-visible Supabase credentials must rely on RLS for protection.

---

## 19. Validate Untrusted Input

All external input is untrusted.

This includes:

- form submissions;
- query parameters;
- route parameters;
- HTTP bodies;
- RepairRequest submissions;
- tracking codes.

Use Zod at appropriate server-side seams.

Client-side validation improves UX.

Server-side validation protects the system.

Do not duplicate validation logic unnecessarily.

---

## 20. Public Tracking Must Use a Restricted View

Never return the full `Repair` object to an unauthenticated customer.

Public tracking must return a purpose-built representation such as:

```text
PublicRepairView
```

Only expose fields intentionally safe for customer consumption.

Never expose:

- internal notes;
- private identifiers;
- authentication identifiers;
- Provider-internal data;
- unrelated customer information.

Tracking codes must not be predictable sequential identifiers.

---

## 21. Dependencies Must Earn Their Place

Do not install a dependency simply because it is commonly used.

Prefer existing platform/framework capabilities when sufficient.

Current MVP direction intentionally does not require:

- Express;
- NestJS;
- Axios;
- React Router;
- Prisma;
- Redux;
- Zustand.

Before adding a new package:

1. identify the concrete problem;
2. check whether the existing stack already solves it;
3. evaluate maintenance/security cost;
4. document the dependency when it materially changes the stack;
5. commit the lockfile update.

Avoid dependencies for trivial helpers.

---

## 22. UI Conventions

Use the established stack:

- React;
- Next.js;
- Tailwind CSS;
- shadcn/ui;
- Base UI;
- the selected project preset/theme.

Prefer existing shadcn primitives over recreating foundational controls.

Keep the UI:

- modern;
- professionally rounded;
- responsive;
- accessible;
- usable on phone-sized screens.

Independent repairers are an important Provider segment, so Provider workflows must remain practical from a mobile browser.

Avoid random per-component colors, radii, shadows, or spacing when theme tokens can be used instead.

---

## 23. Reuse Before Generalizing

There is a difference between reuse and premature abstraction.

If two implementations happen to look similar, do not immediately extract a generic abstraction.

Extract only when the concepts are genuinely the same and change for the same reason.

Duplicating two simple lines can be preferable to introducing the wrong abstraction.

---

## 24. Do Not Hide Important Logic in Utilities

Business behavior should be named after the business capability it implements.

Avoid code such as:

```ts
utils.handleStatus(...)
helpers.processData(...)
common.execute(...)
```

Prefer domain-oriented names such as:

```ts
changeRepairStatus(...)
acceptRepairRequest(...)
createRepair(...)
```

Names should reveal intent.

---

## 25. Error Handling

Do not:

- silently swallow errors;
- catch errors only to ignore them;
- replace useful errors with generic "something went wrong" internally;
- expose sensitive implementation errors to public users.

Failure modes at Module Interfaces should be deliberate and understandable.

Handle expected domain failures separately from unexpected infrastructure failures when useful.

---

## 26. Keep Diffs Focused

When implementing a task:

- change only what is necessary;
- avoid unrelated formatting changes;
- avoid opportunistic rewrites;
- avoid renaming unrelated files;
- avoid refactoring unrelated features.

If a broader refactor is genuinely necessary, explain why.

Small coherent changes are easier to review and safer to merge.

---

## 27. Remove Dead Code

Do not leave:

- commented-out implementations;
- unused imports;
- unused exports;
- obsolete files;
- placeholder abstractions;
- abandoned experimental code;
- TODOs for code that should simply be completed now.

A TODO is acceptable only when it identifies a real deferred requirement and clearly states what remains.

---

## 28. Avoid Weak Typing

Do not use `any` as an escape hatch.

Prefer:

- inferred types;
- explicit domain types;
- `unknown` for untrusted values followed by validation.

If `any` is genuinely necessary because of an external limitation, document why locally.

---

## 29. Testing Must Follow Behavior

Changes to business behavior should include or update tests.

Prioritize tests for:

- domain invariants;
- authorization;
- Provider isolation;
- RepairRequest acceptance;
- Repair creation;
- Repair state transitions;
- public/private data separation;
- completed lifecycle behavior.

Examples:

```text
Provider A cannot read Provider B's Repair.

Provider A cannot accept Provider B's RepairRequest.

One RepairRequest cannot create two Repairs.

New Repair begins IN_PROGRESS.

Public tracking never exposes internal notes.
```

Avoid low-value tests that merely mirror implementation details.

---

## 30. Run Quality Gates Before Finishing

Before considering work complete:

1. inspect `package.json`;
2. run the repository's available lint checks;
3. run relevant unit/module tests;
4. run type checking when configured;
5. run affected end-to-end tests when practical;
6. ensure the application builds when the change affects build/runtime configuration.

Do not claim tests passed unless they were actually run.

If a required check cannot be run, state that explicitly.

---

# Documentation Is Part of the Change

Code and documentation must not intentionally drift apart.

When implementation changes the system, update the relevant documentation in the same change.

Documentation updates are required when a change affects:

- product behavior;
- domain terminology;
- workflows;
- Repair states;
- Provider rules;
- authorization;
- security assumptions;
- database schema;
- database relationships;
- RLS policies;
- feature/module responsibilities;
- repository structure;
- dependencies;
- environment variables;
- installation/setup;
- Docker behavior;
- testing commands;
- routes/interfaces;
- architectural decisions.

A small internal refactor that does not change any documented behavior or architecture does not require meaningless documentation churn.

---

## Documentation Responsibilities

Use the appropriate document rather than dumping everything into the root README.

### `README.md`

Update when the change affects:

- project overview;
- quick start;
- primary commands;
- high-level stack.

### `docs/SETUP.md`

Update when the change affects:

- prerequisites;
- installation;
- environment variables;
- Supabase setup;
- Docker setup;
- developer onboarding.

### `docs/DEVELOPMENT.md`

Update when the change affects:

- local development workflow;
- coding conventions;
- package-management workflow;
- Docker workflow.

### `docs/ARCHITECTURE.md`

Update when the change affects:

- feature ownership;
- dependency direction;
- seams/interfaces;
- application structure;
- major runtime architecture.

### `docs/DATABASE.md`

Update whenever the database schema, relationships, constraints, or persistence assumptions change.

### `docs/SECURITY.md`

Update whenever authentication, authorization, RLS, public access, secrets, or security controls change.

### `docs/TESTING.md`

Update whenever test tooling, commands, test organization, or required test strategy changes.

### `CONTRIBUTING.md`

Update whenever branch, review, commit, PR, or contributor expectations change.

### `CONTEXT.md`

`CONTEXT.md` is the canonical domain glossary.

Update it when the meaning of a domain term changes or a new important domain term is accepted.

Do not put implementation details in `CONTEXT.md`.

---

## ADR Rules

Create or update an ADR only when the decision:

1. is meaningfully expensive to reverse;
2. would be surprising to a future maintainer without context; and
3. represents a real trade-off between alternatives.

Do not create ADRs for ordinary implementation details.

When an ADR is superseded, preserve the old decision history and mark its status appropriately rather than silently rewriting history.

---

# Completion Checklist

Before finishing any non-trivial task, verify:

```text
[ ] I inspected existing code before changing it.
[ ] I followed current installed Next.js documentation.
[ ] The implementation fits the existing feature structure.
[ ] I did not introduce unnecessary abstraction.
[ ] Business rules are not buried in UI/routes.
[ ] Authentication and authorization are handled correctly.
[ ] Provider isolation is preserved.
[ ] Untrusted input is validated.
[ ] Public output exposes only intended data.
[ ] No secrets were introduced.
[ ] Tests were added/updated where behavior changed.
[ ] Relevant quality checks were run.
[ ] Relevant documentation was updated.
[ ] No unrelated code was changed.
[ ] No dead or placeholder code was left behind.
```

When the simplest correct implementation is sufficient, prefer it over a more elaborate one.
