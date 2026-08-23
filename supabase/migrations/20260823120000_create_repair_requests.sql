-- Migration: 20260823120000_create_repair_requests.sql
-- Description: Public Repair Request intake, Provider review, and atomic Request-origin Repair creation

CREATE TYPE public.repair_request_status AS ENUM (
  'SUBMITTED',
  'ACCEPTED',
  'DECLINED'
);

CREATE TYPE public.repair_origin AS ENUM (
  'CUSTOMER_REQUEST',
  'PROVIDER_CREATED'
);

CREATE TYPE public.repair_status AS ENUM (
  'IN_PROGRESS',
  'WAITING_FOR_PARTS',
  'AWAITING_APPROVAL',
  'READY',
  'COMPLETED'
);

CREATE TABLE public.repair_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  reference_code TEXT NOT NULL UNIQUE,

  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,

  device_type TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  serial_number TEXT,
  color_variant TEXT,
  device_specs TEXT,

  reported_problem TEXT NOT NULL,
  problem_started_at TEXT,
  preceding_event TEXT,
  troubleshooting_attempted TEXT,
  additional_information TEXT,

  preferred_service_mode public.service_mode,
  service_mode_details TEXT,

  status public.repair_request_status NOT NULL DEFAULT 'SUBMITTED',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  accepted_by_user_id UUID REFERENCES auth.users(id),
  declined_by_user_id UUID REFERENCES auth.users(id),

  CONSTRAINT repair_requests_provider_id_id_key UNIQUE (provider_id, id),
  CONSTRAINT check_repair_requests_reference_code
    CHECK (reference_code ~ '^REQ-[A-F0-9]{16}$'),
  CONSTRAINT check_repair_requests_customer_name
    CHECK (
      char_length(trim(customer_name)) >= 2
      AND char_length(customer_name) <= 120
    ),
  CONSTRAINT check_repair_requests_customer_phone
    CHECK (
      char_length(trim(customer_phone)) >= 3
      AND char_length(customer_phone) <= 40
    ),
  CONSTRAINT check_repair_requests_customer_email
    CHECK (customer_email IS NULL OR char_length(customer_email) <= 254),
  CONSTRAINT check_repair_requests_device_type
    CHECK (
      char_length(trim(device_type)) >= 1
      AND char_length(device_type) <= 80
    ),
  CONSTRAINT check_repair_requests_brand
    CHECK (brand IS NULL OR char_length(brand) <= 80),
  CONSTRAINT check_repair_requests_model
    CHECK (model IS NULL OR char_length(model) <= 80),
  CONSTRAINT check_repair_requests_serial_number
    CHECK (serial_number IS NULL OR char_length(serial_number) <= 120),
  CONSTRAINT check_repair_requests_color_variant
    CHECK (color_variant IS NULL OR char_length(color_variant) <= 80),
  CONSTRAINT check_repair_requests_device_specs
    CHECK (device_specs IS NULL OR char_length(device_specs) <= 1000),
  CONSTRAINT check_repair_requests_reported_problem
    CHECK (
      char_length(trim(reported_problem)) >= 1
      AND char_length(reported_problem) <= 2000
    ),
  CONSTRAINT check_repair_requests_problem_started_at
    CHECK (problem_started_at IS NULL OR char_length(problem_started_at) <= 200),
  CONSTRAINT check_repair_requests_preceding_event
    CHECK (preceding_event IS NULL OR char_length(preceding_event) <= 1000),
  CONSTRAINT check_repair_requests_troubleshooting
    CHECK (
      troubleshooting_attempted IS NULL
      OR char_length(troubleshooting_attempted) <= 1000
    ),
  CONSTRAINT check_repair_requests_additional_information
    CHECK (
      additional_information IS NULL
      OR char_length(additional_information) <= 2000
    ),
  CONSTRAINT check_repair_requests_service_mode_details
    CHECK (
      service_mode_details IS NULL
      OR char_length(service_mode_details) <= 240
    ),
  CONSTRAINT check_repair_requests_service_mode_pair
    CHECK (
      preferred_service_mode IS NOT NULL
      OR service_mode_details IS NULL
    ),
  CONSTRAINT check_repair_requests_lifecycle
    CHECK (
      (
        status = 'SUBMITTED'
        AND accepted_at IS NULL
        AND accepted_by_user_id IS NULL
        AND declined_at IS NULL
        AND declined_by_user_id IS NULL
      )
      OR (
        status = 'ACCEPTED'
        AND accepted_at IS NOT NULL
        AND accepted_by_user_id IS NOT NULL
        AND declined_at IS NULL
        AND declined_by_user_id IS NULL
      )
      OR (
        status = 'DECLINED'
        AND declined_at IS NOT NULL
        AND declined_by_user_id IS NOT NULL
        AND accepted_at IS NULL
        AND accepted_by_user_id IS NULL
      )
    )
);

