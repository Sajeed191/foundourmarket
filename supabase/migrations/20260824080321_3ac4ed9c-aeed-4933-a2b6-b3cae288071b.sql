-- Safely replay ONE dead-lettered email back into its source queue.
-- Returns jsonb {replayed: bool, reason: text, queue: text}.
-- Exactly-once: the DLQ copy is archived in the same transaction, so a second
-- call for the same message_id finds nothing and reports not_found.
CREATE OR REPLACE FUNCTION public.email_dlq_replay(p_message_id text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pgmq, public
AS $$
DECLARE
  base_name text;
  rec record;
  found boolean := false;
  target_queue text;
  new_payload jsonb;
BEGIN
  IF p_message_id IS NULL OR length(trim(p_message_id)) = 0 THEN
    RETURN jsonb_build_object('replayed', false, 'reason', 'invalid_message_id');
  END IF;

  -- Never replay something that already succeeded.
  IF EXISTS (
    SELECT 1 FROM public.email_send_log
    WHERE message_id = p_message_id AND status = 'sent'
  ) THEN
    RETURN jsonb_build_object('replayed', false, 'reason', 'already_sent');
  END IF;

  FOREACH base_name IN ARRAY ARRAY['transactional_emails', 'auth_emails'] LOOP
    IF to_regclass(format('pgmq.q_%s_dlq', base_name)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'SELECT msg_id, message FROM pgmq.q_%I_dlq WHERE message->>''message_id'' = $1 ORDER BY msg_id LIMIT 1',
      base_name || '_dlq'
    ) INTO rec USING p_message_id;

    IF rec.msg_id IS NOT NULL THEN
      found := true;
      target_queue := base_name;
      -- Refresh queued_at so the TTL window restarts for this replay.
      new_payload := rec.message || jsonb_build_object('queued_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
      PERFORM pgmq.send(base_name, new_payload);
      PERFORM pgmq.archive(base_name || '_dlq', rec.msg_id);
      EXIT;
    END IF;
  END LOOP;

  IF NOT found THEN
    RETURN jsonb_build_object('replayed', false, 'reason', 'not_found');
  END IF;

  RETURN jsonb_build_object('replayed', true, 'queue', target_queue);
END;
$$;

REVOKE ALL ON FUNCTION public.email_dlq_replay(text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.email_dlq_replay(text) TO service_role;