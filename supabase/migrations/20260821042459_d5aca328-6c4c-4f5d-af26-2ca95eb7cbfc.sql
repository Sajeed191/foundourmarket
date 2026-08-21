CREATE OR REPLACE FUNCTION public.get_public_profiles(_ids uuid[])
RETURNS TABLE(id uuid, full_name text, avatar_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.full_name, p.avatar_url
  FROM public.profiles p
  WHERE public.is_staff(auth.uid())
    AND p.id = ANY(COALESCE(_ids, ARRAY[]::uuid[]))
  LIMIT 100
$function$;

REVOKE EXECUTE ON FUNCTION public.get_public_profiles(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_public_profiles(uuid[]) TO authenticated;