CREATE OR REPLACE FUNCTION public.email_dlq_replay(p_message_id text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pgmq, public
AS $$
DECLARE
  base_name text;
  v_msg_id bigint;
  v_message jsonb;
  found boolean := false;
  target_queue text;
  new_payload jsonb;
  current_domain text := 'sends.foundourmarket.com';
  old_from text;
  new_from text;
BEGIN
  IF p_message_id IS NULL OR length(trim(p_message_id)) = 0 THEN
    RETURN jsonb_build_object('replayed', false, 'reason', 'invalid_message_id');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.email_send_log
    WHERE message_id = p_message_id AND status = 'sent'
  ) THEN
    RETURN jsonb_build_object('replayed', false, 'reason', 'already_sent');
  END IF;

  FOREACH base_name IN ARRAY ARRAY['transactional_emails', 'auth_emails'] LOOP
    IF to_regclass(format('pgmq.q_%I_dlq', base_name)) IS NULL THEN
      CONTINUE;
    END IF;

    v_msg_id := NULL;
    v_message := NULL;

    -- Newest copy wins: older duplicates can carry retired sender domains.
    EXECUTE format(
      'SELECT msg_id, message FROM pgmq.q_%I_dlq WHERE message->>''message_id'' = $1 ORDER BY msg_id DESC LIMIT 1',
      base_name
    ) INTO v_msg_id, v_message USING p_message_id;

    IF v_msg_id IS NOT NULL THEN
      found := true;
      target_queue := base_name;

      old_from := v_message->>'from';
      new_from := CASE
        WHEN old_from IS NULL THEN NULL
        ELSE regexp_replace(old_from, '@[^>[:space:]]+', '@' || current_domain)
      END;

      new_payload := v_message || jsonb_build_object(
        'queued_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      );

      IF new_from IS NOT NULL THEN
        new_payload := new_payload || jsonb_build_object('from', new_from);
      END IF;
      IF v_message ? 'sender_domain' THEN
        new_payload := new_payload || jsonb_build_object('sender_domain', current_domain);
      END IF;

      PERFORM pgmq.send(base_name, new_payload);
      PERFORM pgmq.archive(base_name || '_dlq', v_msg_id);
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