
CREATE OR REPLACE FUNCTION public.hard_delete_own_review(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_media jsonb;
  v_item  jsonb;
  v_url   text;
  v_path  text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT user_id, media
    INTO v_owner, v_media
  FROM public.product_reviews
  WHERE id = p_id
  FOR UPDATE;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Review not found';
  END IF;

  IF v_owner <> v_uid THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  -- Remove uploaded photos/videos from the review-media bucket so nothing is
  -- orphaned in storage. URLs look like:
  --   https://<proj>.supabase.co/storage/v1/object/public/review-media/<path>
  IF v_media IS NOT NULL AND jsonb_typeof(v_media) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_media)
    LOOP
      v_url := COALESCE(v_item ->> 'url', v_item ->> 'src', v_item ->> 'path');
      IF v_url IS NULL THEN CONTINUE; END IF;
      v_path := regexp_replace(
        v_url,
        '^.*/storage/v1/object/(?:public|sign)/review-media/',
        ''
      );
      -- If regex didn't match, treat the raw value as a path.
      IF v_path = v_url AND position('/' in v_url) > 0 AND v_url NOT LIKE 'http%' THEN
        v_path := v_url;
      ELSIF v_path = v_url THEN
        CONTINUE;
      END IF;
      -- Strip any query string (?token=...)
      v_path := split_part(v_path, '?', 1);
      DELETE FROM storage.objects
        WHERE bucket_id = 'review-media'
          AND name = v_path;
    END LOOP;
  END IF;

  -- CASCADE deletes on review_votes and review_reports fire here; the
  -- recalc_product_rating trigger recomputes rating/count (falling back to
  -- the admin baseline when 0 reviews remain); realtime broadcasts DELETE.
  DELETE FROM public.product_reviews WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.hard_delete_own_review(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hard_delete_own_review(uuid) TO authenticated;
