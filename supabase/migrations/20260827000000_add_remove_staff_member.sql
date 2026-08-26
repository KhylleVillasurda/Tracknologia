-- OWNER-controlled Staff offboarding (Plan 03).
-- Narrow SECURITY DEFINER operation that removes exactly one STAFF membership
-- from the caller's own Provider. OWNER rows and cross-Provider targets are
-- never removable through this function; the application layer repeats the
-- same authorization before invoking it.

CREATE OR REPLACE FUNCTION public.remove_staff_member(
  p_membership_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_caller_provider_id UUID;
  v_target RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_membership_id IS NULL THEN
    RAISE EXCEPTION 'Membership id is required';
  END IF;

  SELECT pm.provider_id INTO v_caller_provider_id
  FROM public.provider_memberships pm
  WHERE pm.user_id = v_user_id AND pm.role = 'OWNER';

  IF v_caller_provider_id IS NULL THEN
    RAISE EXCEPTION 'Only Provider Owners can remove staff members';
  END IF;

  SELECT pm.provider_id, pm.role
  INTO v_target
  FROM public.provider_memberships pm
  WHERE pm.id = p_membership_id
  FOR UPDATE;

  -- Neutral bounded result: not found, cross-Provider, or not a STAFF row.
  IF v_target IS NULL
    OR v_target.provider_id <> v_caller_provider_id
    OR v_target.role <> 'STAFF' THEN
    RETURN FALSE;
  END IF;

  DELETE FROM public.provider_memberships pm
  WHERE pm.id = p_membership_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_staff_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_staff_member(UUID) TO authenticated;
