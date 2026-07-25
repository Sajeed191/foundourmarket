-- Security Hardening v2.0 — Finding #3: newsletter_subscribers ownership by user_id
--
-- NOTE (Findings #1 and #2, intentionally unchanged):
--   * public.product_reviews_public remains the ONLY public read path for reviews
--     (filters status='published' AND deleted_at IS NULL, safe columns only).
--     The view is owned by a privileged role and therefore reads the base table
--     with owner privileges; base-table RLS stays untouched so authenticated
--     customers keep read access to their own pending/flagged reviews.
--   * review-media ownership stays enforced by storage RLS (folder prefix must
--     equal auth.uid() on upload; public read joins the parent published review).

-- 1) Ownership column ---------------------------------------------------------
ALTER TABLE public.newsletter_subscribers
  ADD COLUMN IF NOT EXISTS user_id uuid NULL;

CREATE INDEX IF NOT EXISTS newsletter_subscribers_user_id_idx
  ON public.newsletter_subscribers (user_id)
  WHERE user_id IS NOT NULL;

-- 2) Safe backfill: only verified auth users, never overwrite existing mapping,
--    and skip emails that resolve to more than one account.
WITH candidates AS (
  SELECT lower(u.email) AS email_key, min(u.id::text)::uuid AS user_id, count(*) AS n
  FROM auth.users u
  WHERE u.email IS NOT NULL
    AND u.email_confirmed_at IS NOT NULL
    AND u.deleted_at IS NULL
  GROUP BY 1
)
UPDATE public.newsletter_subscribers s
SET user_id = c.user_id
FROM candidates c
WHERE s.user_id IS NULL
  AND c.n = 1
  AND lower(s.email) = c.email_key;

-- 3) Case-insensitive uniqueness ---------------------------------------------
-- No case-variant duplicates exist in production data (validated before migration).
CREATE UNIQUE INDEX IF NOT EXISTS newsletter_subscribers_email_lower_key
  ON public.newsletter_subscribers (lower(email));

ALTER TABLE public.newsletter_subscribers
  DROP CONSTRAINT IF EXISTS newsletter_subscribers_email_key;

-- 4) Ownership policy: user_id only, never email strings ----------------------
DROP POLICY IF EXISTS "subscribers view own record" ON public.newsletter_subscribers;

CREATE POLICY "subscribers view own record"
  ON public.newsletter_subscribers
  FOR SELECT
  TO authenticated
  USING (user_id IS NOT NULL AND user_id = auth.uid());

-- 5) Grants (staff + own-row reads happen as authenticated; writes are
--    service-role/server-side or staff-only, anon has no access).
REVOKE ALL ON public.newsletter_subscribers FROM anon;
GRANT SELECT ON public.newsletter_subscribers TO authenticated;
GRANT ALL ON public.newsletter_subscribers TO service_role;