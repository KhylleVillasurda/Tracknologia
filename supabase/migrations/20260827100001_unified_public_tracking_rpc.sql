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
  -- Strict input validation
  IF p_tracking_code IS NULL OR char_length(p_tracking_code) > 128 THEN
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
      r.updated_at,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'message', cu.message,
              'created_at', cu.created_at
            )
            ORDER BY cu.created_at DESC
          )
          FROM (
            SELECT cu_inner.message, cu_inner.created_at
            FROM public.customer_updates cu_inner
            WHERE cu_inner.repair_id = r.id
            ORDER BY cu_inner.created_at DESC
            LIMIT 25
          ) cu
        ),
        '[]'::JSONB
      ),
      'REPAIR'::TEXT,
      v_normalized_code
    FROM public.repairs r
    JOIN public.providers p ON p.id = r.provider_id
    WHERE r.tracking_code = v_normalized_code;
    RETURN;
  END IF;

  -- 2. Request Reference Code (REQ-[A-F0-9]{16})
  IF v_normalized_code ~ '^REQ-[A-F0-9]{16}$' THEN
    RETURN QUERY
    SELECT
      p.display_name,
      COALESCE(r.device_type, rq.device_type),
      COALESCE(r.brand, rq.brand),
      COALESCE(r.model, rq.model),
      CASE
        WHEN r.id IS NOT NULL THEN r.current_status::TEXT
        ELSE rq.status::TEXT
      END,
      COALESCE(r.service_mode, rq.preferred_service_mode),
      COALESCE(r.updated_at, rq.updated_at),
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'message', cu.message,
              'created_at', cu.created_at
            )
            ORDER BY cu.created_at DESC
          )
          FROM (
            SELECT cu_inner.message, cu_inner.created_at
            FROM public.customer_updates cu_inner
            WHERE cu_inner.repair_id = r.id
            ORDER BY cu_inner.created_at DESC
            LIMIT 25
          ) cu
        ),
        '[]'::JSONB
      ),
      'REQUEST'::TEXT,
      v_normalized_code
    FROM public.repair_requests rq
    JOIN public.providers p ON p.id = rq.provider_id
    LEFT JOIN public.repairs r ON r.repair_request_id = rq.id
    WHERE rq.reference_code = v_normalized_code;
    RETURN;
  END IF;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_public_repair(TEXT) TO anon, authenticated, service_role;
