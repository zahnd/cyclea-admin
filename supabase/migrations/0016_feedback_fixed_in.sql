BEGIN;

-- ---------------------------------------------------------------------------
-- 0016: the app version a fix shipped in, on every triage row.
--
-- Status, note and link (0008) said what we did; which release carries the
-- fix ended up in the note, if anywhere. With 'verification_pending' (0015)
-- that version is the question -- has anyone on it confirmed the fix? -- so
-- it gets its own column.
--
-- FORMAT: what the app reports as app_version, '1.2.0+33' (version + build
-- number, cyclea-app lib/feedback/app_feedback_flow.dart), with the build
-- optional: '1.2.0'. Strict on purpose, so that a later "feedback from that
-- version or newer" comparison has clean data to work with. Optional for
-- every status and every kind; a content fix made in Directus has none.
--
-- A version is not personal data: the audit log records it FROM and TO, like
-- the status and the link.
--
-- set_feedback_triage() gains p_fixed_in. A parameter cannot be added with
-- CREATE OR REPLACE, so the 7-argument function is dropped and recreated.
-- p_fixed_in DEFAULT NULL keeps the code still deployed when this runs
-- working (it calls by name, without p_fixed_in); no row has a version yet,
-- so nothing can be cleared by it in the meantime.
-- ---------------------------------------------------------------------------

ALTER TABLE public.feedback_triage
  ADD COLUMN fixed_in text
    CONSTRAINT feedback_triage_fixed_in_check
    CHECK (length(fixed_in) <= 64 AND fixed_in ~ '^\d+\.\d+\.\d+(\+\d+)?$');

COMMENT ON COLUMN public.feedback_triage.fixed_in IS
  'The app version that contains the fix, 1.2.0 or 1.2.0+33 (build optional) '
  '-- migration 0016.';

DROP FUNCTION public.set_feedback_triage(text, uuid, text, text, text, uuid, text);

