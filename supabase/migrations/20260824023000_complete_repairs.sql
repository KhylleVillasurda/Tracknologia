-- Complete Feature 04 Repairs: direct intake, lifecycle transitions,
-- allow-listed detail edits, and append-only Customer Updates.

CREATE TABLE public.repair_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_id UUID NOT NULL REFERENCES public.repairs(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_by_user_id UUID NOT NULL DEFAULT auth.uid()
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT check_repair_updates_message
    CHECK (char_length(btrim(message)) BETWEEN 1 AND 2000)
);

CREATE INDEX repair_updates_repair_created_idx
  ON public.repair_updates(repair_id, created_at DESC, id DESC);

CREATE INDEX repairs_provider_updated_idx
  ON public.repairs(provider_id, updated_at DESC, id DESC);

ALTER TABLE public.repair_updates ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.repair_updates FROM anon, authenticated;
GRANT SELECT ON public.repair_updates TO authenticated;
GRANT INSERT (repair_id, message) ON public.repair_updates TO authenticated;
GRANT ALL PRIVILEGES ON public.repair_updates TO service_role;

CREATE POLICY "Provider members can view repair updates"
  ON public.repair_updates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.repairs r
      WHERE r.id = repair_updates.repair_id
        AND r.provider_id IN (SELECT public.get_auth_user_provider_ids())
    )
  );

CREATE POLICY "Provider members can create repair updates"
  ON public.repair_updates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.repairs r
      WHERE r.id = repair_updates.repair_id
        AND r.provider_id IN (SELECT public.get_auth_user_provider_ids())
    )
  );

-- Provider Users may correct the authoritative snapshot, but Repair identity,
-- ownership, lifecycle, source, audit, and public credentials remain protected.
GRANT UPDATE (
  customer_name,
  customer_phone,
  customer_email,
  device_type,
  brand,
  model,
  serial_number,
  color_variant,
  device_specs,
  physical_condition,
  accessories_received,
  reported_problem,
  initial_observation,
  diagnosis,
  internal_notes,
  service_mode,
  service_mode_details
) ON public.repairs TO authenticated;

CREATE POLICY "Provider members can update repair details"
  ON public.repairs
  FOR UPDATE
  TO authenticated
  USING (
    provider_id IN (SELECT public.get_auth_user_provider_ids())
  )
  WITH CHECK (
    provider_id IN (SELECT public.get_auth_user_provider_ids())
  );

-- Direct intake requires one atomic Repair + initial Status Event write.
CREATE FUNCTION public.create_provider_repair(
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_device_type TEXT,
  p_reported_problem TEXT,
  p_customer_email TEXT DEFAULT NULL,
  p_brand TEXT DEFAULT NULL,
  p_model TEXT DEFAULT NULL,
  p_serial_number TEXT DEFAULT NULL,
  p_color_variant TEXT DEFAULT NULL,
  p_device_specs TEXT DEFAULT NULL,
  p_physical_condition TEXT DEFAULT NULL,
  p_accessories_received TEXT DEFAULT NULL,
  p_initial_observation TEXT DEFAULT NULL,
  p_diagnosis TEXT DEFAULT NULL,
  p_internal_notes TEXT DEFAULT NULL,
  p_service_mode public.service_mode DEFAULT NULL,
  p_service_mode_details TEXT DEFAULT NULL
)
RETURNS TABLE (
  repair_id UUID,
  ticket_number TEXT,
  tracking_code TEXT,
  current_status public.repair_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_user_id UUID;
  v_provider_id UUID;
  v_repair_id UUID;
  v_ticket_number TEXT;
  v_tracking_code TEXT;
  v_attempt INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;

  SELECT pm.provider_id
  INTO v_provider_id
  FROM public.provider_memberships pm
  WHERE pm.user_id = v_user_id
  LIMIT 1;

  IF v_provider_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PROVIDER_CONTEXT_REQUIRED';
  END IF;

  -- Serialize against Owner Service Mode replacement so the selected mode is
  -- still configured when the direct Repair commits.
  PERFORM 1
  FROM public.providers p
  WHERE p.id = v_provider_id
  FOR SHARE;

  IF p_service_mode IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.provider_service_modes psm
       WHERE psm.provider_id = v_provider_id
         AND psm.mode = p_service_mode
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'UNSUPPORTED_SERVICE_MODE';
  END IF;

  IF p_service_mode IS NULL
     AND NULLIF(trim(p_service_mode_details), '') IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'INVALID_REPAIR_INPUT';
  END IF;

  FOR v_attempt IN 1..5 LOOP
    v_ticket_number := 'TN-' || to_char(now(), 'YYYY') || '-' || upper(
      substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 10)
    );
    v_tracking_code := 'TRK-' || upper(
      substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 24)
    );

    BEGIN
      INSERT INTO public.repairs (
        provider_id,
        repair_request_id,
        origin,
        ticket_number,
        tracking_code,
        customer_name,
        customer_phone,
        customer_email,
        device_type,
        brand,
        model,
        serial_number,
        color_variant,
        device_specs,
        physical_condition,
        accessories_received,
        reported_problem,
        initial_observation,
        diagnosis,
        internal_notes,
        service_mode,
        service_mode_details,
        current_status,
        created_by_user_id
      ) VALUES (
        v_provider_id,
        NULL,
        'PROVIDER_CREATED',
        v_ticket_number,
        v_tracking_code,
        trim(p_customer_name),
        trim(p_customer_phone),
        NULLIF(lower(trim(p_customer_email)), ''),
        trim(p_device_type),
        NULLIF(trim(p_brand), ''),
        NULLIF(trim(p_model), ''),
        NULLIF(trim(p_serial_number), ''),
        NULLIF(trim(p_color_variant), ''),
        NULLIF(trim(p_device_specs), ''),
        NULLIF(trim(p_physical_condition), ''),
        NULLIF(trim(p_accessories_received), ''),
        trim(p_reported_problem),
        NULLIF(trim(p_initial_observation), ''),
        NULLIF(trim(p_diagnosis), ''),
        NULLIF(trim(p_internal_notes), ''),
        p_service_mode,
        NULLIF(trim(p_service_mode_details), ''),
        'IN_PROGRESS',
        v_user_id
      )
      RETURNING repairs.id INTO v_repair_id;

      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_repair_id := NULL;
    END;
  END LOOP;

  IF v_repair_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'IDENTIFIER_GENERATION_FAILED';
  END IF;

  INSERT INTO public.repair_status_events (
    repair_id,
    from_status,
    to_status,
    changed_by_user_id
  ) VALUES (
    v_repair_id,
    NULL,
    'IN_PROGRESS',
    v_user_id
  );

  RETURN QUERY
  SELECT
    v_repair_id,
    v_ticket_number,
    v_tracking_code,
    'IN_PROGRESS'::public.repair_status;
