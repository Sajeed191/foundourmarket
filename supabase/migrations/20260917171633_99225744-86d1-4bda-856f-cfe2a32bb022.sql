DROP POLICY IF EXISTS "product scores public read" ON public.product_scores;
REVOKE SELECT ON public.product_scores FROM anon;
GRANT ALL ON public.product_scores TO service_role;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='product_scores' AND policyname='product scores staff read') THEN
    CREATE POLICY "product scores staff read" ON public.product_scores FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;