-- ---------------------------------------------------------------------------
-- set_feedback_triage: status, note, link and fixed-in version of one item,
-- logged. As in 0008: empty -> NULL, false and no log entry when nothing
-- changed, the note only as changed.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.set_feedback_triage(
  p_kind        text,
  p_feedback_id uuid,
  p_status      text,
  p_note        text,
  p_link        text,
  p_actor_id    uuid,
  p_actor_label text,
  p_fixed_in    text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old      public.feedback_triage;
  v_status   text := coalesce(nullif(btrim(p_status), ''), 'new');
  v_note     text := nullif(btrim(p_note), '');
  v_link     text := nullif(btrim(p_link), '');
  v_fixed_in text := nullif(btrim(p_fixed_in), '');
  v_from     text;
  v_changes  jsonb := '{}'::jsonb;
BEGIN
  -- A manual entry must exist; app and content feedback live in the other
  -- project and cannot be checked from here.
  IF p_kind = 'manual' AND NOT EXISTS (SELECT 1 FROM public.manual_feedback WHERE id = p_feedback_id) THEN
    RAISE EXCEPTION 'set_feedback_triage: no manual entry %', p_feedback_id USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_old FROM public.feedback_triage
  WHERE kind = p_kind AND feedback_id = p_feedback_id FOR UPDATE;
  v_from := coalesce(v_old.status, 'new');

  IF v_from IS DISTINCT FROM v_status THEN
    v_changes := v_changes || jsonb_build_object('status',
      jsonb_build_object('from', v_from, 'to', v_status));
  END IF;
  IF v_old.note IS DISTINCT FROM v_note THEN
    v_changes := v_changes || jsonb_build_object('note_changed', true);
  END IF;
  IF v_old.link IS DISTINCT FROM v_link THEN
    v_changes := v_changes || jsonb_build_object('link',
      jsonb_build_object('from', v_old.link, 'to', v_link));
  END IF;
  IF v_old.fixed_in IS DISTINCT FROM v_fixed_in THEN
    v_changes := v_changes || jsonb_build_object('fixed_in',
      jsonb_build_object('from', v_old.fixed_in, 'to', v_fixed_in));
  END IF;

  IF v_changes = '{}'::jsonb THEN
    RETURN false;
  END IF;

  -- The CHECKs refuse a bad kind, status, note, link or version; the whole
  -- call, audit entry included, then rolls back.
  INSERT INTO public.feedback_triage
    (kind, feedback_id, status, note, link, fixed_in, updated_at, updated_by, updated_by_label)
  VALUES
    (p_kind, p_feedback_id, v_status, v_note, v_link, v_fixed_in, now(), p_actor_id, p_actor_label)
  ON CONFLICT (kind, feedback_id) DO UPDATE
    SET status           = EXCLUDED.status,
        note             = EXCLUDED.note,
        link             = EXCLUDED.link,
        fixed_in         = EXCLUDED.fixed_in,
        updated_at       = EXCLUDED.updated_at,
        updated_by       = EXCLUDED.updated_by,
        updated_by_label = EXCLUDED.updated_by_label;

  -- target_type 'app_feedback', 'manual_feedback' or 'content_feedback', so
  -- the audit page can link to the right item.
  INSERT INTO public.audit_log (actor_id, actor_label, action, target_type, target_id, details)
  VALUES (p_actor_id, p_actor_label, 'feedback.triage', p_kind || '_feedback', p_feedback_id::text, v_changes);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.set_feedback_triage(text, uuid, text, text, text, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_feedback_triage(text, uuid, text, text, text, uuid, text, text) TO service_role;

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY (dashboard SQL editor, which runs as postgres)
--
--   -- 1. The column's constraint, and one function left. Expect
--   --    CHECK (((length(fixed_in) <= 64) AND (fixed_in ~ '^\d+\.\d+\.\d+(\+\d+)?$'::text)))
--   --    and a single row with the 8 arguments.
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'feedback_triage_fixed_in_check';
--   SELECT oid::regprocedure FROM pg_proc WHERE proname = 'set_feedback_triage';
--
--   -- 2. Grants: service_role may call it, client roles may not. Expect t, f, f.
--   SELECT has_function_privilege('service_role',  'public.set_feedback_triage(text, uuid, text, text, text, uuid, text, text)', 'EXECUTE') AS sr,
--          has_function_privilege('anon',          'public.set_feedback_triage(text, uuid, text, text, text, uuid, text, text)', 'EXECUTE') AS anon,
--          has_function_privilege('authenticated', 'public.set_feedback_triage(text, uuid, text, text, text, uuid, text, text)', 'EXECUTE') AS auth;
--
--   -- 3. Behaviour, rolled back: a version is saved and logged from/to; the
--   --    same call again changes nothing; a call without p_fixed_in (the old
--   --    shape) still works.
--   BEGIN;
--   SELECT public.set_feedback_triage('app', '00000000-0000-4000-8000-0000000000f6', 'verification_pending',
--                                     NULL, NULL, NULL, 'system:verify', '1.2.0+33');            -> t
--   SELECT public.set_feedback_triage('app', '00000000-0000-4000-8000-0000000000f6', 'verification_pending',
--                                     NULL, NULL, NULL, 'system:verify', '1.2.0+33');            -> f
--   SELECT public.set_feedback_triage('app', '00000000-0000-4000-8000-0000000000f7', 'done',
--                                     NULL, NULL, NULL, 'system:verify');                        -> t
--   SELECT target_id, details FROM public.audit_log WHERE actor_label = 'system:verify' ORDER BY id;
--   --    -> f6: status new -> verification_pending, fixed_in null -> 1.2.0+33; f7: status only
--   ROLLBACK;
--
--   -- 4. A version in another format is refused (feedback_triage_fixed_in_check).
--   BEGIN; SELECT public.set_feedback_triage('app', gen_random_uuid(), 'done', NULL, NULL, NULL, 'system:verify', '1.2'); ROLLBACK;
-- ---------------------------------------------------------------------------
