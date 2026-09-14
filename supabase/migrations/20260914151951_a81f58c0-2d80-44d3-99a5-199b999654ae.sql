-- Harden customer-facing UPDATE policies so status/review escalation is blocked at the policy level too.

DROP POLICY IF EXISTS "Customers update own pending refund bank record" ON public.refund_bank_details;
CREATE POLICY "Customers update own pending refund bank record"
ON public.refund_bank_details
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  AND status = ANY (ARRAY['requested'::text, 'update_requested'::text, 'rejected'::text])
)
WITH CHECK (
  auth.uid() = user_id
  AND status = ANY (ARRAY['submitted'::text, 'requested'::text, 'update_requested'::text, 'rejected'::text])
);

DROP POLICY IF EXISTS "Customers update own unreviewed ratings" ON public.support_ticket_ratings;
CREATE POLICY "Customers update own unreviewed ratings"
ON public.support_ticket_ratings
FOR UPDATE
TO authenticated
USING (customer_id = auth.uid() AND reviewed = false)
WITH CHECK (
  customer_id = auth.uid()
  AND reviewed = false
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL
);