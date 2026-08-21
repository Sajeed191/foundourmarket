DROP FUNCTION IF EXISTS public.search_products(text, text, numeric, numeric, numeric, text, integer, integer);

CREATE FUNCTION public.search_products(
  q text DEFAULT NULL, category_filter text DEFAULT NULL, min_price numeric DEFAULT NULL,
  max_price numeric DEFAULT NULL, min_rating numeric DEFAULT NULL, sort_by text DEFAULT 'relevance',
  page_limit integer DEFAULT 24, page_offset integer DEFAULT 0)
RETURNS SETOF public.products_public
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  ts_q tsquery; cat_slugs text[]; cat_id uuid; norm_q text; word text; prefix_q text;
BEGIN
  IF q IS NOT NULL AND length(trim(q)) > 0 THEN
    norm_q := lower(trim(q));
    ts_q := websearch_to_tsquery('english', q);
    prefix_q := '';
    FOR word IN SELECT m[1] FROM regexp_matches(norm_q, '[a-z0-9]+', 'g') AS m LOOP
      IF length(prefix_q) > 0 THEN prefix_q := prefix_q || ' & '; END IF;
      prefix_q := prefix_q || word || ':*';
    END LOOP;
    IF length(prefix_q) > 0 THEN ts_q := ts_q || to_tsquery('english', prefix_q); END IF;
  END IF;

  IF category_filter IS NOT NULL THEN
    SELECT c.id INTO cat_id FROM public.categories c WHERE c.slug = category_filter;
    IF cat_id IS NOT NULL THEN
      SELECT array_agg(s) INTO cat_slugs FROM (
        SELECT category_filter AS s UNION SELECT c.slug FROM public.categories c WHERE c.parent_id = cat_id
      ) sub;
    ELSE cat_slugs := ARRAY[category_filter]; END IF;
  END IF;

  RETURN QUERY
  SELECT p.id, p.slug, p.name, p.tagline, p.category, p.price, p.rating, p.reviews, p.image,
    p.description, p.in_stock, p.discount, p.sort_order, p.created_at, p.updated_at, p.featured,
    p.sku, p.stock_quantity, p.low_stock_threshold, p.views_count, p.price_inr, p.compare_price_inr,
    p.price_usd, p.compare_price_usd, p.india_visible, p.international_visible, p.warranty, p.status,
    p.shipping_fee_inr, p.shipping_fee_usd, p.razorpay_enabled, p.stripe_enabled, p.paypal_enabled,
    p.cod_enabled, p.return_eligible, p.replacement_eligible, p.return_window_days, p.pickup_supported,
    p.international_shipping, p.fragile, p.customs_info, p.restock_eta, p.preorder,
    p.scheduled_publish_at, p.scheduled_expiry_at, p.sold_count, p.wishlist_count, p.tags, p.features,
    p.meta_keywords, p.seo_title, p.seo_description, p.specifications, p.attributes, p.bestseller,
    p.trending, p.new_arrival, p.hot_deal, p.inventory_tracking, p.shipping_class, p.delivery_estimate,
    p.collection, p.homepage_section, p.flash_deal, p.staff_pick, p.recommended, p.homepage_hero,
    p.gift_idea, p.is_category_banner, p.hide_from_search, p.hide_from_recommendations,
    p.homepage_position, p.category_position, p.featured_until, p.related_products,
    p.cross_sell_products, p.upsell_products, p.premium, p.fast_selling, p.editors_choice,
    p.priority_score, p.collections, p.rating_source, p.brand, p.product_type, p.categories,
    p.video_url, p.default_variant_color
  FROM public.products p
  WHERE p.deleted_at IS NULL
    AND p.status IN ('published', 'preorder', 'out_of_stock')
    AND COALESCE(p.hide_from_search, false) = false
    AND (COALESCE(p.india_visible, true) OR COALESCE(p.international_visible, true))
    AND (norm_q IS NULL
      OR (ts_q IS NOT NULL AND p.search_vector @@ ts_q)
      OR p.search_text % norm_q
      OR p.search_text ILIKE '%' || norm_q || '%')
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

DROP FUNCTION IF EXISTS public.trending_products(integer);

