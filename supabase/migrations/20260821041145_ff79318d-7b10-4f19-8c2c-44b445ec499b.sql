-- 1) Role management: remove the anonymous execute surface entirely.
REVOKE EXECUTE ON FUNCTION public.manage_user_role(uuid, public.app_role, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.manage_user_role(uuid, public.app_role, boolean, text) TO authenticated, service_role;

-- 2) Public profile lookup: keep it public (reviewer display names) but cap the
--    batch size so it cannot be used to bulk-enumerate customer identities.
CREATE OR REPLACE FUNCTION public.get_public_profiles(_ids uuid[])
RETURNS TABLE(id uuid, full_name text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.avatar_url
  FROM public.profiles p
  WHERE p.id = ANY(COALESCE(_ids, ARRAY[]::uuid[]))
  LIMIT 100
$$;