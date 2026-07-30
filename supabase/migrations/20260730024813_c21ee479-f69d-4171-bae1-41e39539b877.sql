-- FoundOurMarket Security Hardening v1.1 — waitlist integrity only.
-- No policy / grant / column changes: reads and writes behave exactly as before.

-- 1. Collapse existing duplicates, keeping the earliest row per (user, product).
DELETE FROM public.international_waitlist a
USING public.international_waitlist b
WHERE a.ctid > b.ctid
  AND a.user_id IS NOT DISTINCT FROM b.user_id
  AND a.product_slug IS NOT DISTINCT FROM b.product_slug;

-- 2. One user + one product = one waitlist record.
CREATE UNIQUE INDEX IF NOT EXISTS international_waitlist_user_product_uidx
  ON public.international_waitlist (user_id, product_slug)
  WHERE product_slug IS NOT NULL;

-- 3. One general (no product) interest record per user.
CREATE UNIQUE INDEX IF NOT EXISTS international_waitlist_user_general_uidx
  ON public.international_waitlist (user_id)
  WHERE product_slug IS NULL;