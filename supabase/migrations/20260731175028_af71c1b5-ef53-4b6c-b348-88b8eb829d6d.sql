CREATE OR REPLACE FUNCTION public.search_products(q text DEFAULT NULL::text, category_filter text DEFAULT NULL::text, min_price numeric DEFAULT NULL::numeric, max_price numeric DEFAULT NULL::numeric, min_rating numeric DEFAULT NULL::numeric, sort_by text DEFAULT 'relevance'::text, page_limit integer DEFAULT 24, page_offset integer DEFAULT 0)
 RETURNS SETOF products
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ts_q tsquery;
  cat_slugs text[];
  cat_id uuid;
  norm_q text;
  word text;
  prefix_q text;
BEGIN
  IF q IS NOT NULL AND length(trim(q)) > 0 THEN
    norm_q := lower(trim(q));
    ts_q := websearch_to_tsquery('english', q);

    prefix_q := '';
    FOR word IN
      SELECT m[1] FROM regexp_matches(norm_q, '[a-z0-9]+', 'g') AS m
    LOOP
      IF length(prefix_q) > 0 THEN
        prefix_q := prefix_q || ' & ';
      END IF;
      prefix_q := prefix_q || word || ':*';
    END LOOP;

    IF length(prefix_q) > 0 THEN
      ts_q := ts_q || to_tsquery('english', prefix_q);
    END IF;
  END IF;

  IF category_filter IS NOT NULL THEN
    SELECT c.id INTO cat_id FROM public.categories c WHERE c.slug = category_filter;
    IF cat_id IS NOT NULL THEN
      SELECT array_agg(s) INTO cat_slugs
      FROM (
        SELECT category_filter AS s
        UNION
        SELECT c.slug FROM public.categories c WHERE c.parent_id = cat_id
      ) sub;
    ELSE
      cat_slugs := ARRAY[category_filter];
    END IF;
  END IF;

  RETURN QUERY
  SELECT p.* FROM public.products p
  WHERE p.deleted_at IS NULL
    AND p.status IN ('published', 'preorder', 'out_of_stock')
    AND COALESCE(p.hide_from_search, false) = false
    AND (COALESCE(p.india_visible, true) OR COALESCE(p.international_visible, true))
    AND (
      norm_q IS NULL
      OR (ts_q IS NOT NULL AND p.search_vector @@ ts_q)
      OR p.search_text % norm_q
      OR p.search_text ILIKE '%' || norm_q || '%'
    )
    AND (cat_slugs IS NULL OR p.category = ANY(cat_slugs))
    AND (min_price IS NULL OR p.price >= min_price)
    AND (max_price IS NULL OR p.price <= max_price)
    AND (min_rating IS NULL OR p.rating >= min_rating)
  ORDER BY
    CASE WHEN sort_by = 'relevance' AND norm_q IS NOT NULL THEN
      (CASE WHEN ts_q IS NOT NULL AND p.search_vector @@ ts_q THEN ts_rank(p.search_vector, ts_q) ELSE 0 END)
      + similarity(p.search_text, norm_q)
      + (CASE WHEN p.search_text ILIKE norm_q || '%' THEN 0.5 ELSE 0 END)
    END DESC NULLS LAST,
    CASE WHEN sort_by = 'price_asc' THEN p.price END ASC,
    CASE WHEN sort_by = 'price_desc' THEN p.price END DESC,
    CASE WHEN sort_by = 'rating' THEN p.rating END DESC,
    CASE WHEN sort_by = 'newest' THEN p.created_at END DESC,
    p.sort_order ASC
  LIMIT page_limit OFFSET page_offset;
END $function$;