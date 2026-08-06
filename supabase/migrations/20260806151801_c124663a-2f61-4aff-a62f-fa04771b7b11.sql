-- Preserve admin-entered display ratings as the baseline where none was stored.
UPDATE public.products p
SET initial_rating = p.rating
WHERE COALESCE(p.initial_rating, 0) <= 0
  AND COALESCE(p.rating, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.product_reviews r
    WHERE r.product_slug = p.slug
      AND r.status = 'published'
      AND r.deleted_at IS NULL
      AND COALESCE(r.is_seeded, false) = false
  );

-- Refresh every product's denormalized rating/count with the corrected rule.
DO $$
DECLARE s text;
BEGIN
  FOR s IN SELECT slug FROM public.products LOOP
    PERFORM public.recalculate_product_rating(s);
  END LOOP;
END $$;