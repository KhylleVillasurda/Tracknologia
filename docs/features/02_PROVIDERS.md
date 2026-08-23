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

### 3. Provider and person profile settings

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

## Testing expectations

Test:

- atomic Independent provider + owner creation with person profile;
- atomic Shop provider + owner creation with person profile;
- valid Staff invitation creates exactly one `STAFF` membership atomically;
- expired, revoked, or consumed invitations are rejected;
- Staff cannot join a Provider without a valid invitation;
- Staff invitations cannot be created or accepted for `INDEPENDENT` providers;
- public lookup by slug returns only public-safe fields;
- Provider creation rolls back when Service Mode persistence fails;
- Owners can update operating fields but cannot mutate Provider identity fields;
- Staff cannot update Provider configuration or Service Modes;
- Staff can update only their own person profile;
- Service Mode replacement prevents duplicates, partial state, and mixed results from concurrent replacements;
- direct profile writes cannot bypass durable database size bounds;
- anonymous invitation detail lookup excludes private contact fields;
- cross-Provider isolation and RLS enforcement.
