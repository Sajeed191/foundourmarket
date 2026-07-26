CREATE OR REPLACE FUNCTION public.hard_delete_own_review(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_owner uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT user_id
    INTO v_owner
  FROM public.product_reviews
  WHERE id = p_id
  FOR UPDATE;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Review not found';
  END IF;

  IF v_owner <> v_uid THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  -- Uploaded photos/videos are now removed through the Storage API by the
  -- client before this function runs. Deleting directly from storage.objects
  -- is blocked by the platform (SQLSTATE 42501, "Direct deletion from storage
  -- tables is not allowed"), which previously aborted this whole transaction
  -- and made any review WITH media undeletable.
  --
  -- CASCADE deletes on review_votes / review_reports fire here; the
  -- recalc_product_rating trigger recomputes rating/count (falling back to the
  -- admin baseline when 0 reviews remain); realtime broadcasts the DELETE.
  DELETE FROM public.product_reviews WHERE id = p_id;
END;
$$;