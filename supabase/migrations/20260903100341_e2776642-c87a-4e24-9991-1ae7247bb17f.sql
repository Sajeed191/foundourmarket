GRANT SELECT ON public.product_variants_public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT ALL ON public.product_variants TO service_role;
GRANT SELECT ON public.product_variants_public TO service_role;