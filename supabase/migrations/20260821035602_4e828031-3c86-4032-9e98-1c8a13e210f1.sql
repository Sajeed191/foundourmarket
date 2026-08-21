-- ============================================================
-- Security Hardening v4.0 — SECURITY DEFINER function exposure
-- ============================================================

REVOKE ALL ON FUNCTION public.svc_admin_order_detail(uuid, uuid) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.svc_admin_order_detail(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.svc_database_health() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.svc_database_health() TO service_role;

REVOKE ALL ON FUNCTION public.svc_executive_analytics(uuid) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.svc_executive_analytics(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.email_queue_dispatch() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.email_queue_status() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO service_role;
GRANT EXECUTE ON FUNCTION public.email_queue_status() TO service_role;

REVOKE ALL ON FUNCTION public.backfill_order_lifecycle() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.expire_flash_deals() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.audit_flash_deals() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.expire_stale_orders() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.customer_cancel_order(uuid, uuid) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.notify_staff(text, text, text, text, text, jsonb) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.notify_roles(app_role[], text, text, text, text, jsonb, text) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.try_fire_campaign_alert(uuid, text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.backfill_order_lifecycle() TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_flash_deals() TO service_role;
GRANT EXECUTE ON FUNCTION public.audit_flash_deals() TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_orders() TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_cancel_order(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_staff(text, text, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_roles(app_role[], text, text, text, text, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.try_fire_campaign_alert(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.log_admin_activity(text, text, text, jsonb) FROM anon, public;
REVOKE ALL ON FUNCTION public.log_media_event(text, uuid, text, text, jsonb) FROM anon, public;
REVOKE ALL ON FUNCTION public.save_entity_version(text, text, jsonb, text[], text) FROM anon, public;
REVOKE ALL ON FUNCTION public.upsert_editor_draft(text, text, jsonb, jsonb, text, text) FROM anon, public;
REVOKE ALL ON FUNCTION public.discard_editor_draft(text, text) FROM anon, public;
REVOKE ALL ON FUNCTION public.reorder_banner(uuid, text) FROM anon, public;
REVOKE ALL ON FUNCTION public.reorder_category(uuid, text) FROM anon, public;
REVOKE ALL ON FUNCTION public.mark_official_answer(uuid, uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.admin_hard_delete_review(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.admin_soft_delete_review(uuid, text) FROM anon, public;
REVOKE ALL ON FUNCTION public.admin_restore_review(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.admin_order_detail(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.review_dashboard() FROM anon, public;
REVOKE ALL ON FUNCTION public.support_admin_unread_count() FROM anon, public;
REVOKE ALL ON FUNCTION public.support_unread_count() FROM anon, public;
REVOKE ALL ON FUNCTION public.recalculate_product_rating(text) FROM anon, public;
REVOKE ALL ON FUNCTION public.refresh_review_vote_counts(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.hard_delete_own_review(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.soft_delete_own_review(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.soft_delete_own_question(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.toggle_answer_helpful(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.can_access_support_thread(text) FROM anon, public;
REVOKE ALL ON FUNCTION public.can_review_product(text) FROM anon, public;

-- media_library_search bypasses RLS: enforce staff inside the function too.
CREATE OR REPLACE FUNCTION public.media_library_search(
  _q text DEFAULT NULL,
  _entity_type text DEFAULT NULL,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS SETOF public.media_assets
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_any_role(
        auth.uid(),
        ARRAY['admin','super_admin','manager','editor','support']::app_role[]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT * FROM public.media_assets m
  WHERE (_entity_type IS NULL OR _entity_type = 'all' OR m.entity_type = _entity_type)
    AND (
      _q IS NULL OR length(trim(_q)) = 0
      OR m.original_name ILIKE '%'||_q||'%'
      OR m.alt ILIKE '%'||_q||'%'
      OR EXISTS (SELECT 1 FROM unnest(m.tags) t WHERE t ILIKE '%'||_q||'%')
    )
  ORDER BY m.created_at DESC
  LIMIT LEAST(COALESCE(_limit, 50), 100) OFFSET COALESCE(_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.media_library_search(text, text, integer, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.media_library_search(text, text, integer, integer) TO authenticated, service_role;