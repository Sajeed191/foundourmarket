-- 1) product_answers: block self-promotion to official/store response at the policy level too
DROP POLICY IF EXISTS "own answer update" ON public.product_answers;
CREATE POLICY "own answer update"
ON public.product_answers
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND (
    public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[])
    OR (COALESCE(is_official, false) = false AND COALESCE(is_store_response, false) = false)
  )
);

-- 2) refund_bank_details: customers may only edit their own submission fields
CREATE OR REPLACE FUNCTION public.guard_refund_bank_customer_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support','fulfillment']::app_role[]) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.verified_by IS DISTINCT FROM OLD.verified_by
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
     OR NEW.refund_sent_by IS DISTINCT FROM OLD.refund_sent_by
     OR NEW.refund_sent_at IS DISTINCT FROM OLD.refund_sent_at
     OR NEW.refund_reference IS DISTINCT FROM OLD.refund_reference
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
     OR NEW.requested_at IS DISTINCT FROM OLD.requested_at
     OR NEW.last_reminder_at IS DISTINCT FROM OLD.last_reminder_at
     OR NEW.reminder_count IS DISTINCT FROM OLD.reminder_count
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.return_id IS DISTINCT FROM OLD.return_id
     OR NEW.order_id IS DISTINCT FROM OLD.order_id
  THEN
    RAISE EXCEPTION 'You are not allowed to modify refund verification or payout fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_refund_bank_customer_fields ON public.refund_bank_details;
CREATE TRIGGER trg_guard_refund_bank_customer_fields
BEFORE UPDATE ON public.refund_bank_details
FOR EACH ROW EXECUTE FUNCTION public.guard_refund_bank_customer_fields();

-- 3) support_ticket_ratings: customers may only change rating + comment
CREATE OR REPLACE FUNCTION public.guard_support_rating_customer_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[]) THEN
    RETURN NEW;
  END IF;

  IF NEW.reviewed IS DISTINCT FROM OLD.reviewed
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.assigned_agent IS DISTINCT FROM OLD.assigned_agent
     OR NEW.priority IS DISTINCT FROM OLD.priority
     OR NEW.category IS DISTINCT FROM OLD.category
     OR NEW.resolution_time_ms IS DISTINCT FROM OLD.resolution_time_ms
     OR NEW.ticket_id IS DISTINCT FROM OLD.ticket_id
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.rated_at IS DISTINCT FROM OLD.rated_at
  THEN
    RAISE EXCEPTION 'You are not allowed to modify internal support rating fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_support_rating_customer_fields ON public.support_ticket_ratings;
CREATE TRIGGER trg_guard_support_rating_customer_fields
BEFORE UPDATE ON public.support_ticket_ratings
FOR EACH ROW EXECUTE FUNCTION public.guard_support_rating_customer_fields();
