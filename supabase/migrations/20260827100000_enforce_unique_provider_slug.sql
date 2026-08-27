-- Migration: 20260827100000_enforce_unique_provider_slug.sql
-- Description: Enforces unique provider slug generation in create_provider_with_owner by immediately rejecting duplicate names instead of adding auto-incrementing numeric suffixes.

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

  RETURN QUERY SELECT v_provider_id, v_membership_id, v_slug;
END;
$$;