CREATE INDEX repair_requests_provider_status_submitted_idx
  ON public.repair_requests(provider_id, status, submitted_at DESC);

CREATE TABLE public.repairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  repair_request_id UUID UNIQUE,
  origin public.repair_origin NOT NULL,

  ticket_number TEXT NOT NULL,
  tracking_code TEXT NOT NULL UNIQUE,

  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,

  device_type TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  serial_number TEXT,
  color_variant TEXT,
  device_specs TEXT,
  physical_condition TEXT,
  accessories_received TEXT,

  reported_problem TEXT NOT NULL,
  initial_observation TEXT,
  diagnosis TEXT,
  internal_notes TEXT,

  service_mode public.service_mode,
  service_mode_details TEXT,

  current_status public.repair_status NOT NULL DEFAULT 'IN_PROGRESS',
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,

  CONSTRAINT repairs_provider_ticket_number_key
    UNIQUE (provider_id, ticket_number),
  CONSTRAINT repairs_provider_request_fk
    FOREIGN KEY (provider_id, repair_request_id)
    REFERENCES public.repair_requests(provider_id, id),
  CONSTRAINT check_repairs_request_origin
    CHECK (
      (origin = 'CUSTOMER_REQUEST' AND repair_request_id IS NOT NULL)
      OR (origin = 'PROVIDER_CREATED' AND repair_request_id IS NULL)
    ),
  CONSTRAINT check_repairs_ticket_number
    CHECK (ticket_number ~ '^TN-[0-9]{4}-[A-F0-9]{10}$'),
  CONSTRAINT check_repairs_tracking_code
    CHECK (tracking_code ~ '^TRK-[A-F0-9]{24}$'),
  CONSTRAINT check_repairs_customer_name
    CHECK (
      char_length(trim(customer_name)) >= 2
      AND char_length(customer_name) <= 120
    ),
  CONSTRAINT check_repairs_customer_phone
    CHECK (
      char_length(trim(customer_phone)) >= 3
      AND char_length(customer_phone) <= 40
    ),
  CONSTRAINT check_repairs_customer_email
    CHECK (customer_email IS NULL OR char_length(customer_email) <= 254),
  CONSTRAINT check_repairs_device_type
    CHECK (
      char_length(trim(device_type)) >= 1
      AND char_length(device_type) <= 80
    ),
  CONSTRAINT check_repairs_brand
    CHECK (brand IS NULL OR char_length(brand) <= 80),
  CONSTRAINT check_repairs_model
    CHECK (model IS NULL OR char_length(model) <= 80),
  CONSTRAINT check_repairs_serial_number
    CHECK (serial_number IS NULL OR char_length(serial_number) <= 120),
  CONSTRAINT check_repairs_color_variant
    CHECK (color_variant IS NULL OR char_length(color_variant) <= 80),
  CONSTRAINT check_repairs_device_specs
    CHECK (device_specs IS NULL OR char_length(device_specs) <= 1000),
  CONSTRAINT check_repairs_physical_condition
    CHECK (physical_condition IS NULL OR char_length(physical_condition) <= 2000),
  CONSTRAINT check_repairs_accessories_received
    CHECK (accessories_received IS NULL OR char_length(accessories_received) <= 1000),
  CONSTRAINT check_repairs_reported_problem
    CHECK (
      char_length(trim(reported_problem)) >= 1
      AND char_length(reported_problem) <= 2000
    ),
  CONSTRAINT check_repairs_initial_observation
    CHECK (initial_observation IS NULL OR char_length(initial_observation) <= 2000),
  CONSTRAINT check_repairs_diagnosis
    CHECK (diagnosis IS NULL OR char_length(diagnosis) <= 2000),
  CONSTRAINT check_repairs_internal_notes
    CHECK (internal_notes IS NULL OR char_length(internal_notes) <= 4000),
  CONSTRAINT check_repairs_service_mode_details
    CHECK (service_mode_details IS NULL OR char_length(service_mode_details) <= 240),
  CONSTRAINT check_repairs_service_mode_pair
    CHECK (service_mode IS NOT NULL OR service_mode_details IS NULL),
  CONSTRAINT check_repairs_completion
    CHECK (
      (current_status = 'COMPLETED' AND completed_at IS NOT NULL)
      OR (current_status <> 'COMPLETED' AND completed_at IS NULL)
    )
);

CREATE INDEX repairs_provider_status_updated_idx
  ON public.repairs(provider_id, current_status, updated_at DESC);
