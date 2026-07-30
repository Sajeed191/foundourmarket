CREATE OR REPLACE FUNCTION public.is_admin_or_super(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin'::app_role, 'super_admin'::app_role)
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_or_super(uuid) TO authenticated, anon, service_role;

DROP POLICY IF EXISTS "admins email logs select" ON public.email_logs;
CREATE POLICY "admins email logs select" ON public.email_logs AS PERMISSIVE FOR SELECT TO public
  USING (public.is_admin_or_super(auth.uid()));

DROP POLICY IF EXISTS "admins email logs update" ON public.email_logs;
CREATE POLICY "admins email logs update" ON public.email_logs AS PERMISSIVE FOR UPDATE TO public
  USING (public.is_admin_or_super(auth.uid()));

DROP POLICY IF EXISTS "admins prefs select" ON public.email_preferences;
CREATE POLICY "admins prefs select" ON public.email_preferences AS PERMISSIVE FOR SELECT TO public
  USING (public.is_admin_or_super(auth.uid()));

DROP POLICY IF EXISTS "assignments read own or admin" ON public.experiment_assignments;
CREATE POLICY "assignments read own or admin" ON public.experiment_assignments AS PERMISSIVE FOR SELECT TO public
  USING ((public.is_admin_or_super(auth.uid()) OR ((user_id IS NOT NULL) AND (auth.uid() = user_id))));

DROP POLICY IF EXISTS "Admins insert notifications" ON public.notifications;
CREATE POLICY "Admins insert notifications" ON public.notifications AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (public.is_admin_or_super(auth.uid()));

DROP POLICY IF EXISTS "Admins view all notifications" ON public.notifications;
CREATE POLICY "Admins view all notifications" ON public.notifications AS PERMISSIVE FOR SELECT TO public
  USING (public.is_admin_or_super(auth.uid()));

DROP POLICY IF EXISTS "admins view all order items" ON public.order_items;
CREATE POLICY "admins view all order items" ON public.order_items AS PERMISSIVE FOR SELECT TO public
  USING (public.is_admin_or_super(auth.uid()));

DROP POLICY IF EXISTS "admins update all orders" ON public.orders;
CREATE POLICY "admins update all orders" ON public.orders AS PERMISSIVE FOR UPDATE TO public
  USING (public.is_admin_or_super(auth.uid()));

DROP POLICY IF EXISTS "admins view all orders" ON public.orders;
CREATE POLICY "admins view all orders" ON public.orders AS PERMISSIVE FOR SELECT TO public
  USING (public.is_admin_or_super(auth.uid()));

DROP POLICY IF EXISTS "admins view all payments" ON public.payments;
CREATE POLICY "admins view all payments" ON public.payments AS PERMISSIVE FOR SELECT TO public
  USING (public.is_admin_or_super(auth.uid()));

DROP POLICY IF EXISTS "graph edges admin write" ON public.product_graph_edges;
CREATE POLICY "graph edges admin write" ON public.product_graph_edges AS PERMISSIVE FOR ALL TO public
  USING (public.is_admin_or_super(auth.uid()))
  WITH CHECK (public.is_admin_or_super(auth.uid()));

DROP POLICY IF EXISTS "product scores admin write" ON public.product_scores;
CREATE POLICY "product scores admin write" ON public.product_scores AS PERMISSIVE FOR ALL TO public
  USING (public.is_admin_or_super(auth.uid()))
  WITH CHECK (public.is_admin_or_super(auth.uid()));

DROP POLICY IF EXISTS "admins delete variant images" ON public.product_variant_images;
CREATE POLICY "admins delete variant images" ON public.product_variant_images AS PERMISSIVE FOR DELETE TO public
  USING (public.is_admin_or_super(auth.uid()));

DROP POLICY IF EXISTS "admins insert variant images" ON public.product_variant_images;
CREATE POLICY "admins insert variant images" ON public.product_variant_images AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (public.is_admin_or_super(auth.uid()));

DROP POLICY IF EXISTS "admins update variant images" ON public.product_variant_images;
CREATE POLICY "admins update variant images" ON public.product_variant_images AS PERMISSIVE FOR UPDATE TO public
  USING (public.is_admin_or_super(auth.uid()));

DROP POLICY IF EXISTS "admins delete variants" ON public.product_variants;
CREATE POLICY "admins delete variants" ON public.product_variants AS PERMISSIVE FOR DELETE TO public
  USING (public.is_admin_or_super(auth.uid()));

DROP POLICY IF EXISTS "admins insert variants" ON public.product_variants;
CREATE POLICY "admins insert variants" ON public.product_variants AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (public.is_admin_or_super(auth.uid()));

DROP POLICY IF EXISTS "admins update variants" ON public.product_variants;
CREATE POLICY "admins update variants" ON public.product_variants AS PERMISSIVE FOR UPDATE TO public
  USING (public.is_admin_or_super(auth.uid()));

DROP POLICY IF EXISTS "admins delete promo codes" ON public.promo_codes;
CREATE POLICY "admins delete promo codes" ON public.promo_codes AS PERMISSIVE FOR DELETE TO public
  USING (public.is_admin_or_super(auth.uid()));

DROP POLICY IF EXISTS "admins insert promo codes" ON public.promo_codes;
CREATE POLICY "admins insert promo codes" ON public.promo_codes AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (public.is_admin_or_super(auth.uid()));

DROP POLICY IF EXISTS "admins update promo codes" ON public.promo_codes;
CREATE POLICY "admins update promo codes" ON public.promo_codes AS PERMISSIVE FOR UPDATE TO public
  USING (public.is_admin_or_super(auth.uid()));

DROP POLICY IF EXISTS "admins view all promo codes" ON public.promo_codes;
CREATE POLICY "admins view all promo codes" ON public.promo_codes AS PERMISSIVE FOR SELECT TO public
  USING (public.is_admin_or_super(auth.uid()));

DROP POLICY IF EXISTS "experiments admin write" ON public.recommendation_experiments;
CREATE POLICY "experiments admin write" ON public.recommendation_experiments AS PERMISSIVE FOR ALL TO public
  USING (public.is_admin_or_super(auth.uid()))
  WITH CHECK (public.is_admin_or_super(auth.uid()));

DROP POLICY IF EXISTS "experiments read running" ON public.recommendation_experiments;
CREATE POLICY "experiments read running" ON public.recommendation_experiments AS PERMISSIVE FOR SELECT TO public
  USING (((status = 'running'::text) OR public.is_admin_or_super(auth.uid())));

DROP POLICY IF EXISTS "rules admin write" ON public.recommendation_rules;
CREATE POLICY "rules admin write" ON public.recommendation_rules AS PERMISSIVE FOR ALL TO public
  USING (public.is_admin_or_super(auth.uid()))
  WITH CHECK (public.is_admin_or_super(auth.uid()));

DROP POLICY IF EXISTS "rules read enabled" ON public.recommendation_rules;
CREATE POLICY "rules read enabled" ON public.recommendation_rules AS PERMISSIVE FOR SELECT TO public
  USING (((enabled = true) OR public.is_admin_or_super(auth.uid())));

DROP POLICY IF EXISTS "admins manage scores" ON public.recommendation_scores;
CREATE POLICY "admins manage scores" ON public.recommendation_scores AS PERMISSIVE FOR ALL TO public
  USING (public.is_admin_or_super(auth.uid()))
  WITH CHECK (public.is_admin_or_super(auth.uid()));

DROP POLICY IF EXISTS "Admins can read shipping_state" ON public.shipping_state;
CREATE POLICY "Admins can read shipping_state" ON public.shipping_state AS PERMISSIVE FOR SELECT TO authenticated
  USING (public.is_admin_or_super(auth.uid()));

DROP POLICY IF EXISTS "admins manage zones delete" ON public.shipping_zones;
CREATE POLICY "admins manage zones delete" ON public.shipping_zones AS PERMISSIVE FOR DELETE TO public
  USING (public.is_admin_or_super(auth.uid()));

DROP POLICY IF EXISTS "admins manage zones insert" ON public.shipping_zones;
CREATE POLICY "admins manage zones insert" ON public.shipping_zones AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (public.is_admin_or_super(auth.uid()));

DROP POLICY IF EXISTS "admins manage zones select" ON public.shipping_zones;
CREATE POLICY "admins manage zones select" ON public.shipping_zones AS PERMISSIVE FOR SELECT TO public
  USING (public.is_admin_or_super(auth.uid()));

DROP POLICY IF EXISTS "admins manage zones update" ON public.shipping_zones;
CREATE POLICY "admins manage zones update" ON public.shipping_zones AS PERMISSIVE FOR UPDATE TO public
  USING (public.is_admin_or_super(auth.uid()));

DROP POLICY IF EXISTS "Admins can view inbound email events" ON public.support_email_events;
CREATE POLICY "Admins can view inbound email events" ON public.support_email_events AS PERMISSIVE FOR SELECT TO authenticated
  USING (public.is_admin_or_super(auth.uid()));