-- Migration: 20260823000001_add_provider_operating_configuration.sql
-- Description: Provider Service Modes, profile update hardening, and public configuration projection

-- 1. Provider Service Modes are a repeating Provider-owned configuration.
CREATE TYPE public.service_mode AS ENUM (
  'DROP_OFF',
  'MEETUP',
  'HOME_SERVICE',
  'OTHER'
);

CREATE TABLE public.provider_service_modes (
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  mode public.service_mode NOT NULL,
  details TEXT,
  PRIMARY KEY (provider_id, mode),
  CONSTRAINT check_provider_service_mode_details_length
    CHECK (details IS NULL OR char_length(details) <= 240)
);

ALTER TABLE public.provider_service_modes ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.provider_service_modes TO authenticated;
GRANT ALL PRIVILEGES ON public.provider_service_modes TO service_role;

CREATE POLICY "Provider members can view service modes"
  ON public.provider_service_modes
  FOR SELECT
  TO authenticated
  USING (
    provider_id IN (SELECT public.get_auth_user_provider_ids())
  );

-- Normal clients cannot mutate Service Modes directly. Replacement is performed
-- by the narrow atomic RPC below so a failed replacement cannot leave partial state.
REVOKE INSERT, UPDATE, DELETE
  ON public.provider_service_modes
  FROM authenticated, anon;

-- 2. Keep timestamps trustworthy and server-maintained.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_providers_updated_at
  BEFORE UPDATE ON public.providers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_provider_user_profiles_updated_at
  BEFORE UPDATE ON public.provider_user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 3. Replace broad table-level writes with the exact editable profile columns.
-- Provider type, slug, ids, ownership, and timestamps are not profile settings.
REVOKE UPDATE ON public.providers FROM authenticated;
GRANT UPDATE (
  display_name,
  description,
  profile_image_url,
  contact_phone,
  contact_email,
  public_address,
  service_area,
  supported_devices,
  accepting_requests
) ON public.providers TO authenticated;

REVOKE INSERT, UPDATE ON public.provider_user_profiles FROM authenticated;
GRANT UPDATE (
  display_name,
  contact_phone,
  avatar_url
) ON public.provider_user_profiles TO authenticated;

