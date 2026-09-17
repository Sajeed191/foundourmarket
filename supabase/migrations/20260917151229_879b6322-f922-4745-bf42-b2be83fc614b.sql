CREATE OR REPLACE FUNCTION public.record_badge_event(
  _badge_type_id uuid,
  _product_slug text,
  _event_type text
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  INSERT INTO public.badge_events (badge_type_id, product_slug, event_type)
  SELECT _badge_type_id, _product_slug, _event_type
  WHERE _event_type IN ('click', 'impression')
    AND length(_product_slug) BETWEEN 1 AND 200
    AND EXISTS (
      SELECT 1
      FROM public.badge_types bt
      JOIN public.products p ON p.slug = _product_slug
      WHERE bt.id = _badge_type_id
        AND bt.archived = false
        AND p.deleted_at IS NULL
        AND p.status IN ('published', 'preorder', 'out_of_stock')
    );
$$;

GRANT INSERT ON TABLE public.badge_events TO anon, authenticated;
CREATE POLICY "Validated storefront badge events"
ON public.badge_events
FOR INSERT
TO anon, authenticated
WITH CHECK (
  event_type IN ('click', 'impression')
  AND length(product_slug) BETWEEN 1 AND 200
  AND EXISTS (
    SELECT 1
    FROM public.badge_types bt
    JOIN public.products p ON p.slug = badge_events.product_slug
    WHERE bt.id = badge_events.badge_type_id
      AND bt.archived = false
      AND p.deleted_at IS NULL
      AND p.status IN ('published', 'preorder', 'out_of_stock')
  )
);