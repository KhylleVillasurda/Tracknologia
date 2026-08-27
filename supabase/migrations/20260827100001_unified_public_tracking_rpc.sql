-- Migration: 20260827100001_unified_public_tracking_rpc.sql
-- Description: Provides unified public tracking RPC (lookup_public_repair) supporting both repair tracking codes (TRK-...) and request reference codes (REQ-...).

DROP FUNCTION IF EXISTS public.lookup_public_repair(TEXT);

CREATE FUNCTION public.lookup_public_repair(
  p_tracking_code TEXT
)
RETURNS TABLE (
  provider_display_name TEXT,
  device_type TEXT,
  brand TEXT,
  model TEXT,
  current_status TEXT,
  service_mode public.service_mode,
  last_updated_at TIMESTAMPTZ,
  customer_updates JSONB,
  tracking_type TEXT,
  reference_code TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_normalized_code TEXT;
BEGIN
  -- Bound hostile direct RPC input before normalization or pattern matching.
  IF p_tracking_code IS NULL OR octet_length(p_tracking_code) > 128 THEN
    RETURN;
  END IF;

  v_normalized_code := upper(btrim(p_tracking_code));

  -- 1. Direct Repair Tracking Code (TRK-[A-F0-9]{24})
  IF v_normalized_code ~ '^TRK-[A-F0-9]{24}$' THEN
    RETURN QUERY
    SELECT
      p.display_name,
      r.device_type,
      r.brand,
      r.model,
      r.current_status::TEXT,
      r.service_mode,
      greatest(
        r.updated_at,
        coalesce(recent_updates.latest_update_at, r.updated_at)
      ),
      coalesce(recent_updates.customer_updates, '[]'::JSONB),
      'REPAIR'::TEXT,
      v_normalized_code
    FROM public.repairs r
    JOIN public.providers p ON p.id = r.provider_id
    LEFT JOIN LATERAL (
      SELECT
        max(recent.created_at) AS latest_update_at,
        jsonb_agg(
          jsonb_build_object(
            'message', recent.message,
            'created_at', recent.created_at
          )
          ORDER BY recent.created_at DESC, recent.id DESC
        ) AS customer_updates
      FROM (
        SELECT ru.id, ru.message, ru.created_at
        FROM public.repair_updates ru
        WHERE ru.repair_id = r.id
        ORDER BY ru.created_at DESC, ru.id DESC
        LIMIT 25
      ) recent
    ) recent_updates ON true
    WHERE r.tracking_code = v_normalized_code
    LIMIT 1;
    RETURN;
  END IF;

  -- 2. Request Reference Code (REQ-[A-F0-9]{16})
  IF v_normalized_code ~ '^REQ-[A-F0-9]{16}$' THEN
    RETURN QUERY
    SELECT
      p.display_name,
      coalesce(r.device_type, rq.device_type),
      coalesce(r.brand, rq.brand),
      coalesce(r.model, rq.model),
      CASE
        WHEN r.id IS NOT NULL THEN r.current_status::TEXT
        ELSE rq.status::TEXT
      END,
      coalesce(r.service_mode, rq.preferred_service_mode),
      CASE
        WHEN r.id IS NOT NULL THEN
          greatest(
            r.updated_at,
            coalesce(recent_updates.latest_update_at, r.updated_at)
          )
        ELSE
          coalesce(rq.declined_at, rq.accepted_at, rq.submitted_at)
      END,
      coalesce(recent_updates.customer_updates, '[]'::JSONB),
      'REQUEST'::TEXT,
      v_normalized_code
    FROM public.repair_requests rq
    JOIN public.providers p ON p.id = rq.provider_id
    LEFT JOIN public.repairs r ON r.repair_request_id = rq.id
    LEFT JOIN LATERAL (
      SELECT
        max(recent.created_at) AS latest_update_at,
        jsonb_agg(
          jsonb_build_object(
            'message', recent.message,
            'created_at', recent.created_at
          )
          ORDER BY recent.created_at DESC, recent.id DESC
        ) AS customer_updates
      FROM (
        SELECT ru.id, ru.message, ru.created_at
        FROM public.repair_updates ru
        WHERE ru.repair_id = r.id
        ORDER BY ru.created_at DESC, ru.id DESC
        LIMIT 25
      ) recent
    ) recent_updates ON (r.id IS NOT NULL)
    WHERE rq.reference_code = v_normalized_code
    LIMIT 1;
    RETURN;
  END IF;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_public_repair(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_public_repair(TEXT)
  TO service_role;
