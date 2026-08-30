-- Migration: 20260830094400_add_staff_invitation_error_detail.sql
-- Description: Expose a stable detail for recipient-ineligible invitations.
--
-- This is a forward-only replacement of create_staff_invitation. The function
-- body and permissions remain unchanged except for the machine-readable
-- recipient-ineligibility detail on its existing exception.

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
      RAISE EXCEPTION 'User already has an active provider membership'
        USING DETAIL = 'RECIPIENT_INELIGIBLE';
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