CREATE INDEX repairs_provider_created_idx
  ON public.repairs(provider_id, created_at DESC);

CREATE TRIGGER set_repairs_updated_at
  BEFORE UPDATE ON public.repairs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.repair_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_id UUID NOT NULL REFERENCES public.repairs(id) ON DELETE CASCADE,
  from_status public.repair_status,
  to_status public.repair_status NOT NULL,
  changed_by_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT check_repair_status_event_change
    CHECK (
      (from_status IS NULL AND to_status = 'IN_PROGRESS')
      OR (from_status IS NOT NULL AND from_status <> to_status)
    )
);

CREATE INDEX repair_status_events_repair_created_idx
  ON public.repair_status_events(repair_id, created_at);

ALTER TABLE public.repair_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_status_events ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

REVOKE ALL ON public.repair_requests FROM anon, authenticated;
REVOKE ALL ON public.repairs FROM anon, authenticated;
REVOKE ALL ON public.repair_status_events FROM anon, authenticated;

GRANT SELECT ON public.repair_requests TO authenticated;
GRANT SELECT ON public.repairs TO authenticated;
GRANT SELECT ON public.repair_status_events TO authenticated;

GRANT ALL PRIVILEGES ON public.repair_requests TO service_role;
GRANT ALL PRIVILEGES ON public.repairs TO service_role;
GRANT ALL PRIVILEGES ON public.repair_status_events TO service_role;

CREATE POLICY "Provider members can view repair requests"
  ON public.repair_requests
  FOR SELECT
  TO authenticated
  USING (
    provider_id IN (SELECT public.get_auth_user_provider_ids())
  );

CREATE POLICY "Provider members can view repairs"
  ON public.repairs
  FOR SELECT
  TO authenticated
  USING (
    provider_id IN (SELECT public.get_auth_user_provider_ids())
  );

CREATE POLICY "Provider members can view repair status events"
  ON public.repair_status_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.repairs r
      WHERE r.id = repair_status_events.repair_id
        AND r.provider_id IN (SELECT public.get_auth_user_provider_ids())
    )
  );

-- Public callers can submit only through this allow-listed operation. The
-- Provider row lock makes accepting_requests and Service Mode configuration
-- stable for the duration of submission without exposing raw Provider data.
CREATE FUNCTION public.submit_repair_request(
  p_provider_slug TEXT,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_customer_email TEXT DEFAULT NULL,
  p_device_type TEXT DEFAULT NULL,
  p_brand TEXT DEFAULT NULL,
  p_model TEXT DEFAULT NULL,
  p_serial_number TEXT DEFAULT NULL,
  p_color_variant TEXT DEFAULT NULL,
  p_device_specs TEXT DEFAULT NULL,
  p_reported_problem TEXT DEFAULT NULL,
  p_problem_started_at TEXT DEFAULT NULL,
  p_preceding_event TEXT DEFAULT NULL,
  p_troubleshooting_attempted TEXT DEFAULT NULL,
  p_additional_information TEXT DEFAULT NULL,
  p_preferred_service_mode public.service_mode DEFAULT NULL,
  p_service_mode_details TEXT DEFAULT NULL
)
RETURNS TABLE (
  reference_code TEXT,
  submitted_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_provider_id UUID;
  v_reference_code TEXT;
  v_submitted_at TIMESTAMPTZ;
  v_attempt INTEGER;
BEGIN
  SELECT p.id
  INTO v_provider_id
  FROM public.providers p
  WHERE p.slug = trim(p_provider_slug)
    AND p.accepting_requests = true
  FOR SHARE;

  IF v_provider_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PROVIDER_UNAVAILABLE';
  END IF;

  IF p_preferred_service_mode IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.provider_service_modes psm
       WHERE psm.provider_id = v_provider_id
         AND psm.mode = p_preferred_service_mode
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'UNSUPPORTED_SERVICE_MODE';
  END IF;

  IF p_preferred_service_mode IS NULL
     AND NULLIF(trim(p_service_mode_details), '') IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'INVALID_REQUEST_INPUT';
  END IF;

  FOR v_attempt IN 1..5 LOOP
    v_reference_code := 'REQ-' || upper(
      substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 16)
    );

    BEGIN
      INSERT INTO public.repair_requests (
        provider_id,
        reference_code,
        customer_name,
        customer_phone,
        customer_email,
        device_type,
        brand,
        model,
        serial_number,
        color_variant,
        device_specs,
        reported_problem,
        problem_started_at,
        preceding_event,
        troubleshooting_attempted,
        additional_information,
        preferred_service_mode,
        service_mode_details
      ) VALUES (
        v_provider_id,
        v_reference_code,
        trim(p_customer_name),
        trim(p_customer_phone),
        NULLIF(lower(trim(p_customer_email)), ''),
        trim(p_device_type),
        NULLIF(trim(p_brand), ''),
        NULLIF(trim(p_model), ''),
        NULLIF(trim(p_serial_number), ''),
        NULLIF(trim(p_color_variant), ''),
        NULLIF(trim(p_device_specs), ''),
        trim(p_reported_problem),
        NULLIF(trim(p_problem_started_at), ''),
        NULLIF(trim(p_preceding_event), ''),
        NULLIF(trim(p_troubleshooting_attempted), ''),
        NULLIF(trim(p_additional_information), ''),
        p_preferred_service_mode,
        NULLIF(trim(p_service_mode_details), '')
      )
      RETURNING repair_requests.reference_code, repair_requests.submitted_at
      INTO v_reference_code, v_submitted_at;

      RETURN QUERY SELECT v_reference_code, v_submitted_at;
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      -- Retry only the generated public reference collision.
    END;
  END LOOP;

  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = 'IDENTIFIER_GENERATION_FAILED';
