-- Durable, atomic abuse control for the accountless public-operation adapters.
-- The application derives an opaque HMAC actor key and invokes the narrow
-- function with its server-only service-role credential.

CREATE TABLE public.public_operation_rate_limits (
  operation TEXT NOT NULL,
  actor_key TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL,
  PRIMARY KEY (operation, actor_key),
  CONSTRAINT public_operation_rate_limits_operation_check CHECK (
    operation IN ('tracking_lookup', 'repair_request_submit')
  ),
  CONSTRAINT public_operation_rate_limits_actor_key_check CHECK (
    actor_key ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT public_operation_rate_limits_window_check CHECK (
    expires_at > window_started_at
  ),
  CONSTRAINT public_operation_rate_limits_count_check CHECK (request_count > 0)
);

COMMENT ON TABLE public.public_operation_rate_limits IS
  'Short-lived public-operation counters keyed only by opaque server-generated HMAC digests.';

ALTER TABLE public.public_operation_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE INDEX public_operation_rate_limits_expires_at_idx
  ON public.public_operation_rate_limits (expires_at);

REVOKE ALL ON TABLE public.public_operation_rate_limits
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.public_operation_rate_limits TO service_role;

CREATE FUNCTION public.check_public_operation_rate_limit(
  p_operation TEXT,
  p_actor_key TEXT,
  p_window_seconds INTEGER,
  p_max_requests INTEGER,
  p_cleanup_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  allowed BOOLEAN,
  retry_after_seconds INTEGER,
  request_count INTEGER,
  window_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_count INTEGER;
  v_expires_at TIMESTAMPTZ;
BEGIN
  IF p_operation NOT IN ('tracking_lookup', 'repair_request_submit') THEN
    RAISE EXCEPTION 'INVALID_RATE_LIMIT_OPERATION';
  END IF;
  IF p_actor_key IS NULL OR p_actor_key !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_RATE_LIMIT_ACTOR_KEY';
  END IF;
  IF p_window_seconds NOT BETWEEN 1 AND 86400 THEN
    RAISE EXCEPTION 'INVALID_RATE_LIMIT_WINDOW';
  END IF;
  IF p_max_requests NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'INVALID_RATE_LIMIT_THRESHOLD';
  END IF;
  IF p_cleanup_limit NOT BETWEEN 0 AND 1000 THEN
    RAISE EXCEPTION 'INVALID_RATE_LIMIT_CLEANUP_LIMIT';
  END IF;

  IF p_cleanup_limit > 0 THEN
    DELETE FROM public.public_operation_rate_limits AS stale
    WHERE stale.ctid IN (
      SELECT candidate.ctid
      FROM public.public_operation_rate_limits AS candidate
      WHERE candidate.expires_at <= v_now
      ORDER BY candidate.expires_at
      LIMIT p_cleanup_limit
    );
  END IF;

  INSERT INTO public.public_operation_rate_limits AS limits (
    operation,
    actor_key,
    window_started_at,
    expires_at,
    request_count
  ) VALUES (
    p_operation,
    p_actor_key,
    v_now,
    v_now + make_interval(secs => p_window_seconds),
    1
  )
  ON CONFLICT (operation, actor_key) DO UPDATE SET
    window_started_at = CASE
      WHEN limits.expires_at <= v_now THEN v_now
      ELSE limits.window_started_at
    END,
    expires_at = CASE
      WHEN limits.expires_at <= v_now
        THEN v_now + make_interval(secs => p_window_seconds)
      ELSE limits.expires_at
    END,
    request_count = CASE
      WHEN limits.expires_at <= v_now THEN 1
      ELSE limits.request_count + 1
    END
  RETURNING limits.request_count, limits.expires_at
  INTO v_count, v_expires_at;

  RETURN QUERY SELECT
    v_count <= p_max_requests,
    CASE
      WHEN v_count <= p_max_requests THEN 0
      ELSE GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_expires_at - v_now)))::INTEGER)
    END,
    v_count,
    v_expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.check_public_operation_rate_limit(
  TEXT, TEXT, INTEGER, INTEGER, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_public_operation_rate_limit(
  TEXT, TEXT, INTEGER, INTEGER, INTEGER
) TO service_role;
