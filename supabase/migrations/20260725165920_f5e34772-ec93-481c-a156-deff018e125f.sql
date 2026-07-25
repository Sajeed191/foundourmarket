-- Security Hardening v1.0 — shipping_state least-privilege
DROP POLICY IF EXISTS "shipping state public read" ON public.shipping_state;

-- Revoke unnecessary Data API access from anon; keep authenticated grant
-- (RLS still filters non-admins out).
REVOKE SELECT ON public.shipping_state FROM anon;

-- Admin-only SELECT. service_role continues to bypass RLS.
CREATE POLICY "Admins can read shipping_state"
ON public.shipping_state
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
