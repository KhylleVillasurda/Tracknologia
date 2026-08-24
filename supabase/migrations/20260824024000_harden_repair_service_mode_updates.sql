-- Preserve Repair Service Mode snapshots while validating intentional changes
-- against the Provider's current configuration at commit time.

CREATE FUNCTION public.enforce_repair_service_mode_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.service_mode IS NOT DISTINCT FROM OLD.service_mode THEN
    RETURN NEW;
  END IF;

  -- Serialize with set_provider_service_modes, which holds FOR UPDATE on the
  -- same Provider row while replacing the configured set.
  PERFORM 1
  FROM public.providers p
  WHERE p.id = NEW.provider_id
  FOR SHARE;

  IF NEW.service_mode IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.provider_service_modes psm
       WHERE psm.provider_id = NEW.provider_id
         AND psm.mode = NEW.service_mode
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'UNSUPPORTED_SERVICE_MODE';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_repair_service_mode_update
  BEFORE UPDATE OF service_mode ON public.repairs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_repair_service_mode_update();

REVOKE ALL ON FUNCTION public.enforce_repair_service_mode_update()
  FROM PUBLIC;
