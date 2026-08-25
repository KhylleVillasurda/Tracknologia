-- Release hardening (Plan 02): public operations may be invoked only by the
-- application server. The publishable/anon key no longer reaches Postgres.
--
-- Before this migration, anyone holding the public publishable key could call
-- these SECURITY DEFINER functions directly, bypassing the application layer
-- and any rate control it applies:
--   public.lookup_public_repair(TEXT)
--   public.record_successful_tracking_view(TEXT)
--   public.submit_repair_request(...)
--
-- The application server now invokes these functions with the service-role
-- credential through src/lib/supabase/service.ts.

REVOKE EXECUTE ON FUNCTION public.lookup_public_repair(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_public_repair(TEXT)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.record_successful_tracking_view(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_successful_tracking_view(TEXT)
  TO service_role;

-- Signature matches the function created by 20260823120000_create_repair_requests.sql.
REVOKE EXECUTE ON FUNCTION public.submit_repair_request(
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
) FROM PUBLIC, anon, authenticated;

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
) TO service_role;
