BEGIN;

-- ---------------------------------------------------------------------------
-- 0008: feedback -- manual entries, and triage for every kind.
--
-- App feedback moves out of Slack and into this admin (Feedback in the top
-- bar). What users send from the app stays in the APP project (`app_feedback`,
-- read through the `app_feedback_admin` view, cyclea-app 0066). Feedback that
-- reaches us any other way -- WhatsApp, in person, email -- is entered here
-- by an admin, so everything about the app sits in one list. The page joins
-- both sources in the Next.js server, like every other cross-project read.
--
-- TWO TABLES:
--
--   manual_feedback  -- feedback an admin typed in. NO IDENTITY, by decision
--                       (2026-10-14): only the channel it came through. Who
--                       said it stays in WhatsApp or wherever it was said, so
--                       there is nothing here to correlate, or to delete on
--                       request. `about` is 'app' for now; 'content' joins
--                       with the content feedback page.
--
--   feedback_triage  -- what we decided about one item of either kind:
--                       status, note, link. NO ROW MEANS NEW, so app feedback
--                       needs no sync into this project to show up.
--
-- APP FEEDBACK IS NEVER COPIED HERE. Deleting an app account cascades its
-- feedback away in the app project, and nothing there can reach this one;
-- keeping the text out of here is what keeps that deletion complete. The
-- triage note is our own words about the work, and the form says so.
--
-- STATES: new -> in_progress -> done | wont_fix, but any may follow any other:
-- a manual record must allow corrections, and the audit log keeps the path.
--
-- ONE WRITE PATH PER TABLE, each writing its audit entry in the same
-- transaction. The actor is a parameter rather than auth.uid(), because the
-- server calls these with the secret key -- and so that a later agent (the
-- MCP endpoint, its own task) can be recorded acting on behalf of an admin
-- without new functions. The audit log never receives a message or a note:
-- its rows can never be removed.
-- ---------------------------------------------------------------------------

