BEGIN;

-- ---------------------------------------------------------------------------
-- 0009: an image on a manual feedback entry.
--
-- Some feedback is clearer with a picture: a screenshot someone sent on
-- WhatsApp, a photo of a phone showing the bug. An admin can attach ONE image
-- to a manual entry (0008). It lives in this project's Storage, in a private
-- bucket, and is shown only through the admin's own server, after
-- requireAdmin() -- never by a public or signed URL.
--
-- WHAT GOES IN IT IS THE ADMIN'S CALL, AND THE FORM SAYS SO: no names, faces,
-- numbers, chat headers or cycle data -- crop or blur first. The entry records
-- the channel and never who (0008); an image must not undo that. Two things
-- the server does regardless:
--
--   * it RE-ENCODES every upload to WebP (sharp), which drops EXIF/XMP -- the
--     GPS position and the camera a phone photo carries -- and any payload
--     hidden behind a valid image header;
--   * it accepts only what decodes as JPEG, PNG, WebP or GIF, by content, not
--     by the name or type the browser claims. SVG is refused: it is a script
--     container, not an image.
--
-- So the bucket only ever holds `image/webp`, and the path is
-- `<entry id>/<random uuid>.webp`: a replacement gets a new name, so nothing
-- can serve the old picture under the new one, and the entry id in the path
-- keeps every object traceable to its row.
--
-- ONE WRITE PATH, AS IN 0008: set_manual_feedback_image() stores or clears the
-- path and writes the audit entry in one transaction. The server uploads the
-- object first, then calls it, then deletes the object it replaced; if the
-- call fails it deletes what it just uploaded. The audit log records only
-- added / replaced / removed -- never the path, let alone the picture.
-- ---------------------------------------------------------------------------

ALTER TABLE public.manual_feedback
  ADD COLUMN image_path text
    CONSTRAINT manual_feedback_image_path_check
    CHECK (image_path ~ ('^' || id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'));

COMMENT ON COLUMN public.manual_feedback.image_path IS
  'Object in the private manual-feedback bucket, <id>/<uuid>.webp, or NULL. '
  'Re-encoded on upload, so without metadata -- migration 0009.';

-- ---------------------------------------------------------------------------
-- The bucket. Private, and with no storage.objects policies: only the service
-- role -- this app's server -- can read or write it. 5 MB per object; the
-- server's own limit on what it accepts is the same, and a re-encoded WebP is
-- far below it.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('manual-feedback', 'manual-feedback', false, 5242880, ARRAY['image/webp'])
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- set_manual_feedback_image: store (a path) or clear (NULL) an entry's image,
-- logged. Returns the path it replaced, or NULL, so the caller can delete
-- that object. Setting the path it already has changes and logs nothing.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.set_manual_feedback_image(
  p_id          uuid,
  p_image_path  text,
  p_actor_id    uuid,
  p_actor_label text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old text;
BEGIN
  SELECT image_path INTO v_old FROM public.manual_feedback WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'set_manual_feedback_image: no entry %', p_id USING ERRCODE = 'no_data_found';
  END IF;

  IF v_old IS NOT DISTINCT FROM p_image_path THEN
    RETURN v_old;
  END IF;

  -- The CHECK refuses a path outside this entry's folder; the whole call,
  -- audit entry included, then rolls back.
  UPDATE public.manual_feedback
  SET image_path = p_image_path,
      updated_at = now()
  WHERE id = p_id;

  INSERT INTO public.audit_log (actor_id, actor_label, action, target_type, target_id, details)
  VALUES (p_actor_id, p_actor_label, 'feedback.image_manual', 'manual_feedback', p_id::text,
          jsonb_build_object('image', CASE
            WHEN v_old IS NULL THEN 'added'
            WHEN p_image_path IS NULL THEN 'removed'
            ELSE 'replaced'
          END));

  RETURN v_old;
END;
$$;

REVOKE ALL ON FUNCTION public.set_manual_feedback_image(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_manual_feedback_image(uuid, text, uuid, text) TO service_role;

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY (dashboard SQL editor, which runs as postgres)
--
--   -- 1. The bucket: private, WebP only, 5 MB. Expect manual-feedback, f,
--   --    5242880, {image/webp}. And no policies on storage.objects that name
--   --    it (expect 0 rows).
--   SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'manual-feedback';
--   SELECT policyname FROM pg_policies
--   WHERE schemaname = 'storage' AND tablename = 'objects'
--     AND (qual ILIKE '%manual-feedback%' OR with_check ILIKE '%manual-feedback%');
--
--   -- 2. Grants: service_role calls it, client roles do not. Expect t / f / f.
--   SELECT has_function_privilege('service_role',  'public.set_manual_feedback_image(uuid, text, uuid, text)', 'EXECUTE'),
--          has_function_privilege('authenticated', 'public.set_manual_feedback_image(uuid, text, uuid, text)', 'EXECUTE'),
--          has_function_privilege('anon',          'public.set_manual_feedback_image(uuid, text, uuid, text)', 'EXECUTE');
--
--   -- 3. Behaviour, rolled back: add, the same again (returns the path, logs
--   --    nothing), replace (returns the first), remove (returns the second).
--   --    Audit: image added, replaced, removed -- no path anywhere.
--   BEGIN;
--   SELECT public.save_manual_feedback(NULL, 'whatsapp', 'bug', 'Image test', '2026-10-14', NULL, NULL, NULL, 'system:verify') AS id \gset
--   SELECT public.set_manual_feedback_image(:'id', :'id' || '/00000000-0000-4000-8000-000000000001.webp', NULL, 'system:verify');  -> NULL
--   SELECT public.set_manual_feedback_image(:'id', :'id' || '/00000000-0000-4000-8000-000000000001.webp', NULL, 'system:verify');  -> …0001.webp
--   SELECT public.set_manual_feedback_image(:'id', :'id' || '/00000000-0000-4000-8000-000000000002.webp', NULL, 'system:verify');  -> …0001.webp
--   SELECT public.set_manual_feedback_image(:'id', NULL, NULL, 'system:verify');                                                     -> …0002.webp
--   SELECT action, details FROM public.audit_log WHERE actor_label = 'system:verify' ORDER BY id;
--   ROLLBACK;
--   (The dashboard editor has no \gset: there, copy the returned id by hand.)
--
--   -- 4. Refusals, each rolled back:
--   --    a path in another entry's folder -> manual_feedback_image_path_check
--   --    a .png path                      -> manual_feedback_image_path_check
--   --    a missing entry                  -> no entry
--   BEGIN; SELECT public.save_manual_feedback(NULL, 'email', 'bug', 'x', '2026-10-14', NULL, NULL, NULL, 'system:verify') AS id \gset
--          SELECT public.set_manual_feedback_image(:'id', '00000000-0000-0000-0000-000000000000/00000000-0000-4000-8000-000000000001.webp', NULL, 'system:verify'); ROLLBACK;
--   BEGIN; SELECT public.save_manual_feedback(NULL, 'email', 'bug', 'x', '2026-10-14', NULL, NULL, NULL, 'system:verify') AS id \gset
--          SELECT public.set_manual_feedback_image(:'id', :'id' || '/00000000-0000-4000-8000-000000000001.png', NULL, 'system:verify'); ROLLBACK;
--   BEGIN; SELECT public.set_manual_feedback_image('00000000-0000-0000-0000-0000000000fc', NULL, NULL, 'system:verify'); ROLLBACK;
-- ---------------------------------------------------------------------------
