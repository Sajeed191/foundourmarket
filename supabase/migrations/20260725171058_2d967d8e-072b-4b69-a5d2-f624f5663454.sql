-- Lock down internal marketplace state tables (rotation_state, site_rules)
DROP POLICY IF EXISTS "Anyone can view rotation state" ON public.rotation_state;
DROP POLICY IF EXISTS "site_rules public read" ON public.site_rules;

REVOKE ALL ON public.rotation_state FROM anon;
REVOKE ALL ON public.site_rules FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rotation_state TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_rules TO authenticated;
GRANT ALL ON public.rotation_state TO service_role;
GRANT ALL ON public.site_rules TO service_role;

CREATE POLICY "Staff can read rotation state"
ON public.rotation_state
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'manager')
);

CREATE POLICY "Staff can read site rules"
ON public.site_rules
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'manager')
  OR public.has_role(auth.uid(), 'editor')
);