CREATE FUNCTION public.trending_products(page_limit integer DEFAULT 10)
RETURNS SETOF public.products_public
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH views AS (
    SELECT split_part(path, '/', 3) AS slug,
           count(*) FILTER (WHERE created_at > now() - interval '24 hours') AS v24,
           count(*) FILTER (WHERE created_at > now() - interval '7 days')  AS v7
    FROM public.page_views
    WHERE path LIKE '/products/%' AND created_at > now() - interval '7 days' GROUP BY 1
  ),
  carts AS (
    SELECT product_slug AS slug, sum(quantity) FILTER (WHERE created_at > now() - interval '7 days') AS c7
    FROM public.cart_items WHERE created_at > now() - interval '7 days' GROUP BY 1
  ),
  sales AS (
    SELECT product_slug AS slug,
           sum(quantity) FILTER (WHERE created_at > now() - interval '24 hours') AS s24,
           sum(quantity) FILTER (WHERE created_at > now() - interval '7 days')  AS s7
    FROM public.order_items WHERE created_at > now() - interval '7 days' GROUP BY 1
  ),
  scores AS (
    SELECT p.id,
      (COALESCE(v.v24,0) * 3.0 + COALESCE(v.v7,0) * 1.0 + COALESCE(c.c7,0) * 5.0
       + COALESCE(s.s24,0) * 12.0 + COALESCE(s.s7,0) * 5.0) AS trend_score
    FROM public.products p
    LEFT JOIN views v ON v.slug = p.slug
    LEFT JOIN carts c ON c.slug = p.slug
    LEFT JOIN sales s ON s.slug = p.slug
    WHERE p.status = 'published' AND COALESCE(p.hide_from_search, false) = false
  )
  SELECT p.id, p.slug, p.name, p.tagline, p.category, p.price, p.rating, p.reviews, p.image,
    p.description, p.in_stock, p.discount, p.sort_order, p.created_at, p.updated_at, p.featured,
    p.sku, p.stock_quantity, p.low_stock_threshold, p.views_count, p.price_inr, p.compare_price_inr,
    p.price_usd, p.compare_price_usd, p.india_visible, p.international_visible, p.warranty, p.status,
    p.shipping_fee_inr, p.shipping_fee_usd, p.razorpay_enabled, p.stripe_enabled, p.paypal_enabled,
    p.cod_enabled, p.return_eligible, p.replacement_eligible, p.return_window_days, p.pickup_supported,
    p.international_shipping, p.fragile, p.customs_info, p.restock_eta, p.preorder,
    p.scheduled_publish_at, p.scheduled_expiry_at, p.sold_count, p.wishlist_count, p.tags, p.features,
    p.meta_keywords, p.seo_title, p.seo_description, p.specifications, p.attributes, p.bestseller,
    p.trending, p.new_arrival, p.hot_deal, p.inventory_tracking, p.shipping_class, p.delivery_estimate,
    p.collection, p.homepage_section, p.flash_deal, p.staff_pick, p.recommended, p.homepage_hero,
    p.gift_idea, p.is_category_banner, p.hide_from_search, p.hide_from_recommendations,
    p.homepage_position, p.category_position, p.featured_until, p.related_products,
    p.cross_sell_products, p.upsell_products, p.premium, p.fast_selling, p.editors_choice,
    p.priority_score, p.collections, p.rating_source, p.brand, p.product_type, p.categories,
    p.video_url, p.default_variant_color
  FROM public.products p
  JOIN scores sc ON sc.id = p.id
  WHERE sc.trend_score > 0 AND p.deleted_at IS NULL
  ORDER BY sc.trend_score DESC, p.sold_count DESC NULLS LAST, p.created_at DESC
  LIMIT page_limit;
$function$;

CREATE OR REPLACE FUNCTION public.suggest_search_term(q text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  norm_q text; suggestion text;
BEGIN
  IF q IS NULL OR length(trim(q)) = 0 THEN RETURN NULL; END IF;
  norm_q := lower(trim(q));
  SELECT term INTO suggestion FROM (
    SELECT lower(brand) AS term FROM public.products
      WHERE deleted_at IS NULL AND status IN ('published','preorder','out_of_stock')
        AND COALESCE(hide_from_search,false) = false AND brand IS NOT NULL AND length(brand) > 1
    UNION
    SELECT lower(category) FROM public.products
      WHERE deleted_at IS NULL AND status IN ('published','preorder','out_of_stock')
        AND COALESCE(hide_from_search,false) = false AND category IS NOT NULL
    UNION
    SELECT lower(name) FROM public.products
      WHERE deleted_at IS NULL AND status IN ('published','preorder','out_of_stock')
        AND COALESCE(hide_from_search,false) = false AND name IS NOT NULL
  ) terms
  WHERE term <> norm_q AND similarity(term, norm_q) > 0.2
  ORDER BY similarity(term, norm_q) DESC LIMIT 1;
  RETURN suggestion;
END $function$;

REVOKE ALL ON FUNCTION public.search_products(text, text, numeric, numeric, numeric, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trending_products(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_products(text, text, numeric, numeric, numeric, text, integer, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trending_products(integer) TO anon, authenticated, service_role;