-- Migration: 20260820000002_add_provider_access_rls.sql
-- Description: Least-privilege RLS policies, public Provider projection, atomic RPCs, and narrow invitation lifecycle operations
-- Reference: Tracknologia Lead Decisions LD-01, LD-03; Auth Re-review AUTH-R19 through AUTH-R30

-- 1. Enable Row Level Security
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_invitations ENABLE ROW LEVEL SECURITY;

-- 2. Schema Permissions & Public Projections (Least Privilege)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Public Provider Projection View (Explicitly projects public-safe fields only)
CREATE OR REPLACE VIEW public.public_provider_profiles AS
SELECT
  id,
  provider_type,
  display_name,
  slug,
  description,
  profile_image_url,
  public_address,
  service_area,
  supported_devices,
  accepting_requests,
  created_at
FROM public.providers
WHERE accepting_requests = true;

GRANT SELECT ON public.public_provider_profiles TO anon, authenticated;

-- Trusted integration fixtures and administrative maintenance use the service role.
GRANT ALL PRIVILEGES ON TABLE
  public.providers,
  public.provider_user_profiles,
  public.provider_memberships,
  public.provider_invitations
TO service_role;
GRANT SELECT ON public.public_provider_profiles TO service_role;

-- Table Grants:
-- NOTE: anon has NO direct SELECT on raw public.providers table.
-- NOTE: authenticated users have SELECT on provider_invitations, but NO direct INSERT/UPDATE/DELETE.
GRANT SELECT, UPDATE ON public.providers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.provider_user_profiles TO authenticated;
GRANT SELECT ON public.provider_memberships TO authenticated;
GRANT SELECT ON public.provider_invitations TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.provider_invitations FROM authenticated, anon;

-- 3. Non-recursive SECURITY DEFINER helper to return provider IDs of current authenticated user
DROP FUNCTION IF EXISTS public.get_auth_user_provider_ids();
CREATE OR REPLACE FUNCTION public.get_auth_user_provider_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT provider_id FROM public.provider_memberships WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_auth_user_provider_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_user_provider_ids() TO authenticated;

-- 4. RLS Policies on provider_memberships
DROP POLICY IF EXISTS "Members can view provider memberships" ON public.provider_memberships;

CREATE POLICY "Members can view provider memberships"
  ON public.provider_memberships
  FOR SELECT
  TO authenticated
  USING (
    provider_id IN (SELECT public.get_auth_user_provider_ids())
  );

-- Direct INSERT/UPDATE/DELETE on provider_memberships is STRICTLY PROHIBITED for normal users.
-- All membership creations occur via atomic SECURITY DEFINER functions.

-- 5. RLS Policies on providers
DROP POLICY IF EXISTS "Provider members can view their provider" ON public.providers;
DROP POLICY IF EXISTS "Owners can update provider" ON public.providers;

CREATE POLICY "Provider members can view their provider"
  ON public.providers
  FOR SELECT
  TO authenticated
  USING (
    id IN (SELECT public.get_auth_user_provider_ids())
  );

CREATE POLICY "Owners can update provider"
  ON public.providers
  FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT provider_id FROM public.provider_memberships
      WHERE user_id = auth.uid() AND role = 'OWNER'
    )
  );

-- 6. RLS Policies on provider_user_profiles
DROP POLICY IF EXISTS "Users can view user profiles of team members or self" ON public.provider_user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.provider_user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.provider_user_profiles;

CREATE POLICY "Users can view user profiles of team members or self"
  ON public.provider_user_profiles
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR user_id IN (
      SELECT pm.user_id 
      FROM public.provider_memberships pm 
      WHERE pm.provider_id IN (SELECT public.get_auth_user_provider_ids())
    )
  );

CREATE POLICY "Users can insert own profile"
  ON public.provider_user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
  );

CREATE POLICY "Users can update own profile"
  ON public.provider_user_profiles
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
  );

-- 7. RLS Policies on provider_invitations (SELECT only; direct INSERT/UPDATE/DELETE denied)
DROP POLICY IF EXISTS "Owners can view invitations" ON public.provider_invitations;
DROP POLICY IF EXISTS "Owners can create invitations" ON public.provider_invitations;
DROP POLICY IF EXISTS "Owners can revoke invitations" ON public.provider_invitations;

CREATE POLICY "Owners can view invitations"
  ON public.provider_invitations
  FOR SELECT
  TO authenticated
  USING (
    provider_id IN (
      SELECT provider_id FROM public.provider_memberships
      WHERE user_id = auth.uid() AND role = 'OWNER'
    )
  );

