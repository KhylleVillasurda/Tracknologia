-- Migration: 20260828000000_enforce_invitation_retry_policy.sql
-- Description: Enforce one active pending Staff invitation per Shop + normalized email.
-- Policy (Plan 06, issue #43): reuse the existing active pending invitation.
-- Retries/double-clicks must never create a second simultaneously valid invitation.
--
-- This is the forward-only feature migration for the Staff invitation lifecycle.
-- It redefines:
--   - create_staff_invitation                      (recipient-eligibility recheck under a
--                                                   shared recipient-email advisory lock)
--   - accept_staff_invitation                      (acceptance settlement superseding sibling
--                                                   invitations under the same email lock)
--   - create_provider_with_owner                   (Owner onboarding joins the shared
--                                                   recipient-email lock boundary and settles
--                                                   unusable active Staff invitations)
--   - reconcile_staff_invitation_duplicates        (revoke only currently-valid superseded
--                                                   duplicates; expired rows stay untouched)
-- Because the acceptance changes ship in this genuine (pending) forward migration, the
-- shared baseline migration is untouched: a release-like database that has already
-- recorded the shared history receives identical behavior by applying only this migration.

DROP FUNCTION IF EXISTS public.create_staff_invitation(
  TEXT,
  TEXT,
  TIMESTAMPTZ
);

DROP FUNCTION IF EXISTS public.create_staff_invitation(
  TEXT,
  TEXT
);

CREATE OR REPLACE FUNCTION public.create_staff_invitation(
  p_email TEXT,
  p_token_hash TEXT
)
RETURNS TABLE (
  invitation_id UUID,
  provider_id UUID,
  email TEXT,
  role public.membership_role,
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  reused BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_user_id UUID;
  v_provider_id UUID;
  v_provider_type public.provider_type;
  v_clean_email TEXT;
  v_invitee_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_clean_email := lower(trim(p_email));

  IF v_clean_email IS NULL OR v_clean_email = '' THEN
    RAISE EXCEPTION 'Valid email address is required';
  END IF;

  IF p_token_hash IS NULL
     OR p_token_hash !~* '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid token hash format';
  END IF;

  SELECT
    pm.provider_id,
    p.provider_type
  INTO
    v_provider_id,
    v_provider_type
  FROM public.provider_memberships pm
  JOIN public.providers p
    ON p.id = pm.provider_id
  WHERE pm.user_id = v_user_id
    AND pm.role = 'OWNER'
  LIMIT 1;

  IF v_provider_id IS NULL THEN
    RAISE EXCEPTION
      'Only Provider Owners can invite staff members';
  END IF;

  IF v_provider_type <> 'SHOP' THEN
    RAISE EXCEPTION
      'Staff invitations are only valid for Repair Shops';
  END IF;

  -- Locking protocol shared with accept_staff_invitation, keyed by the
  -- normalized recipient email (identical hashtext input on both sides):
  --   create:  recipient-email lock -> per-User lock      -> provider+email lock
  --   accept:  recipient-email lock -> per-User lock      -> (never takes the provider lock)
  -- The order is consistent, so no lock cycle is possible. Holding the
  -- recipient-email lock across creation guarantees that a concurrent accept
  -- cannot establish a membership (and a concurrent create cannot check
  -- eligibility) without observing the other operation's committed outcome --
  -- even when the recipient's Auth User is created while creation is running.
  PERFORM pg_advisory_xact_lock(hashtext('staff-invitation-email:' || v_clean_email));

  -- Recipient eligibility: a person who already holds an active Provider
  -- membership must not receive a new (or reused) invitation link. That
  -- invite would be unusable because accepting it is impossible while any
  -- active membership exists. Re-inviting becomes valid again only after the
  -- membership is removed through Owner offboarding.
  SELECT u.id
  INTO v_invitee_user_id
  FROM auth.users u
  WHERE lower(u.email) = v_clean_email
  LIMIT 1;

  IF v_invitee_user_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(v_invitee_user_id::text));

    IF EXISTS (
      SELECT 1
      FROM public.provider_memberships pm
      WHERE pm.user_id = v_invitee_user_id
    ) THEN
      RAISE EXCEPTION 'User already has an active provider membership';
    END IF;
  END IF;

  -- Serialize competing invitation creations for the same Provider + normalized
  -- email, then recheck active state atomically inside this transaction.
  PERFORM pg_advisory_xact_lock(hashtext(v_provider_id::text || ':' || v_clean_email));

  IF EXISTS (
    SELECT 1
    FROM public.provider_invitations pi
    WHERE pi.provider_id = v_provider_id
      AND pi.email = v_clean_email
      AND pi.accepted_at IS NULL
      AND pi.revoked_at IS NULL
      AND pi.expires_at > now()
  ) THEN
    RETURN QUERY
    SELECT
      pi.id,
      pi.provider_id,
      pi.email,
      pi.role,
      pi.created_at,
      pi.expires_at,
      TRUE
    FROM public.provider_invitations pi
    WHERE pi.provider_id = v_provider_id
      AND pi.email = v_clean_email
      AND pi.accepted_at IS NULL
      AND pi.revoked_at IS NULL
      AND pi.expires_at > now()
    LIMIT 1;
    RETURN;
  END IF;

  RETURN QUERY
  INSERT INTO public.provider_invitations AS pi (
    provider_id,
    email,
    role,
    token_hash,
    invited_by_user_id,
    created_at,
    expires_at
  )
  VALUES (
    v_provider_id,
    v_clean_email,
    'STAFF'::public.membership_role,
    p_token_hash,
    v_user_id,
    now(),
    now() + interval '7 days'
  )
  RETURNING
    pi.id,
    pi.provider_id,
    pi.email,
    pi.role,
    pi.created_at,
    pi.expires_at,
    FALSE;
END;
$$;

REVOKE ALL
ON FUNCTION public.create_staff_invitation(TEXT, TEXT)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.create_staff_invitation(TEXT, TEXT)
TO authenticated;

-- ===========================================================================
-- Acceptance settlement
-- The shared baseline accept_staff_invitation is redefined here (forward-only)
-- so an already-upgraded release-like database receives identical behavior by
-- applying only this pending migration. The redefinition adds the
-- recipient-email advisory lock shared with create_staff_invitation, so a
-- membership can never be established while a create is (re)checking
-- eligibility without observing it. It also supersedes sibling invitations so
-- no unusable active invitation remains for the same Provider + email after
-- the recipient holds an active membership.
-- ===========================================================================
DROP FUNCTION IF EXISTS public.accept_staff_invitation(TEXT);
DROP FUNCTION IF EXISTS public.accept_staff_invitation(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.accept_staff_invitation(
  p_token_hash TEXT,
  p_display_name TEXT,
  p_contact_phone TEXT DEFAULT NULL
)
RETURNS TABLE (
  provider_id UUID,
  membership_id UUID,
  role public.membership_role
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_user_id UUID;
  v_invitation_id UUID;
  v_provider_id UUID;
  v_membership_id UUID;
  v_invite_role public.membership_role;
  v_invite_email TEXT;
  v_provider_type public.provider_type;
  v_staff_name TEXT;
  v_user_email TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_display_name IS NULL OR trim(p_display_name) = '' THEN
    RAISE EXCEPTION 'Staff display name cannot be blank';
  END IF;
  v_staff_name := NULLIF(trim(p_display_name), '');

  -- Light-read the invitation (token_hash is UNIQUE) to learn the recipient
  -- email that must be serialized before eligibility can be decided; an
  -- invalid, expired, or revoked token is rejected before any lock is taken.
  SELECT pi.email
  INTO v_invite_email
  FROM public.provider_invitations pi
  WHERE pi.token_hash = p_token_hash
    AND pi.accepted_at IS NULL
    AND pi.revoked_at IS NULL
    AND pi.expires_at > now()
  LIMIT 1;

  IF v_invite_email IS NULL THEN
    RAISE EXCEPTION 'Invalid, expired, or revoked invitation';
  END IF;

  -- Phase 3: Transactionally serialize all membership-establishing operations.
  -- The recipient-email lock is shared with create_staff_invitation, followed
  -- by the per-User lock. Order is consistent with create (never the provider
  -- lock), so no deadlock cycle exists.
  PERFORM pg_advisory_xact_lock(hashtext('staff-invitation-email:' || lower(trim(v_invite_email))));
  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text));

  -- Invariant: User cannot already have ANY active provider membership
  IF EXISTS (SELECT 1 FROM public.provider_memberships pm WHERE pm.user_id = v_user_id) THEN
    RAISE EXCEPTION 'User already has an active provider membership';
  END IF;

  -- Look up valid, active, non-expired, unconsumed invitation with row lock
  SELECT pi.id, pi.provider_id, pi.role, pi.email, p.provider_type
  INTO v_invitation_id, v_provider_id, v_invite_role, v_invite_email, v_provider_type
  FROM public.provider_invitations pi
  JOIN public.providers p ON p.id = pi.provider_id
  WHERE pi.token_hash = p_token_hash
    AND pi.accepted_at IS NULL
    AND pi.revoked_at IS NULL
    AND pi.expires_at > now()
  FOR UPDATE OF pi;

  IF v_invitation_id IS NULL THEN
    RAISE EXCEPTION 'Invalid, expired, or revoked invitation';
  END IF;

  -- Invariant: Staff invitations are valid ONLY for SHOP providers
  IF v_provider_type <> 'SHOP' THEN
    RAISE EXCEPTION 'Staff invitations are only valid for Repair Shops';
  END IF;

  SELECT u.email INTO v_user_email FROM auth.users u WHERE u.id = v_user_id;

  -- P2: Email binding verification (Ensure authenticated user email matches invitation email if available)
  IF v_user_email IS NOT NULL AND lower(trim(v_user_email)) <> lower(trim(v_invite_email)) THEN
    RAISE EXCEPTION 'Authenticated email does not match invitation recipient';
  END IF;

  -- 1. Atomically upsert person profile in provider_user_profiles
  INSERT INTO public.provider_user_profiles (
    user_id,
    display_name,
    contact_phone
  ) VALUES (
    v_user_id,
    v_staff_name,
    NULLIF(trim(p_contact_phone), '')
  )
  ON CONFLICT (user_id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      contact_phone = COALESCE(EXCLUDED.contact_phone, public.provider_user_profiles.contact_phone),
      updated_at = now();

  -- 2. Atomically insert STAFF membership (authorization link only)
  INSERT INTO public.provider_memberships (
    provider_id,
    user_id,
    role
  ) VALUES (
    v_provider_id,
    v_user_id,
    v_invite_role
  ) RETURNING public.provider_memberships.id INTO v_membership_id;

  -- 3. Mark invitation as accepted atomically
  UPDATE public.provider_invitations
  SET accepted_at = now(),
      accepted_by_user_id = v_user_id
  WHERE id = v_invitation_id;

  -- 4. Settlement: now that the recipient holds an active membership, no other
  -- active pending invitation may remain for the same Provider + normalized
  -- email. Any such sibling invitation would be unusable; supersede it so the
  -- link stops resolving. (The membership was established while holding the
  -- recipient-email advisory lock shared with create_staff_invitation, so a
  -- concurrent create that raced this accept has already committed or will
  -- observe the membership on recheck.)
  UPDATE public.provider_invitations AS sibling
  SET revoked_at = now()
  WHERE sibling.provider_id = v_provider_id
    AND lower(sibling.email) = lower(trim(v_invite_email))
    AND sibling.id <> v_invitation_id
    AND sibling.accepted_at IS NULL
    AND sibling.revoked_at IS NULL;

  RETURN QUERY SELECT v_provider_id, v_membership_id, v_invite_role;
END;
$$;

REVOKE ALL
ON FUNCTION public.accept_staff_invitation(TEXT, TEXT, TEXT)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.accept_staff_invitation(TEXT, TEXT, TEXT)
TO authenticated;

-- ===========================================================================
-- Owner onboarding serialization
-- The shared baseline create_provider_with_owner is redefined here (forward-only)
-- so a release-like database that has already recorded the shared history
-- receives identical behavior by applying only this pending migration. Owner
-- onboarding is the third membership-establishing path (alongside
-- create_staff_invitation and accept_staff_invitation), so it must join the
-- same recipient-email advisory lock boundary: it takes the normalized owner
-- email lock BEFORE the per-User lock (consistent ordering, so no lock cycle
-- exists), then after establishing the OWNER membership it settles any active
-- pending Staff invitations for that recipient email. An invitation a create
-- won the race on would otherwise be unusable, because accepting it is
-- impossible while any active membership exists.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.create_provider_with_owner(
  p_display_name TEXT,
  p_provider_type public.provider_type,
  p_owner_display_name TEXT DEFAULT NULL,
  p_owner_contact_phone TEXT DEFAULT NULL,
  p_contact_email TEXT DEFAULT NULL,
  p_contact_phone TEXT DEFAULT NULL,
  p_public_address TEXT DEFAULT NULL,
  p_service_area TEXT DEFAULT NULL,
  p_supported_devices TEXT[] DEFAULT '{}'
)
RETURNS TABLE (
  provider_id UUID,
  membership_id UUID,
  slug TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_user_id UUID;
  v_provider_id UUID;
  v_membership_id UUID;
  v_slug TEXT;
  v_owner_name TEXT;
  v_user_email TEXT;
  v_constraint_name TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_display_name IS NULL OR trim(p_display_name) = '' THEN
    RAISE EXCEPTION 'Provider display name cannot be blank';
  END IF;

  v_owner_name := NULLIF(trim(p_owner_display_name), '');
  IF v_owner_name IS NULL THEN
    RAISE EXCEPTION 'Owner display name cannot be blank';
  END IF;

  SELECT u.email INTO v_user_email FROM auth.users u WHERE u.id = v_user_id;

  -- Phase 3: Transactionally serialize all membership-establishing operations.
  -- This path joins the recipient-email lock boundary shared with
  -- create_staff_invitation and accept_staff_invitation: normalized owner email
  -- lock first, then the per-User lock (consistent order, no lock cycle). A
  -- concurrent Staff-invitation create for this email therefore cannot hold the
  -- boundary and observe an eligible recipient while onboarding commits a
  -- membership underneath it.
  IF v_user_email IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('staff-invitation-email:' || lower(trim(v_user_email))));
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text));

  -- Invariant: User cannot already have ANY active provider membership
  IF EXISTS (SELECT 1 FROM public.provider_memberships pm WHERE pm.user_id = v_user_id) THEN
    RAISE EXCEPTION 'User already has an active provider membership';
  END IF;

  -- Generate canonical URL slug from display name
  v_slug := lower(regexp_replace(trim(p_display_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  IF v_slug = '' THEN
    v_slug := 'provider';
  END IF;

  -- Invariant: Reject duplicate shop names immediately rather than appending numbering suffixes
  IF EXISTS (SELECT 1 FROM public.providers WHERE slug = v_slug) THEN
    RAISE EXCEPTION 'A provider with this name already exists. Please choose a different name.';
  END IF;

  -- 1. Atomically insert Provider with full initial profile
  BEGIN
    INSERT INTO public.providers (
      display_name,
      provider_type,
      slug,
      contact_email,
      contact_phone,
      public_address,
      service_area,
      supported_devices
    ) VALUES (
      trim(p_display_name),
      p_provider_type,
      v_slug,
      NULLIF(trim(p_contact_email), ''),
      NULLIF(trim(p_contact_phone), ''),
      NULLIF(trim(p_public_address), ''),
      NULLIF(trim(p_service_area), ''),
      COALESCE(p_supported_devices, '{}')
    ) RETURNING public.providers.id INTO v_provider_id;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
      IF v_constraint_name = 'providers_slug_key' THEN
        RAISE EXCEPTION 'A provider with this name already exists. Please choose a different name.';
      END IF;
      RAISE;
  END;

  -- 2. Atomically upsert person profile in provider_user_profiles
  INSERT INTO public.provider_user_profiles (
    user_id,
    display_name,
    contact_phone
  ) VALUES (
    v_user_id,
    v_owner_name,
    NULLIF(trim(p_owner_contact_phone), '')
  )
  ON CONFLICT (user_id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      contact_phone = COALESCE(EXCLUDED.contact_phone, public.provider_user_profiles.contact_phone),
      updated_at = now();

  -- 3. Atomically insert OWNER membership (authorization link only)
  INSERT INTO public.provider_memberships (
    provider_id,
    user_id,
    role
  ) VALUES (
    v_provider_id,
    v_user_id,
    'OWNER'::public.membership_role
  ) RETURNING public.provider_memberships.id INTO v_membership_id;

  -- 4. Settlement: now that this person holds an active membership, no active
  -- pending Staff invitation may remain for this normalized email (across any
  -- Provider). Any invitation granted by a create that won the race would be
  -- unusable -- accepting it is impossible while any active membership exists.
  -- Revoke them so the links stop resolving. (Onboarding ran under the same
  -- recipient-email advisory lock as create_staff_invitation, so a concurrent
  -- create either committed before this settlement or will observe the
  -- membership on its eligibility recheck.)
  IF v_user_email IS NOT NULL THEN
    UPDATE public.provider_invitations AS sibling
    SET revoked_at = now()
    WHERE lower(sibling.email) = lower(trim(v_user_email))
      AND sibling.accepted_at IS NULL
      AND sibling.revoked_at IS NULL
      AND sibling.expires_at > now();
  END IF;

  RETURN QUERY SELECT v_provider_id, v_membership_id, v_slug;
END;
$$;

REVOKE ALL
ON FUNCTION public.create_provider_with_owner(
  TEXT,
  public.provider_type,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT[]
)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.create_provider_with_owner(
  TEXT,
  public.provider_type,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT[]
)
TO authenticated;

-- ===========================================================================
-- Legacy duplicate reconciliation
-- Before this policy, repeated or concurrent invitations could leave multiple
-- simultaneously valid invitations for the same Shop + normalized email. That
-- state is reconciled deterministically here over ONLY currently-valid rows:
-- for every (provider_id, lower(email)) keep the EARLIEST currently-valid
-- un-accepted, un-revoked invitation (expires_at > now()) and supersede
-- (revoke) every other currently-valid duplicate for that pair. Expired rows
-- are left untouched; they never resolve because the active-pending predicate
-- always requires expires_at > now(). Raw credentials are never reconstructed;
-- superseded links simply stop resolving, so the kept (earliest) link remains
-- the valid one.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.reconcile_staff_invitation_duplicates()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_revoked INTEGER;
BEGIN
  UPDATE public.provider_invitations AS pi
  SET revoked_at = now()
  WHERE pi.accepted_at IS NULL
    AND pi.revoked_at IS NULL
    AND pi.expires_at > now()
    AND (pi.provider_id, lower(pi.email), pi.created_at, pi.id) NOT IN (
      SELECT DISTINCT ON (keep.provider_id, lower(keep.email))
        keep.provider_id,
        lower(keep.email),
        keep.created_at,
        keep.id
      FROM public.provider_invitations AS keep
      WHERE keep.accepted_at IS NULL
        AND keep.revoked_at IS NULL
        AND keep.expires_at > now()
      ORDER BY keep.provider_id, lower(keep.email), keep.created_at, keep.id
    );

  GET DIAGNOSTICS v_revoked = ROW_COUNT;
  RETURN v_revoked;
END;
$$;

REVOKE ALL
ON FUNCTION public.reconcile_staff_invitation_duplicates()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.reconcile_staff_invitation_duplicates()
TO service_role;

-- Apply reconciliation to any pre-existing duplicates at migration time.
SELECT public.reconcile_staff_invitation_duplicates();