END;
$$;

REVOKE ALL ON FUNCTION public.create_provider_repair(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  public.service_mode,
  TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_provider_repair(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  public.service_mode,
  TEXT
) TO authenticated, service_role;

-- Lifecycle changes serialize on the Repair row so current state,
-- completion time, and append-only history always commit together.
CREATE FUNCTION public.change_repair_status(
  p_repair_id UUID,
  p_next_status public.repair_status
)
RETURNS TABLE (
  repair_id UUID,
  current_status public.repair_status,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_user_id UUID;
  v_provider_id UUID;
  v_current_status public.repair_status;
  v_completed_at TIMESTAMPTZ;
  v_updated_at TIMESTAMPTZ;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;

  SELECT pm.provider_id
  INTO v_provider_id
  FROM public.provider_memberships pm
  WHERE pm.user_id = v_user_id
  LIMIT 1;

  SELECT r.current_status
  INTO v_current_status
  FROM public.repairs r
  WHERE r.id = p_repair_id
    AND r.provider_id = v_provider_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'REPAIR_NOT_FOUND';
  END IF;

  IF p_next_status IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'INVALID_STATUS_TRANSITION';
  END IF;

  IF NOT (
    (v_current_status = 'IN_PROGRESS'
      AND p_next_status IN ('WAITING_FOR_PARTS', 'AWAITING_APPROVAL', 'READY'))
    OR (v_current_status = 'WAITING_FOR_PARTS'
      AND p_next_status = 'IN_PROGRESS')
    OR (v_current_status = 'AWAITING_APPROVAL'
      AND p_next_status = 'IN_PROGRESS')
    OR (v_current_status = 'READY'
      AND p_next_status = 'COMPLETED')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'INVALID_STATUS_TRANSITION';
  END IF;

  UPDATE public.repairs r
  SET
    current_status = p_next_status,
    completed_at = CASE
      WHEN p_next_status = 'COMPLETED' THEN now()
      ELSE NULL
    END
  WHERE r.id = p_repair_id
  RETURNING r.completed_at, r.updated_at
  INTO v_completed_at, v_updated_at;

  INSERT INTO public.repair_status_events (
    repair_id,
    from_status,
    to_status,
    changed_by_user_id
  ) VALUES (
    p_repair_id,
    v_current_status,
    p_next_status,
    v_user_id
  );

  RETURN QUERY
  SELECT p_repair_id, p_next_status, v_completed_at, v_updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.change_repair_status(
  UUID,
  public.repair_status
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.change_repair_status(
  UUID,
  public.repair_status
) TO authenticated, service_role;
