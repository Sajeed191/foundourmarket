ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS refund_method text NOT NULL DEFAULT 'gateway';

CREATE TABLE IF NOT EXISTS public.refund_bank_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL UNIQUE REFERENCES public.returns(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'requested',
  -- encrypted blob (AES-256-GCM) holding account number, ifsc, upi, holder name
  payload_ciphertext text,
  payload_iv text,
  payload_tag text,
  key_version integer NOT NULL DEFAULT 1,
  -- safe, maskable metadata
  masked_account text,
  masked_upi text,
  masked_holder text,
  bank_name text,
  branch_name text,
  account_type text,
  country text,
  currency text,
  customer_notes text,
  rejection_reason text,
  refund_reference text,
  requested_by uuid,
  requested_at timestamptz,
  submitted_at timestamptz,
  verified_by uuid,
  verified_at timestamptz,
  refund_sent_by uuid,
  refund_sent_at timestamptz,
  last_reminder_at timestamptz,
  reminder_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS refund_bank_details_status_idx ON public.refund_bank_details(status);
CREATE INDEX IF NOT EXISTS refund_bank_details_user_idx ON public.refund_bank_details(user_id);

GRANT SELECT, INSERT, UPDATE ON public.refund_bank_details TO authenticated;
GRANT ALL ON public.refund_bank_details TO service_role;

ALTER TABLE public.refund_bank_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers read own refund bank record"
  ON public.refund_bank_details FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_staff(auth.uid()));

CREATE POLICY "Customers create own refund bank record"
  ON public.refund_bank_details FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Customers update own pending refund bank record"
  ON public.refund_bank_details FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND status IN ('requested','update_requested','rejected'))
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.refund_bank_audit (
  id bigserial PRIMARY KEY,
  refund_bank_id uuid REFERENCES public.refund_bank_details(id) ON DELETE CASCADE,
  return_id uuid,
  actor_id uuid,
  actor_role text,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS refund_bank_audit_bank_idx ON public.refund_bank_audit(refund_bank_id);

GRANT SELECT ON public.refund_bank_audit TO authenticated;
GRANT ALL ON public.refund_bank_audit TO service_role;

ALTER TABLE public.refund_bank_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read refund bank audit"
  ON public.refund_bank_audit FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE TRIGGER update_refund_bank_details_updated_at
  BEFORE UPDATE ON public.refund_bank_details
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();