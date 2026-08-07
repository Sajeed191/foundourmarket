CREATE OR REPLACE FUNCTION public.guard_support_ticket_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_violations text[] := '{}';
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.has_any_role(v_uid, ARRAY['admin','super_admin','manager','support']::app_role[]) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN v_violations := v_violations || 'status'; END IF;
  IF NEW.priority IS DISTINCT FROM OLD.priority THEN v_violations := v_violations || 'priority'; END IF;
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN v_violations := v_violations || 'assigned_to'; END IF;
  IF NEW.category IS DISTINCT FROM OLD.category THEN v_violations := v_violations || 'category'; END IF;
  IF NEW.resolved_at IS DISTINCT FROM OLD.resolved_at THEN v_violations := v_violations || 'resolved_at'; END IF;
  IF NEW.closed_at IS DISTINCT FROM OLD.closed_at THEN v_violations := v_violations || 'closed_at'; END IF;
  IF NEW.first_response_at IS DISTINCT FROM OLD.first_response_at THEN v_violations := v_violations || 'first_response_at'; END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN v_violations := v_violations || 'user_id'; END IF;
  IF NEW.seller_id IS DISTINCT FROM OLD.seller_id THEN v_violations := v_violations || 'seller_id'; END IF;
  IF NEW.ticket_number IS DISTINCT FROM OLD.ticket_number THEN v_violations := v_violations || 'ticket_number'; END IF;
  IF NEW.is_seeded IS DISTINCT FROM OLD.is_seeded THEN v_violations := v_violations || 'is_seeded'; END IF;
  IF NEW.market_region IS DISTINCT FROM OLD.market_region THEN v_violations := v_violations || 'market_region'; END IF;
  IF NEW.channel IS DISTINCT FROM OLD.channel THEN v_violations := v_violations || 'channel'; END IF;
  IF NEW.source IS DISTINCT FROM OLD.source THEN v_violations := v_violations || 'source'; END IF;
  IF NEW.guest_email IS DISTINCT FROM OLD.guest_email THEN v_violations := v_violations || 'guest_email'; END IF;
  IF NEW.guest_name IS DISTINCT FROM OLD.guest_name THEN v_violations := v_violations || 'guest_name'; END IF;
  IF NEW.order_id IS DISTINCT FROM OLD.order_id THEN v_violations := v_violations || 'order_id'; END IF;
  IF NEW.return_id IS DISTINCT FROM OLD.return_id THEN v_violations := v_violations || 'return_id'; END IF;
  IF NEW.refund_id IS DISTINCT FROM OLD.refund_id THEN v_violations := v_violations || 'refund_id'; END IF;
  IF NEW.shipment_id IS DISTINCT FROM OLD.shipment_id THEN v_violations := v_violations || 'shipment_id'; END IF;
  IF NEW.dispute_id IS DISTINCT FROM OLD.dispute_id THEN v_violations := v_violations || 'dispute_id'; END IF;
  -- Staff-only routing labels and the staff-side unread counter.
  IF NEW.tags IS DISTINCT FROM OLD.tags THEN v_violations := v_violations || 'tags'; END IF;
  IF NEW.unread_admin_count IS DISTINCT FROM OLD.unread_admin_count THEN v_violations := v_violations || 'unread_admin_count'; END IF;

  IF array_length(v_violations, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.security_audit_log (actor_id, actor_role, action, target, success, detail)
  VALUES (
    v_uid,
    'customer',
    'support_ticket_state_change_denied',
    'support_tickets',
    false,
    jsonb_build_object('fields', v_violations)
  );

  RAISE EXCEPTION 'Not authorized to modify support ticket state.'
    USING ERRCODE = '42501';
END;
$function$;