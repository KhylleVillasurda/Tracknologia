# 23 — Next.js Route and Interaction Surfaces

The MVP does not require a dedicated REST backend. Next.js routes render the web UI; Server Actions may adapt form mutations; Route Handlers are added only where an explicit HTTP interface is useful.

## Public browser routes

### `/track`

Customer enters Tracking Code and receives a `PublicRepairView`.

Implemented as a Server Component plus route-local Client form and thin Server
Action. The form uses POST so the Tracking credential is not placed in URL
query parameters or browser history. The action passes untrusted FormData to
`Tracking.lookupRepairByTrackingCode`; malformed and unknown values share one
neutral not-found result, while infrastructure failure becomes a generic
temporary-unavailable state.

The rendered result contains Provider display name, safe device summary,
customer-facing status meaning, Service Mode label, READY handover guidance,
computed last activity time, and at most 25 message/timestamp-only Customer
Updates. It never renders the underlying Repair representation.

### `/p/[providerSlug]/request`

Customer submits a Repair Request to one specific Provider. The page presents Provider identity and supported Service Modes.

Implemented as a Server Component plus route-local Client form/Server Action.
Dynamic `params` are awaited. Submission returns an inline receipt containing a
Request Reference only; it does not create a Repair or return a Tracking Code.
Unavailable/closed Provider slugs render a generic unavailable state.

## Authentication routes

- `/login`
- `/register`
- `/forgot-password`

Exact Supabase Auth callbacks may add framework-specific routes as implementation requires.

## Provider browser routes

- `/dashboard`
- `/dashboard/requests`
- `/dashboard/requests/[requestId]`
- `/dashboard/repairs`
- `/dashboard/repairs/new`
- `/dashboard/repairs/[repairId]`
- `/dashboard/settings`

`/dashboard/repairs` is implemented as a Server Component using awaited
`searchParams`. It supports bounded, punctuation-safe ticket/customer/device
search, actual-status filters, the `WAITING` aggregate, and 25-row
Previous/Next pagination ordered by `updated_at DESC, id DESC`. Search values
are quoted/escaped before raw PostgREST OR construction. Invalid search input
is preserved and shown with an inline validation error rather than silently
discarded; invalid values do not reach persistence.

`/dashboard/repairs/new` loads the authenticated Provider's configured Service
Modes and adapts a sectioned direct-intake form to `Repairs.createRepair`.
Successful creation redirects to the new detail page only after revalidating
dashboard and Repair list surfaces.

`/dashboard/repairs/[repairId]` awaits the route parameter and renders the
authoritative snapshot, private Provider information, Customer Updates,
Status Events, valid lifecycle actions, and edit/update forms. Invalid and
cross-Provider IDs share not-found behavior. Tracking Code display is private
Provider functionality here; public lookup remains Feature 05.

Repair detail editing preserves an omitted recorded Service Mode, treats the
explicit blank choice as an intentional clear, and renders a removed historical
mode as "recorded on this Repair; no longer offered." Changed non-null modes are
validated again at database write time.

`/dashboard/requests` implements Provider-scoped summary cards with 25-row
pagination. It accepts `status` and `page` query parameters, including
`/dashboard/requests?status=SUBMITTED&page=2`. Status changes reset to page 1;
Previous/Next links preserve status, and page 1 is omitted from canonical link
URLs. Invalid page values render page 1 safely. `/dashboard/requests/[requestId]`
separates customer-reported data from the editable authoritative Repair
snapshot and Provider-private intake fields. Terminal Requests render read-only
state.

`/dashboard/settings` lets every Provider member edit their own canonical person
profile. Provider business profile and Service Mode forms are rendered for
Owners only; their Server Actions derive Provider/user identity from the
authenticated membership rather than accepting IDs from form data.

## Server Actions

Good candidates:

- create Provider during onboarding;
- update the current user's person profile;
- Owner-only Provider operating profile update;
- Owner-only atomic Service Mode replacement;
- direct Repair creation;
- accept/decline Repair Request;
- change Repair status;
- add Customer Update;
- complete Repair.

Feature 05 uses public `trackRepairAction(state, formData)` as a read adapter.
It accepts no Provider/Repair id, forwards no client authority, and returns only
the Tracking Module's restricted serializable view.

Feature 04 actions are:

- `createRepairAction(state, formData)`;
- `updateRepairDetailsAction(state, formData)`;
- `changeRepairStatusAction(state, formData)`;
- `addCustomerUpdateAction(state, formData)`;
- `completeRepairAction(state, formData)`.

They accept Repair IDs only as untrusted locators. Provider/user identity,
roles, status history actors, ticket numbers, and Tracking Codes are never
accepted as mutation authority.

Every Server Action still authenticates/authorizes and validates input before calling the feature Module.

Feature 03 actions are:

- public `submitRepairRequestAction(providerSlug, state, formData)`;
- protected `acceptRepairRequestAction(state, formData)`;
- protected `declineRepairRequestAction(state, formData)`.

Actions do not accept a Provider identifier. Hidden/route Request IDs are
untrusted locators; the Module and PostgreSQL derive ownership independently.

## Route Handler candidates

Use Route Handlers where HTTP semantics are useful, for example:

- public Tracking lookup if client-side fetch is desired;
- public Repair Request submission if the form architecture benefits from explicit HTTP;
- future native/mobile HTTP surface.

Do not make Server Components call internal Route Handlers when they can call the feature Module directly.

## Security rule

IDs in URLs never authorize access. Provider context comes from the authenticated session/membership, and Provider-owned resources are checked again by Module logic/RLS.
