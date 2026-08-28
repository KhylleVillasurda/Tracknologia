-- Migration: 20260828000000_enforce_invitation_retry_policy.sql
-- Description: Enforce one active pending Staff invitation per Shop + normalized email.
-- Policy (Plan 06, issue #43): reuse the existing active pending invitation.
-- Retries/double-clicks must never create a second simultaneously valid invitation.

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