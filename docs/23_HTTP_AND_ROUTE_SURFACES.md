# 23 — Next.js Route and Interaction Surfaces

The MVP does not require a dedicated REST backend. Next.js routes render the web UI; Server Actions may adapt form mutations; Route Handlers are added only where an explicit HTTP interface is useful.

## Public browser routes

### `/track`

Customer enters Tracking Code and receives a `PublicRepairView`.

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

## Server Action candidates

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