-- 4. Atomically replace the current Owner's Provider Service Modes.
CREATE OR REPLACE FUNCTION public.set_provider_service_modes(
  p_service_modes JSONB
)
RETURNS TABLE (
  mode public.service_mode,
  details TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_user_id UUID;
  v_provider_id UUID;
  v_item JSONB;
  v_mode public.service_mode;
  v_details TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_service_modes IS NULL OR jsonb_typeof(p_service_modes) <> 'array' THEN
    RAISE EXCEPTION 'Service Modes must be an array';
  END IF;

  IF jsonb_array_length(p_service_modes) > 4 THEN
    RAISE EXCEPTION 'At most four Service Modes are supported';
  END IF;

  SELECT pm.provider_id
  INTO v_provider_id
  FROM public.provider_memberships pm
  WHERE pm.user_id = v_user_id
    AND pm.role = 'OWNER'
  LIMIT 1;

  IF v_provider_id IS NULL THEN
    RAISE EXCEPTION 'Only Provider Owners can configure Service Modes';
  END IF;

  DELETE FROM public.provider_service_modes psm
  WHERE psm.provider_id = v_provider_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_service_modes)
  LOOP
    IF jsonb_typeof(v_item) <> 'object'
       OR COALESCE(v_item ->> 'mode', '') NOT IN (
         'DROP_OFF', 'MEETUP', 'HOME_SERVICE', 'OTHER'
       ) THEN
      RAISE EXCEPTION 'Invalid Service Mode';
    END IF;

    v_mode := (v_item ->> 'mode')::public.service_mode;
    v_details := NULLIF(trim(v_item ->> 'details'), '');

    IF v_details IS NOT NULL AND char_length(v_details) > 240 THEN
      RAISE EXCEPTION 'Service Mode details must be 240 characters or fewer';
    END IF;

    INSERT INTO public.provider_service_modes (provider_id, mode, details)
    VALUES (v_provider_id, v_mode, v_details);
  END LOOP;

  RETURN QUERY
  SELECT psm.mode, psm.details
  FROM public.provider_service_modes psm
  WHERE psm.provider_id = v_provider_id
  ORDER BY psm.mode::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.set_provider_service_modes(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_provider_service_modes(JSONB) TO authenticated;

-- 5. Preserve the accepted onboarding RPC and compose it with Service Mode
-- replacement inside one transaction.
CREATE OR REPLACE FUNCTION public.create_provider_with_owner_and_modes(
  p_display_name TEXT,
  p_provider_type public.provider_type,
  p_owner_display_name TEXT DEFAULT NULL,
  p_owner_contact_phone TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_contact_email TEXT DEFAULT NULL,
  p_contact_phone TEXT DEFAULT NULL,
  p_public_address TEXT DEFAULT NULL,
  p_service_area TEXT DEFAULT NULL,
  p_supported_devices TEXT[] DEFAULT '{}',
  p_service_modes JSONB DEFAULT '[]'::JSONB,
  p_accepting_requests BOOLEAN DEFAULT true
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
  v_provider_id UUID;
  v_membership_id UUID;
  v_slug TEXT;
BEGIN
  SELECT created.provider_id, created.membership_id, created.slug
  INTO v_provider_id, v_membership_id, v_slug
  FROM public.create_provider_with_owner(
    p_display_name,
    p_provider_type,
    p_owner_display_name,
    p_owner_contact_phone,
    p_contact_email,
    p_contact_phone,
    p_public_address,
    p_service_area,
    p_supported_devices
  ) AS created;

  UPDATE public.providers
  SET
    description = NULLIF(trim(p_description), ''),
    accepting_requests = COALESCE(p_accepting_requests, true)
  WHERE id = v_provider_id;

  PERFORM 1 FROM public.set_provider_service_modes(p_service_modes);

  RETURN QUERY SELECT v_provider_id, v_membership_id, v_slug;
END;
$$;

REVOKE ALL ON FUNCTION public.create_provider_with_owner_and_modes(
  TEXT,
  public.provider_type,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT[],
  JSONB,
  BOOLEAN
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_provider_with_owner_and_modes(
  TEXT,
  public.provider_type,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT[],
  JSONB,
  BOOLEAN
) TO authenticated;

-- 6. Public Provider reads remain a strict allow-list and now include the safe
-- operating modes needed by provider-specific Repair Request pages.
DROP VIEW public.public_provider_profiles;

CREATE VIEW public.public_provider_profiles AS
SELECT
  p.id,
  p.provider_type,
  p.display_name,
  p.slug,
  p.description,
  p.profile_image_url,
  p.public_address,
  p.service_area,
  p.supported_devices,
  p.accepting_requests,
  p.created_at,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'mode', psm.mode,
          'details', psm.details
        )
        ORDER BY psm.mode::TEXT
      )
      FROM public.provider_service_modes psm
      WHERE psm.provider_id = p.id
    ),
    '[]'::JSONB
  ) AS service_modes
FROM public.providers p
WHERE p.accepting_requests = true;

GRANT SELECT ON public.public_provider_profiles TO anon, authenticated, service_role;

-- 7. Invitation possession may reveal the intended Shop identity, but not its
-- private business contact fields.
DROP FUNCTION public.get_invitation_details(TEXT);

CREATE FUNCTION public.get_invitation_details(
  p_token_hash TEXT
)
RETURNS TABLE (
  invitation_id UUID,
  email TEXT,
  role public.membership_role,
  provider_id UUID,
  shop_name TEXT,
  public_address TEXT,
  service_area TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~* '^[a-f0-9]{64}$' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    pi.id,
    pi.email::TEXT,
    pi.role,
    p.id,
    p.display_name::TEXT,
    p.public_address::TEXT,
    p.service_area::TEXT
  FROM public.provider_invitations pi
  JOIN public.providers p ON p.id = pi.provider_id
  WHERE pi.token_hash = p_token_hash
    AND pi.accepted_at IS NULL
    AND pi.revoked_at IS NULL
    AND pi.expires_at > now()
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_invitation_details(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invitation_details(TEXT) TO authenticated, anon;
