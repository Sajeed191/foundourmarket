REVOKE SELECT ON TABLE public.profiles FROM anon;

DROP POLICY IF EXISTS "Anyone can record badge clicks" ON public.badge_events;
REVOKE INSERT ON TABLE public.badge_events FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_badge_event(
  _badge_type_id uuid,
  _product_slug text,
  _event_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _event_type NOT IN ('click', 'impression')
     OR length(_product_slug) < 1
     OR length(_product_slug) > 200 THEN
    RAISE EXCEPTION 'invalid_badge_event' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.badge_types bt
    JOIN public.products p ON p.slug = _product_slug
    WHERE bt.id = _badge_type_id
      AND bt.active = true
      AND p.deleted_at IS NULL
      AND p.status IN ('published', 'preorder', 'out_of_stock')
  ) THEN
    RAISE EXCEPTION 'invalid_badge_event' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.badge_events (badge_type_id, product_slug, event_type)
  VALUES (_badge_type_id, _product_slug, _event_type);
END;
$$;
REVOKE ALL ON FUNCTION public.record_badge_event(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_badge_event(uuid, text, text) TO anon, authenticated, service_role;

ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;

ALTER VIEW public.product_variants_public SET (security_invoker = on);

DROP POLICY IF EXISTS "Published product variant images are viewable" ON public.product_variant_images;
CREATE POLICY "Published product variant images are viewable"
ON public.product_variant_images
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.slug = product_variant_images.product_slug
      AND p.deleted_at IS NULL
      AND p.status IN ('published', 'preorder', 'out_of_stock')
  )
);
GRANT SELECT ON TABLE public.product_variant_images TO anon, authenticated;
ALTER VIEW public.product_variant_images_public SET (security_invoker = on);