CREATE TABLE public.manual_feedback (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  about            text        NOT NULL DEFAULT 'app'
                               CONSTRAINT manual_feedback_about_check CHECK (about IN ('app')),
  -- The channel it came through. Never who.
  source           text        NOT NULL
                               CONSTRAINT manual_feedback_source_check
                               CHECK (source IN ('whatsapp', 'in_person', 'email', 'other')),
  -- The same categories the app offers (app migration 0043).
  category         text        NOT NULL
                               CONSTRAINT manual_feedback_category_check
                               CHECK (category IN ('bug', 'idea', 'other')),
  message          text        NOT NULL
                               CONSTRAINT manual_feedback_message_check
                               CHECK (btrim(message) <> '' AND length(message) <= 4000),
  -- When it was said, which can be days before it was typed in.
  received_on      date        NOT NULL,
  app_version      text        CONSTRAINT manual_feedback_app_version_check
                               CHECK (btrim(app_version) <> '' AND length(app_version) <= 64),
  platform         text        CONSTRAINT manual_feedback_platform_check
                               CHECK (platform IN ('ios', 'android')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid,
  created_by_label text        NOT NULL CHECK (length(created_by_label) BETWEEN 1 AND 320),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manual_feedback_actor_known
    CHECK (created_by IS NOT NULL OR created_by_label LIKE 'system:%')
);

COMMENT ON TABLE public.manual_feedback IS
  'Feedback an admin entered (WhatsApp, in person, email). Never who gave it, '
  'only the channel -- migration 0008.';

CREATE TABLE public.feedback_triage (
  -- Which table feedback_id points into: 'app' = app_feedback in the APP
  -- project (no foreign key is possible across projects), 'manual' =
  -- manual_feedback here.
  kind             text        NOT NULL
                               CONSTRAINT feedback_triage_kind_check CHECK (kind IN ('app', 'manual')),
  feedback_id      uuid        NOT NULL,
  status           text        NOT NULL
                               CONSTRAINT feedback_triage_status_check
                               CHECK (status IN ('new', 'in_progress', 'done', 'wont_fix')),
  note             text        CONSTRAINT feedback_triage_note_check
                               CHECK (btrim(note) <> '' AND length(note) <= 2000),
  -- Any https link: unlike a contract, nothing sensitive sits behind it.
  link             text        CONSTRAINT feedback_triage_link_check
                               CHECK (length(link) <= 500 AND link ~ '^https://\S+$'),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- Who last changed it, as in audit_log: an id, or a 'system:' label.
  updated_by       uuid,
  updated_by_label text        NOT NULL CHECK (length(updated_by_label) BETWEEN 1 AND 320),
  PRIMARY KEY (kind, feedback_id),
  CONSTRAINT feedback_triage_actor_known
    CHECK (updated_by IS NOT NULL OR updated_by_label LIKE 'system:%')
);

COMMENT ON TABLE public.feedback_triage IS
  'Triage state of feedback of every kind. No row = new. Never holds an app '
  'user''s message -- migration 0008.';

REVOKE ALL ON public.manual_feedback FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.feedback_triage FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.manual_feedback TO service_role;
GRANT SELECT ON public.feedback_triage TO service_role;
ALTER TABLE public.manual_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_triage ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- save_manual_feedback: create (p_id NULL) or edit an entry, logged.
--
-- Returns the entry's id. An edit that changes nothing logs nothing. The log
-- names the fields that changed -- source, category, date, version and
-- platform FROM and TO, the message only as changed.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.save_manual_feedback(
  p_id          uuid,
  p_source      text,
  p_category    text,
  p_message     text,
  p_received_on date,
  p_app_version text,
  p_platform    text,
  p_actor_id    uuid,
  p_actor_label text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old     public.manual_feedback;
  v_id      uuid;
  v_message text := btrim(p_message);
  v_version text := nullif(btrim(p_app_version), '');
  v_changes jsonb := '{}'::jsonb;
BEGIN
  IF p_id IS NULL THEN
    -- The CHECKs refuse a bad value; the whole call then rolls back.
    INSERT INTO public.manual_feedback
      (source, category, message, received_on, app_version, platform, created_by, created_by_label)
    VALUES
      (p_source, p_category, v_message, p_received_on, v_version, p_platform, p_actor_id, p_actor_label)
    RETURNING id INTO v_id;

    INSERT INTO public.audit_log (actor_id, actor_label, action, target_type, target_id, details)
    VALUES (p_actor_id, p_actor_label, 'feedback.create_manual', 'manual_feedback', v_id::text,
            jsonb_build_object('source', p_source, 'category', p_category, 'received_on', p_received_on));
    RETURN v_id;
  END IF;

  SELECT * INTO v_old FROM public.manual_feedback WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'save_manual_feedback: no entry %', p_id USING ERRCODE = 'no_data_found';
  END IF;

  IF v_old.source IS DISTINCT FROM p_source THEN
    v_changes := v_changes || jsonb_build_object('source', jsonb_build_object('from', v_old.source, 'to', p_source));
  END IF;
  IF v_old.category IS DISTINCT FROM p_category THEN
    v_changes := v_changes || jsonb_build_object('category', jsonb_build_object('from', v_old.category, 'to', p_category));
  END IF;
  IF v_old.received_on IS DISTINCT FROM p_received_on THEN
    v_changes := v_changes || jsonb_build_object('received_on', jsonb_build_object('from', v_old.received_on, 'to', p_received_on));
  END IF;
  IF v_old.app_version IS DISTINCT FROM v_version THEN
    v_changes := v_changes || jsonb_build_object('app_version', jsonb_build_object('from', v_old.app_version, 'to', v_version));
  END IF;
  IF v_old.platform IS DISTINCT FROM p_platform THEN
    v_changes := v_changes || jsonb_build_object('platform', jsonb_build_object('from', v_old.platform, 'to', p_platform));
  END IF;
  IF v_old.message IS DISTINCT FROM v_message THEN
    v_changes := v_changes || jsonb_build_object('message_changed', true);
  END IF;

  IF v_changes = '{}'::jsonb THEN
    RETURN p_id;
  END IF;

  UPDATE public.manual_feedback
  SET source      = p_source,
      category    = p_category,
      message     = v_message,
      received_on = p_received_on,
      app_version = v_version,
      platform    = p_platform,
      updated_at  = now()
  WHERE id = p_id;

  INSERT INTO public.audit_log (actor_id, actor_label, action, target_type, target_id, details)
  VALUES (p_actor_id, p_actor_label, 'feedback.update_manual', 'manual_feedback', p_id::text, v_changes);

  RETURN p_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- set_feedback_triage: status, note and link of one item, logged.
--
-- Empty note or link -> NULL, so "cleared" has one representation. Returns
-- false and logs nothing when nothing changed. Status and link are logged
-- FROM and TO; the note only as changed, because a note might, against the
-- advice on the form, paraphrase what a user wrote.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.set_feedback_triage(
  p_kind        text,
  p_feedback_id uuid,
  p_status      text,
  p_note        text,
  p_link        text,
  p_actor_id    uuid,
  p_actor_label text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old     public.feedback_triage;
  v_status  text := coalesce(nullif(btrim(p_status), ''), 'new');
  v_note    text := nullif(btrim(p_note), '');
  v_link    text := nullif(btrim(p_link), '');
  v_from    text;
  v_changes jsonb := '{}'::jsonb;
BEGIN
  -- A manual entry must exist; app feedback lives in the other project and
  -- cannot be checked from here.
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

  IF v_changes = '{}'::jsonb THEN
    RETURN false;
  END IF;

  -- The CHECKs refuse a bad kind, status, note or link; the whole call, audit
  -- entry included, then rolls back.
  INSERT INTO public.feedback_triage
    (kind, feedback_id, status, note, link, updated_at, updated_by, updated_by_label)
  VALUES
    (p_kind, p_feedback_id, v_status, v_note, v_link, now(), p_actor_id, p_actor_label)
  ON CONFLICT (kind, feedback_id) DO UPDATE
    SET status           = EXCLUDED.status,
        note             = EXCLUDED.note,
        link             = EXCLUDED.link,
        updated_at       = EXCLUDED.updated_at,
        updated_by       = EXCLUDED.updated_by,
        updated_by_label = EXCLUDED.updated_by_label;

  -- target_type 'app_feedback' or 'manual_feedback', so the audit page can
  -- link to the right item.
  INSERT INTO public.audit_log (actor_id, actor_label, action, target_type, target_id, details)
  VALUES (p_actor_id, p_actor_label, 'feedback.triage', p_kind || '_feedback', p_feedback_id::text, v_changes);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.save_manual_feedback(uuid, text, text, text, date, text, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_feedback_triage(text, uuid, text, text, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_manual_feedback(uuid, text, text, text, date, text, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_feedback_triage(text, uuid, text, text, text, uuid, text) TO service_role;

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY (dashboard SQL editor, which runs as postgres)
--
--   -- 1. Grants: service_role reads both tables and calls both functions; it
--   --    cannot write the tables directly; client roles get nothing.
--   --    Expect t,t,f,f,t,t / f,f,f,f.
--   SELECT has_table_privilege('service_role', 'public.manual_feedback', 'SELECT')   AS sr_manual,
--          has_table_privilege('service_role', 'public.feedback_triage', 'SELECT')   AS sr_triage,
--          has_table_privilege('service_role', 'public.manual_feedback', 'UPDATE')   AS sr_manual_update,
--          has_table_privilege('service_role', 'public.feedback_triage', 'TRUNCATE') AS sr_triage_truncate,
--          has_function_privilege('service_role', 'public.save_manual_feedback(uuid, text, text, text, date, text, text, uuid, text)', 'EXECUTE') AS sr_save,
--          has_function_privilege('service_role', 'public.set_feedback_triage(text, uuid, text, text, text, uuid, text)', 'EXECUTE') AS sr_triage_fn;
--   SELECT has_table_privilege('anon',          'public.manual_feedback', 'SELECT') AS anon_manual,
--          has_table_privilege('authenticated', 'public.feedback_triage', 'SELECT') AS auth_triage,
--          has_function_privilege('anon',          'public.save_manual_feedback(uuid, text, text, text, date, text, text, uuid, text)', 'EXECUTE') AS anon_save,
--          has_function_privilege('authenticated', 'public.set_feedback_triage(text, uuid, text, text, text, uuid, text)', 'EXECUTE') AS auth_triage_fn;
--
--   -- 2. Behaviour, rolled back: a manual entry is created, edited (a real
--   --    change, then none), triaged; app feedback is triaged by id. Then the
--   --    audit entries: create_manual, update_manual (message only as
--   --    message_changed), 2 x triage with target types manual_feedback and
--   --    app_feedback -- and no message or note text anywhere.
--   BEGIN;
--   SELECT public.save_manual_feedback(NULL, 'whatsapp', 'bug', 'Calendar is empty', '2026-10-13', '1.1.0', 'ios', NULL, 'system:verify') AS id \gset
--   SELECT public.save_manual_feedback(:'id', 'whatsapp', 'bug', 'Calendar stays empty', '2026-10-13', '1.1.0', 'ios', NULL, 'system:verify');
--   SELECT public.save_manual_feedback(:'id', 'whatsapp', 'bug', 'Calendar stays empty', '2026-10-13', '1.1.0', 'ios', NULL, 'system:verify');
--   SELECT public.set_feedback_triage('manual', :'id', 'in_progress', NULL, 'https://github.com/x/y/pull/1', NULL, 'system:verify');
--   SELECT public.set_feedback_triage('app', '00000000-0000-0000-0000-0000000000fb', 'done', 'Fixed', NULL, NULL, 'system:verify');
--   SELECT public.set_feedback_triage('app', '00000000-0000-0000-0000-0000000000fb', 'done', 'Fixed', NULL, NULL, 'system:verify');  -> f
--   SELECT action, target_type, details FROM public.audit_log WHERE actor_label = 'system:verify' ORDER BY id;
--   ROLLBACK;
--   (The dashboard editor has no \gset: there, copy the returned id by hand.)
--
--   -- 3. Refusals, each rolled back:
--   --    an unknown source            -> manual_feedback_source_check
--   --    an empty message             -> manual_feedback_message_check
--   --    triage of a missing entry    -> no manual entry
--   --    an unknown status            -> feedback_triage_status_check
--   --    an http:// link              -> feedback_triage_link_check
--   BEGIN; SELECT public.save_manual_feedback(NULL, 'phone', 'bug', 'x', '2026-10-13', NULL, NULL, NULL, 'system:verify'); ROLLBACK;
--   BEGIN; SELECT public.save_manual_feedback(NULL, 'email', 'bug', '  ', '2026-10-13', NULL, NULL, NULL, 'system:verify'); ROLLBACK;
--   BEGIN; SELECT public.set_feedback_triage('manual', '00000000-0000-0000-0000-0000000000fc', 'done', NULL, NULL, NULL, 'system:verify'); ROLLBACK;
--   BEGIN; SELECT public.set_feedback_triage('app', '00000000-0000-0000-0000-0000000000fb', 'closed', NULL, NULL, NULL, 'system:verify'); ROLLBACK;
--   BEGIN; SELECT public.set_feedback_triage('app', '00000000-0000-0000-0000-0000000000fb', 'done', NULL, 'http://example.com', NULL, 'system:verify'); ROLLBACK;
-- ---------------------------------------------------------------------------
