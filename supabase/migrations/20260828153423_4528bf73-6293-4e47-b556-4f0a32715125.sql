CREATE OR REPLACE FUNCTION public.can_access_support_thread(_topic text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _raw text;
  _tid uuid;
BEGIN
  -- No anonymous access, ever.
  IF _uid IS NULL THEN
    RETURN false;
  END IF;

  IF _topic IS NULL THEN
    RETURN false;
  END IF;

  -- Strict, fully-anchored topic format: 'support-thread:<uuid>' and nothing
  -- else. No leading/trailing characters, no whitespace, no extra segments.
  _raw := substring(
    _topic from
    '^support-thread:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$'
  );

  IF _raw IS NULL THEN
    RETURN false;
  END IF;

  BEGIN
    _tid := _raw::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  IF _tid IS NULL THEN
    RETURN false;
  END IF;

  IF has_any_role(_uid, ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'support'::app_role]) THEN
    RETURN EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = _tid);
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id = _tid
      AND (t.user_id = _uid OR t.assigned_to = _uid)
  );
END;
$function$;