-- 8. Narrow RPC: Create Staff Invitation (SHOP-only, Owner-verified, token hash digest only)
DROP FUNCTION IF EXISTS public.create_staff_invitation(TEXT, TEXT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.create_staff_invitation(TEXT, TEXT);
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
  expires_at TIMESTAMPTZ
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
  v_invitation_id UUID;
  v_created_at TIMESTAMPTZ;
  v_expires_at TIMESTAMPTZ;
  v_clean_email TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_clean_email := lower(trim(p_email));
  IF v_clean_email IS NULL OR v_clean_email = '' THEN
    RAISE EXCEPTION 'Valid email address is required';
  END IF;

  IF p_token_hash IS NULL OR p_token_hash !~* '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid token hash format';
  END IF;

  -- Invariant: Verify caller is OWNER of a SHOP provider
  SELECT pm.provider_id, p.provider_type
  INTO v_provider_id, v_provider_type
  FROM public.provider_memberships pm
  JOIN public.providers p ON p.id = pm.provider_id
  WHERE pm.user_id = v_user_id AND pm.role = 'OWNER'
  LIMIT 1;

  IF v_provider_id IS NULL THEN
    RAISE EXCEPTION 'Only Provider Owners can invite staff members';
  END IF;

  IF v_provider_type <> 'SHOP' THEN
    RAISE EXCEPTION 'Staff invitations are only valid for Repair Shops';
  END IF;

  v_created_at := now();
  v_expires_at := v_created_at + interval '7 days';

  INSERT INTO public.provider_invitations AS pi (
    provider_id,
    email,
    role,
    token_hash,
    invited_by_user_id,
    created_at,
    expires_at
  ) VALUES (
    v_provider_id,
    v_clean_email,
    'STAFF'::public.membership_role,
    p_token_hash,
    v_user_id,
    v_created_at,
    v_expires_at
  )
  RETURNING
    pi.id
  INTO v_invitation_id;

  RETURN QUERY SELECT v_invitation_id, v_provider_id, v_clean_email, 'STAFF'::public.membership_role, v_created_at, v_expires_at;
END;
$$;

-- 9. Narrow RPC: Revoke Staff Invitation (Pending -> Revoked transition only)
DROP FUNCTION IF EXISTS public.revoke_staff_invitation(UUID);
CREATE OR REPLACE FUNCTION public.revoke_staff_invitation(
  p_invitation_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_provider_id UUID;
  v_rows_updated INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT pm.provider_id INTO v_provider_id
  FROM public.provider_memberships pm
  WHERE pm.user_id = v_user_id AND pm.role = 'OWNER';

  IF v_provider_id IS NULL THEN
    RAISE EXCEPTION 'Only Provider Owners can revoke staff invitations';
  END IF;

  UPDATE public.provider_invitations
  SET revoked_at = now()
  WHERE id = p_invitation_id
    AND provider_id = v_provider_id
    AND accepted_at IS NULL
    AND revoked_at IS NULL;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'Invitation not found, already accepted, or already revoked';
  END IF;

  RETURN TRUE;
END;
$$;

-- 10. Atomic RPC: Create Provider with Initial OWNER (Independent or Shop Owner Onboarding)
DROP FUNCTION IF EXISTS public.create_provider_with_owner(TEXT, public.provider_type);
DROP FUNCTION IF EXISTS public.create_provider_with_owner(TEXT, public.provider_type, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]);

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
  v_base_slug TEXT;
  v_slug TEXT;
  v_owner_name TEXT;
  v_attempt INT := 0;
  v_retry_limit CONSTANT INT := 25;
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

  -- Phase 3: Transactionally serialize all membership-establishing operations per User
  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text));

  -- Invariant: User cannot already have ANY active provider membership
  IF EXISTS (SELECT 1 FROM public.provider_memberships pm WHERE pm.user_id = v_user_id) THEN
    RAISE EXCEPTION 'User already has an active provider membership';
  END IF;

  -- Generate slug candidates and let the UNIQUE constraint arbitrate collisions.
  v_base_slug := lower(regexp_replace(trim(p_display_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  IF v_base_slug = '' THEN
    v_base_slug := 'provider';
  END IF;

  -- 1. Atomically insert Provider with full initial profile
  LOOP
    v_attempt := v_attempt + 1;
    v_slug := CASE
      WHEN v_attempt = 1 THEN v_base_slug
      ELSE v_base_slug || '-' || (v_attempt - 1)
    END;

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

      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
        IF v_constraint_name = 'providers_slug_key' AND v_attempt < v_retry_limit THEN
          CONTINUE;
        END IF;
        RAISE;
    END;
  END LOOP;

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

  RETURN QUERY SELECT v_provider_id, v_membership_id, v_slug;
END;
$$;

-- 11. Atomic RPC: Accept Staff Invitation (Shop Staff Onboarding)
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

  -- Phase 3: Transactionally serialize all membership-establishing operations per User
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

  RETURN QUERY SELECT v_provider_id, v_membership_id, v_invite_role;
END;
$$;

-- 12. Safe RPC: Resolve Invitation & Shop Details (For Staff Onboarding UI)
DROP FUNCTION IF EXISTS public.get_invitation_details(TEXT);
CREATE OR REPLACE FUNCTION public.get_invitation_details(
  p_token_hash TEXT
)
RETURNS TABLE (
  invitation_id UUID,
  email TEXT,
  role public.membership_role,
  provider_id UUID,
  shop_name TEXT,
  public_address TEXT,
  service_area TEXT,
  contact_email TEXT,
  contact_phone TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  SELECT 
    pi.id AS invitation_id,
    pi.email::TEXT,
    pi.role,
    p.id AS provider_id,
    p.display_name::TEXT AS shop_name,
    p.public_address::TEXT,
    p.service_area::TEXT,
    p.contact_email::TEXT,
    p.contact_phone::TEXT
  FROM public.provider_invitations pi
  JOIN public.providers p ON p.id = pi.provider_id
  WHERE pi.token_hash = p_token_hash
    AND pi.accepted_at IS NULL
    AND pi.revoked_at IS NULL
    AND pi.expires_at > now()
  LIMIT 1;
END;
$$;

-- 13. Explicit Grants and Revokes
REVOKE ALL ON FUNCTION public.create_provider_with_owner(TEXT, public.provider_type, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_provider_with_owner(TEXT, public.provider_type, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]) TO authenticated;

REVOKE ALL ON FUNCTION public.create_staff_invitation(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_staff_invitation(TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.revoke_staff_invitation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_staff_invitation(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.accept_staff_invitation(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_staff_invitation(TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.get_invitation_details(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invitation_details(TEXT) TO authenticated, anon;
