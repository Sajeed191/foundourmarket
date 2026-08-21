-- ============================================================
-- Zero-Trust v9.0 — customer upload type allow-list (server-side)
-- Client-side accept="" is UX only. These checks are the boundary.
-- Existing objects are untouched; only new uploads are validated.
-- ============================================================

CREATE OR REPLACE FUNCTION public.storage_upload_ext_allowed(_name text, _kind text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _name IS NULL OR position('.' in _name) = 0 THEN false
    ELSE lower(regexp_replace(_name, '^.*\.', '')) = ANY (
      CASE _kind
        WHEN 'image' THEN ARRAY['jpg','jpeg','png','webp','avif','gif','heic','heif']
        WHEN 'image_video' THEN ARRAY['jpg','jpeg','png','webp','avif','gif','heic','heif','mp4','webm','mov','m4v']
        WHEN 'image_doc' THEN ARRAY['jpg','jpeg','png','webp','avif','gif','heic','heif','pdf']
        ELSE ARRAY[]::text[]
      END
    )
  END
$$;

GRANT EXECUTE ON FUNCTION public.storage_upload_ext_allowed(text, text) TO authenticated, anon, service_role;

-- avatars ------------------------------------------------------
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND public.storage_upload_ext_allowed(name, 'image')
);

DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (auth.uid())::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND public.storage_upload_ext_allowed(name, 'image')
);

-- review-media -------------------------------------------------
DROP POLICY IF EXISTS "review media user upload" ON storage.objects;
CREATE POLICY "review media user upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'review-media'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND public.storage_upload_ext_allowed(name, 'image_video')
);

-- return-photos ------------------------------------------------
DROP POLICY IF EXISTS "Users manage own return photos - insert" ON storage.objects;
CREATE POLICY "Users manage own return photos - insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'return-photos'
  AND (storage.foldername(name))[1] = (auth.uid())::text
  AND public.storage_upload_ext_allowed(name, 'image')
);

-- support-attachments ------------------------------------------
DROP POLICY IF EXISTS "support-attachments insert own" ON storage.objects;
CREATE POLICY "support-attachments insert own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'support-attachments'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND public.storage_upload_ext_allowed(name, 'image_doc')
);

DROP POLICY IF EXISTS "support-attachments update own" ON storage.objects;
CREATE POLICY "support-attachments update own"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND (auth.uid())::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'support-attachments'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND public.storage_upload_ext_allowed(name, 'image_doc')
);

-- ============================================================
-- Fixed search_path on the last 4 SECURITY DEFINER functions
-- that lacked one (service_role-only email queue helpers).
-- ============================================================
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;