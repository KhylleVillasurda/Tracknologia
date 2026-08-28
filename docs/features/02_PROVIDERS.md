# Feature — Providers

**Code location:** `src/features/providers/`

## Description

The Providers feature represents the **repair business identity, staff invitations, person profiles, and operating configuration** in Tracknologia.

A Provider is either:

- `SHOP`; or
- `INDEPENDENT`.

Both are first-class Provider types that use the same core Repair system.

## Primary goal

Give Tracknologia a provider-centric business identity that works equally well for a traditional Repair Shop and an Independent Repairer without forcing either into the other's operating model, while governing secure Staff onboarding.

## Feature goals

- Create and maintain Provider business/profile information.
- Atomic onboarding for Independent Repairers and Shop Owners.
- Secure, Owner-authorized invitation flow for Shop Staff (`provider_invitations`) using one-way SHA-256 token hashing.
- Preserve `SHOP` and `INDEPENDENT` as equal supported Provider types.
- Support one-person shops as naturally as multi-user shops.
- Separate canonical person profiles (`provider_user_profiles`) from authorization memberships (`provider_memberships`).
- Allow Independent Repairers to operate without publishing a private home address.
- Store Service Area and supported device categories without premature location/device normalization.
- Configure multiple supported Service Modes.
- Provide a public Provider profile projection (`public_provider_profiles`) by slug or ID for provider-specific customer Request pages.
- Control whether the Provider is currently accepting customer Repair Requests.

## Non-goals

The MVP Providers feature does not include:

- global provider marketplace/discovery;
- Google Maps/Places integration;
- nearest-provider routing;
- branches;
- staff workload scheduling;
- reviews/ratings;
- promoted listings;
- a permanent supported-device catalog hierarchy.

## Main actors

- **Provider Owner** — creates Provider, manages configuration, and invites Shop Staff.
- **Shop Staff** — joins an existing Shop via an Owner-authorized invitation.
- **Customer** — may view limited public Provider identity/configuration on a Provider-specific Request page.

## Owned data

### `providers`

Business profile information:

- Provider type (`SHOP` | `INDEPENDENT`);
- display name;
- slug;
- description/profile image;
- contact information;
- optional public address;
- Service Area;
- supported device categories;
- `accepting_requests`;
- timestamps.

### `provider_user_profiles`

Canonical person-level display profile for authenticated users:

- `user_id` (PK, FK $\to$ `auth.users.id`);
- `display_name`;
- `contact_phone`;
- `avatar_url`;
- timestamps.

### `provider_memberships`

Associates an authenticated user with a Provider as `OWNER` or `STAFF` (authorization link only).

### `provider_invitations`

Owner-authorized, expiring, single-use invitations for Shop Staff onboarding:

- `id`
- `provider_id`
- `email`
- `role` (`STAFF`)
- `token_hash` (SHA-256 digest of raw token)
- `invited_by_user_id`
- `created_at`
- `expires_at`
- `accepted_at`
- `accepted_by_user_id`
- `revoked_at`

