-- Complete Feature 06 Analytics with minimal successful Tracking-view telemetry.
-- Other pilot metrics remain derived from authoritative domain tables.

CREATE TABLE public.tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_id UUID NOT NULL REFERENCES public.repairs(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX tracking_events_repair_viewed_idx
  ON public.tracking_events(repair_id, viewed_at DESC);

ALTER TABLE public.tracking_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tracking_events FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON public.tracking_events TO service_role;

CREATE FUNCTION public.record_successful_tracking_view(
  p_tracking_code TEXT
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tracking_code TEXT;
  v_repair_id UUID;
BEGIN
  -- Bound hostile direct RPC input before normalization or pattern matching.
  IF p_tracking_code IS NULL OR octet_length(p_tracking_code) > 128 THEN
    RETURN;
  END IF;

  v_tracking_code := upper(btrim(p_tracking_code));
  IF v_tracking_code !~ '^TRK-[A-F0-9]{24}$' THEN
    RETURN;
  END IF;

  SELECT r.id
  INTO v_repair_id
  FROM public.repairs r
  WHERE r.tracking_code = v_tracking_code
  LIMIT 1;

  IF v_repair_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.tracking_events (repair_id)
  VALUES (v_repair_id);
END;
$$;

REVOKE ALL ON FUNCTION public.record_successful_tracking_view(TEXT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_successful_tracking_view(TEXT)
  TO anon, authenticated, service_role;
