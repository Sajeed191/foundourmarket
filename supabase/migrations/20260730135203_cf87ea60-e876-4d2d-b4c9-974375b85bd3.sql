CREATE OR REPLACE FUNCTION public.support_service_facts()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH presence AS (
    SELECT
      COUNT(*) FILTER (WHERE last_active_at >= now() - interval '5 minutes')  AS online_count,
      COUNT(*) FILTER (WHERE last_active_at >= now() - interval '30 minutes'
                         AND last_active_at <  now() - interval '5 minutes')  AS away_count,
      MAX(last_active_at) AS last_active_at
    FROM public.support_agent_presence
  ),
  resp AS (
    SELECT
      COUNT(*) AS n,
      AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 60.0) AS avg_min
    FROM public.support_tickets
    WHERE first_response_at IS NOT NULL
      AND first_response_at >= created_at
      AND created_at >= now() - interval '90 days'
      AND COALESCE(is_seeded, false) = false
  ),
  res AS (
    SELECT
      COUNT(*) AS n,
      AVG(EXTRACT(EPOCH FROM (COALESCE(resolved_at, closed_at) - created_at)) / 3600.0) AS avg_hours
    FROM public.support_tickets
    WHERE COALESCE(resolved_at, closed_at) IS NOT NULL
      AND COALESCE(resolved_at, closed_at) >= created_at
      AND created_at >= now() - interval '90 days'
      AND COALESCE(is_seeded, false) = false
  ),
  q AS (
    SELECT COUNT(*) AS open_count
    FROM public.support_tickets
    WHERE status IN ('open', 'pending', 'in_progress', 'awaiting_customer')
      AND COALESCE(is_seeded, false) = false
  ),
  cfg AS (
    SELECT support_status, support_response_minutes, support_whatsapp_numbers
    FROM public.store_settings
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'online_count',            presence.online_count,
    'away_count',              presence.away_count,
    'last_active_at',          presence.last_active_at,
    'avg_first_response_minutes', CASE WHEN resp.n > 0 THEN ROUND(resp.avg_min::numeric, 1) END,
    'first_response_sample',   resp.n,
    'avg_resolution_hours',    CASE WHEN res.n > 0 THEN ROUND(res.avg_hours::numeric, 1) END,
    'resolution_sample',       res.n,
    'open_tickets',            q.open_count,
    'configured_status',       cfg.support_status,
    'configured_response_minutes', cfg.support_response_minutes,
    'whatsapp_numbers',        cfg.support_whatsapp_numbers
  )
  FROM presence, resp, res, q LEFT JOIN cfg ON true;
$$;

REVOKE ALL ON FUNCTION public.support_service_facts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.support_service_facts() TO anon, authenticated, service_role;