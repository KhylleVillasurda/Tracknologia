-- Complete Feature 05 Tracking with one allow-listed public read operation.
-- Anonymous roles retain no direct access to Repairs or Customer Updates.

CREATE FUNCTION public.lookup_public_repair(
  p_tracking_code TEXT
)
RETURNS TABLE (
  provider_display_name TEXT,
  device_type TEXT,
  brand TEXT,
  model TEXT,
  current_status public.repair_status,
  service_mode public.service_mode,
  last_updated_at TIMESTAMPTZ,
  customer_updates JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_tracking_code TEXT;
BEGIN
  -- Bound hostile direct RPC input before normalization or pattern matching.
  IF p_tracking_code IS NULL OR octet_length(p_tracking_code) > 128 THEN
    RETURN;
  END IF;

  v_tracking_code := upper(btrim(p_tracking_code));
  IF v_tracking_code !~ '^TRK-[A-F0-9]{24}$' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.display_name,
    r.device_type,
    r.brand,
    r.model,
    r.current_status,
    r.service_mode,
    greatest(
      r.updated_at,
      coalesce(recent_updates.latest_update_at, r.updated_at)
    ),
    coalesce(recent_updates.customer_updates, '[]'::JSONB)
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
  WHERE r.tracking_code = v_tracking_code
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_public_repair(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_public_repair(TEXT)
  TO anon, authenticated, service_role;