END;
$$;

REVOKE ALL ON FUNCTION public.submit_repair_request(
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

GRANT EXECUTE ON FUNCTION public.submit_repair_request(
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
) TO anon, authenticated, service_role;

CREATE FUNCTION public.decline_repair_request(
  p_request_id UUID
)
RETURNS SETOF public.repair_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_user_id UUID;
  v_provider_id UUID;
  v_request_provider_id UUID;
  v_status public.repair_request_status;
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

  SELECT rr.provider_id, rr.status
  INTO v_request_provider_id, v_status
  FROM public.repair_requests rr
  WHERE rr.id = p_request_id
  FOR UPDATE;

  IF v_provider_id IS NULL
     OR v_request_provider_id IS NULL
     OR v_request_provider_id <> v_provider_id THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'REQUEST_NOT_FOUND';
  END IF;

  IF v_status <> 'SUBMITTED' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'REQUEST_ALREADY_PROCESSED';
  END IF;

  UPDATE public.repair_requests rr
  SET
    status = 'DECLINED',
    declined_at = now(),
    declined_by_user_id = v_user_id
  WHERE rr.id = p_request_id;

  RETURN QUERY
  SELECT rr.*
  FROM public.repair_requests rr
  WHERE rr.id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.decline_repair_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_repair_request(UUID)
  TO authenticated, service_role;

-- Acceptance is one durable transaction. Locking the Request serializes accept
-- and decline races; the unique repair_request_id remains defense in depth.
CREATE FUNCTION public.create_repair_from_request(
  p_request_id UUID,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_customer_email TEXT DEFAULT NULL,
  p_device_type TEXT DEFAULT NULL,
  p_brand TEXT DEFAULT NULL,
  p_model TEXT DEFAULT NULL,
  p_serial_number TEXT DEFAULT NULL,
  p_color_variant TEXT DEFAULT NULL,
  p_device_specs TEXT DEFAULT NULL,
  p_physical_condition TEXT DEFAULT NULL,
  p_accessories_received TEXT DEFAULT NULL,
  p_reported_problem TEXT DEFAULT NULL,
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
  v_request_provider_id UUID;
  v_request_status public.repair_request_status;
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

  SELECT rr.provider_id, rr.status
  INTO v_request_provider_id, v_request_status
  FROM public.repair_requests rr
  WHERE rr.id = p_request_id
  FOR UPDATE;

  IF v_provider_id IS NULL
     OR v_request_provider_id IS NULL
     OR v_request_provider_id <> v_provider_id THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'REQUEST_NOT_FOUND';
  END IF;

  IF v_request_status <> 'SUBMITTED' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'REQUEST_ALREADY_PROCESSED';
  END IF;

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
        p_request_id,
        'CUSTOMER_REQUEST',
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
      IF EXISTS (
        SELECT 1
        FROM public.repairs r
        WHERE r.repair_request_id = p_request_id
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'REQUEST_ALREADY_PROCESSED';
      END IF;
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

  UPDATE public.repair_requests rr
  SET
    status = 'ACCEPTED',
    accepted_at = now(),
    accepted_by_user_id = v_user_id
  WHERE rr.id = p_request_id;

  RETURN QUERY
  SELECT
    v_repair_id,
    v_ticket_number,
    v_tracking_code,
    'IN_PROGRESS'::public.repair_status;
END;
$$;

REVOKE ALL ON FUNCTION public.create_repair_from_request(
  UUID,
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

GRANT EXECUTE ON FUNCTION public.create_repair_from_request(
  UUID,
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