Invitation policy (issue #43):

- **Active pending** invitation = `accepted_at IS NULL` **and** `revoked_at IS
NULL` and `expires_at > now()`.
- **Reuse**: an active pending invitation per `(provider_id, email)` is
  reused, not duplicated. Retries and double-clicks return the existing
  invitation (`reused = true`) with its original credential; no new link or
  email is emitted.
- **Recipient eligibility**: an invitation cannot be created (or reused) for
  an email whose account already holds an active `provider_memberships`
  membership — such a link could never be accepted. Re-inviting a former Staff
  member becomes valid again after the Owner offboards them
  (`remove_staff_member`), which removes the membership.
- **Settlement on acceptance**: accepting an invitation supersedes any other
  active pending invitation for the same Provider + email, so a Shop never
  retains a second unusable link once the recipient has joined.

### `provider_service_modes`

Repeating Provider-owned operating configuration:

- `provider_id`;
- `mode` (`DROP_OFF` | `MEETUP` | `HOME_SERVICE` | `OTHER`);
- optional `details` (up to 240 characters);
- primary key `(provider_id, mode)` prevents duplicate modes.

### `public_provider_profiles` (View)

Restricted public projection containing only public-safe fields.

## Public Interface (`src/features/providers/index.ts`)

```ts
// Commands
createProvider(input: CreateProviderInput): Promise<{ providerId: string; membershipId: string; slug: string }>
updateProviderProfile(input: UpdateProviderProfileInput): Promise<Provider>
updateCurrentProviderUserProfile(input: UpdateProviderUserProfileInput): Promise<ProviderUserProfile>
setServiceModes(modes: ProviderServiceMode[]): Promise<ProviderServiceMode[]>
createStaffInvitation(input: { email: string }): Promise<CreateStaffInvitationResult>
acceptStaffInvitation(input: AcceptStaffInvitationInput): Promise<{ providerId: string; membershipId: string; role: "STAFF" }>
revokeStaffInvitation(invitationId: string): Promise<void>
removeStaffMember(input: { membershipId: string }): Promise<RemoveStaffMemberResult>

// Queries
getProvider(providerId: string): Promise<Provider | null>
getPublicProvider(slugOrId: string): Promise<PublicProviderProfile | null>
getInvitationForOnboarding(rawToken: string): Promise<InvitationShopDetails | null>
listTeamMembers(providerId: string): Promise<TeamMember[]>
listPendingStaffInvitations(providerId: string): Promise<ProviderInvitation[]>
getProviderUserProfile(userId: string): Promise<ProviderUserProfile | null>
getProviderServiceModes(providerId: string): Promise<ProviderServiceMode[]>
```

## Core workflows

### 1. Independent Repairer / Shop Owner Onboarding (LD-01)

```text
Authenticated User
       ↓
createProvider({ displayName, providerType, ownerDisplayName, serviceModes, ... })
       ↓ (atomic database transaction)
INSERT providers + INSERT provider_user_profiles + INSERT provider_memberships (role: OWNER) + INSERT provider_service_modes
```

### 2. Shop Staff Onboarding (LD-01)

```text
Shop Owner creates Staff invitation (generates raw token, persists SHA-256 digest in token_hash)
       ↓
Staff receives raw token via invite link
       ↓
Staff creates Supabase identity / logs in
       ↓
getInvitationForOnboarding(rawToken) displays shop details
       ↓
acceptStaffInvitation({ token, displayName, contactPhone })
       ↓ (atomic database transaction)
Validate token_hash, not expired, not revoked, not accepted, verify SHOP provider, verify no active membership
       ↓
INSERT provider_user_profiles + INSERT provider_memberships (role: STAFF) + UPDATE provider_invitations
```

### 3. Staff Offboarding

```text
Shop Owner
       ↓
removeStaffMember({ membershipId })
       ↓ (narrow database transaction)
Lock target membership, verify same Provider + role STAFF, delete exactly that row
       ↓
Removed Staff loses ProviderContext and RLS-backed access on their next request
```

Not-found, cross-Provider, and OWNER targets collapse into `removed: false`.

### 4. Provider and person profile settings

```text
Authenticated Provider User
       ↓
updateCurrentProviderUserProfile(...) — edits only the caller's person profile

Authenticated Provider Owner
       ↓
updateProviderProfile(...) — edits operating fields, not Provider identity
setServiceModes(...) — atomically and serially replaces the Provider's supported modes
```

Provider IDs come from trusted membership context. Server Actions never accept a
browser-supplied `providerId`, role, or user ID for these mutations.

## Important invariants

1. Every Provider has exactly one type: `SHOP` or `INDEPENDENT`.
2. Provider type does not change the core Repair lifecycle.
3. A Shop may have one owner-user only.
4. Independent Repairers are not required to publish a residential address.
5. Staff invitations are valid only for `SHOP` providers.
6. A user cannot have multiple active provider memberships in MVP.
7. Public Provider information is strictly projected via `public_provider_profiles`.
8. Raw invitation tokens are never stored in the database; only SHA-256 digests are persisted.
9. Provider slugs are unique.
10. Only an `OWNER` may update Provider operating configuration or Service Modes.
11. Provider `id`, `provider_type`, `slug`, ownership, and timestamps are not editable profile fields.
12. Service Mode replacement is atomic, serialized per Provider, and direct authenticated table writes are denied.
13. Anonymous invitation lookup reveals the intended email and public Shop identity, but never private Provider contact fields.
14. Database constraints enforce durable Provider/person-profile size bounds even when an Owner bypasses the application forms.
15. Removing a configured Service Mode does not invalidate historical Repairs;
    replacement serializes with intentional Repair mode changes through the
    Provider-row lock.
16. Only an `OWNER` can remove a same-Provider `STAFF` membership; OWNER
    targets and cross-Provider targets are never removable through Staff
    offboarding.
17. At most one active pending Staff invitation exists per `(provider_id,
 normalized email)`: `create_staff_invitation` reuses an existing active
    pending invitation (no duplicate credential, no regenerated token) rather
    than minting a second simultaneously valid link. A recipient who already
    holds an active membership is ineligible to be invited; the eligibility
    check serializes with acceptance under a shared recipient-email advisory
    lock (followed by the per-User lock), so a create/accept race never leaves
    an unusable active invitation even if the recipient's Auth User is created
    mid-create. Accepting an invitation supersedes any remaining active
    pending sibling for the same Shop + email. Legacy duplicates from before
    this policy are reconciled to the earliest currently-valid link per Shop +
    email (expired rows stay untouched) by the migration (and by the
    service-role-only `reconcile_staff_invitation_duplicates()` RPC);
    superseded links stop resolving without ever exposing a raw credential.

## Testing expectations

Test:

- atomic Independent provider + owner creation with person profile;
- atomic Shop provider + owner creation with person profile;
- valid Staff invitation creates exactly one `STAFF` membership atomically;
- expired, revoked, or consumed invitations are rejected;
- Staff cannot join a Provider without a valid invitation;
- retries and concurrent duplicate invites for the same Shop + email produce
  at most one active pending invitation (reuse policy);
- an active member's email cannot be re-invited, but is eligible again after
  offboarding;
- accepting an invitation supersedes sibling active pending invitations;
- legacy duplicate active invitations reconcile to a single valid link;
- OWNER removes a same-Provider STAFF and the removed member loses access;
- STAFF cannot remove members; OWNER rows cannot be removed through offboarding;
- cross-Provider removal attempts are neutral and non-destructive;
- Staff invitations cannot be created or accepted for `INDEPENDENT` providers;
- public lookup by slug returns only public-safe fields;
- Provider creation rolls back when Service Mode persistence fails;
- Owners can update operating fields but cannot mutate Provider identity fields;
- Staff cannot update Provider configuration or Service Modes;
- Staff can update only their own person profile;
- Service Mode replacement prevents duplicates, partial state, and mixed results from concurrent replacements;
- Service Mode replacement raced with a Repair mode edit produces one valid
  serialized outcome without erasing or invalidating historical Repair data;
- direct profile writes cannot bypass durable database size bounds;
- anonymous invitation detail lookup excludes private contact fields;
- cross-Provider isolation and RLS enforcement.
