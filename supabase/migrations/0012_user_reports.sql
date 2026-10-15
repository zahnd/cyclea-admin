BEGIN;

-- ---------------------------------------------------------------------------
-- 0012: user reports -- what we decided, and who hears about them.
--
-- Abuse reports (cyclea-app 0025) reach the admin through the app view
-- user_reports_admin (0068): the reported account's names, never the
-- reporter, no user ids. What we did about a report lives HERE, like feedback
-- triage: no new write path into the app project.
--
--   report_triage -- status (new / in progress / closed), the action taken
--                    (required once closed), and a note in our words. A
--                    report's record goes when the report does: the app
--                    purges reports after 12 months (0026), and a daily job
--                    here deletes the matching triage rows by the report's
--                    own date. "Account deleted" only records what an admin
--                    did with `make delete-user`; this app never deletes an
--                    app account.
--
-- Notifications (0011) gain the kind 'user_report'. Apple 1.2 wants reports
-- to reach a human, so at least one admin must get them immediately:
-- set_notification_settings refuses a change that would leave none, and the
-- sweep sends to every admin should it ever happen anyway (a revoked admin).
-- The sweep also sends ONE reminder for a report still new after 24 hours.
--
-- The audit log records status and action changes only -- never a username
-- or the reporter's note: audit rows are permanent, reports are not.
-- ---------------------------------------------------------------------------

CREATE TABLE public.report_triage (
  -- user_reports.id in the APP project; no foreign key is possible.
  report_id         uuid        PRIMARY KEY,
  status            text        NOT NULL
                                CONSTRAINT report_triage_status_check
                                CHECK (status IN ('new', 'in_progress', 'closed')),
  action            text        CONSTRAINT report_triage_action_check
                                CHECK (action IN ('no_action', 'warned', 'account_deleted', 'other')),
  note              text        CONSTRAINT report_triage_note_check
                                CHECK (btrim(note) <> '' AND length(note) <= 2000),
  -- The report's own created_at, for the purge below.
  report_created_at timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid,
  updated_by_label  text        NOT NULL CHECK (length(updated_by_label) BETWEEN 1 AND 320),
  CONSTRAINT report_triage_closed_needs_action CHECK (status <> 'closed' OR action IS NOT NULL),
  CONSTRAINT report_triage_actor_known
    CHECK (updated_by IS NOT NULL OR updated_by_label LIKE 'system:%')
);

COMMENT ON TABLE public.report_triage IS
  'What was done about a user report (app project). No row = new. Deleted 12 '
  'months after the report, as the report is -- migration 0012.';

REVOKE ALL ON public.report_triage FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.report_triage TO service_role;
ALTER TABLE public.report_triage ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- set_report_triage: status, action and note, with the audit entry, in one
-- transaction. Returns whether anything changed.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.set_report_triage(
  p_report_id         uuid,
  p_report_created_at timestamptz,
  p_status            text,
  p_action            text,
  p_note              text,
  p_actor_id          uuid,
  p_actor_label       text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old     public.report_triage;
  v_status  text := coalesce(nullif(btrim(p_status), ''), 'new');
  v_action  text := nullif(btrim(p_action), '');
  v_note    text := nullif(btrim(p_note), '');
  v_changes jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO v_old FROM public.report_triage WHERE report_id = p_report_id FOR UPDATE;

  IF coalesce(v_old.status, 'new') IS DISTINCT FROM v_status THEN
    v_changes := v_changes || jsonb_build_object('status',
      jsonb_build_object('from', coalesce(v_old.status, 'new'), 'to', v_status));
  END IF;
  IF v_old.action IS DISTINCT FROM v_action THEN
    v_changes := v_changes || jsonb_build_object('action',
      jsonb_build_object('from', v_old.action, 'to', v_action));
  END IF;
  IF v_old.note IS DISTINCT FROM v_note THEN
    v_changes := v_changes || jsonb_build_object('note_changed', true);
  END IF;

  IF v_changes = '{}'::jsonb THEN
    RETURN false;
  END IF;

  -- The CHECKs refuse a bad status or action, a closed report without an
  -- action, an over-long note; the whole call, audit entry included, rolls back.
  INSERT INTO public.report_triage
    (report_id, status, action, note, report_created_at, updated_at, updated_by, updated_by_label)
  VALUES
    (p_report_id, v_status, v_action, v_note, p_report_created_at, now(), p_actor_id, p_actor_label)
  ON CONFLICT (report_id) DO UPDATE
  SET status           = EXCLUDED.status,
      action           = EXCLUDED.action,
      note             = EXCLUDED.note,
      updated_at       = EXCLUDED.updated_at,
      updated_by       = EXCLUDED.updated_by,
      updated_by_label = EXCLUDED.updated_by_label;

  INSERT INTO public.audit_log (actor_id, actor_label, action, target_type, target_id, details)
  VALUES (p_actor_id, p_actor_label, 'report.triage', 'user_report', p_report_id::text, v_changes);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.set_report_triage(uuid, timestamptz, text, text, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_report_triage(uuid, timestamptz, text, text, text, uuid, text)
  TO service_role;

-- The same 12 months as the app's purge (0026), counted from the report.
SELECT cron.schedule(
  'purge-report-triage',
  '47 3 * * *',
  $job$ DELETE FROM public.report_triage WHERE report_created_at < now() - interval '12 months'; $job$
);

-- ---------------------------------------------------------------------------
-- Notifications learn the kind 'user_report'.
-- ---------------------------------------------------------------------------
ALTER TABLE public.notification_settings
  DROP CONSTRAINT notification_settings_kind_check,
  ADD CONSTRAINT notification_settings_kind_check
    CHECK (kind IN ('app_feedback', 'content_feedback', 'user_report'));
ALTER TABLE public.notification_deliveries
  DROP CONSTRAINT notification_deliveries_kind_check,
  ADD CONSTRAINT notification_deliveries_kind_check
    CHECK (kind IN ('app_feedback', 'content_feedback', 'user_report'));

-- As 0011, plus the rule for reports: after the change, at least one admin
-- must still get them immediately (no row counts as immediate).
CREATE OR REPLACE FUNCTION public.set_notification_settings(
  p_admin_id    uuid,
  p_settings    jsonb,
  p_actor_id    uuid,
  p_actor_label text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_kind    text;
  v_mode    text;
  v_old     text;
  v_changes jsonb := '{}'::jsonb;
BEGIN
  -- Serialises with grant/revoke and with another admin changing their
  -- settings, so two admins cannot both switch reports off at once.
  LOCK TABLE public.admins IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.notification_settings IN SHARE ROW EXCLUSIVE MODE;

  IF NOT EXISTS (SELECT 1 FROM public.admins WHERE user_id = p_admin_id) THEN
    RAISE EXCEPTION 'set_notification_settings: % is not an admin', p_admin_id USING ERRCODE = 'no_data_found';
  END IF;
  IF jsonb_typeof(p_settings) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'set_notification_settings: settings must be an object' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  FOR v_kind, v_mode IN SELECT key, value FROM jsonb_each_text(p_settings) LOOP
    SELECT mode INTO v_old FROM public.notification_settings
    WHERE admin_id = p_admin_id AND kind = v_kind;
    v_old := coalesce(v_old, 'immediate');
    CONTINUE WHEN v_old = v_mode;

    INSERT INTO public.notification_settings (admin_id, kind, mode, updated_at)
    VALUES (p_admin_id, v_kind, v_mode, now())
    ON CONFLICT (admin_id, kind) DO UPDATE SET mode = EXCLUDED.mode, updated_at = EXCLUDED.updated_at;

    v_changes := v_changes || jsonb_build_object(v_kind, jsonb_build_object('from', v_old, 'to', v_mode));
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM public.admins a
    LEFT JOIN public.notification_settings s ON s.admin_id = a.user_id AND s.kind = 'user_report'
    WHERE coalesce(s.mode, 'immediate') = 'immediate'
  ) THEN
    RAISE EXCEPTION 'set_notification_settings: user_report_needs_one_immediate'
      USING ERRCODE = 'check_violation',
            HINT = 'At least one admin must get user reports immediately (Apple 1.2).';
  END IF;

  IF v_changes = '{}'::jsonb THEN
    RETURN false;
  END IF;

  INSERT INTO public.audit_log (actor_id, actor_label, action, target_type, target_id, details)
  VALUES (p_actor_id, p_actor_label, 'notification.settings', 'admin', p_admin_id::text, v_changes);
  RETURN true;
END;
$$;

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY (dashboard SQL editor, which runs as postgres)
--
--   -- 1. Grants and the purge job. Expect t / f / f, and purge-report-triage.
--   SELECT has_table_privilege('service_role',  'public.report_triage', 'SELECT'),
--          has_table_privilege('service_role',  'public.report_triage', 'INSERT'),
--          has_function_privilege('authenticated', 'public.set_report_triage(uuid, timestamptz, text, text, text, uuid, text)', 'EXECUTE');
--   SELECT jobname, schedule FROM cron.job WHERE jobname = 'purge-report-triage';
--
--   -- 2. Triage, rolled back: in progress -> t; closed without an action ->
--   --    report_triage_closed_needs_action; closed with one -> t. Audit:
--   --    report.triage -> user_report, status/action/note_changed only.
--   BEGIN;
--   SELECT public.set_report_triage('00000000-0000-4000-8000-0000000000a1', now(),
--          'in_progress', NULL, 'looking', NULL, 'system:verify');            -> t
--   SELECT public.set_report_triage('00000000-0000-4000-8000-0000000000a1', now(),
--          'closed', 'no_action', 'nothing to act on', NULL, 'system:verify'); -> t
--   SELECT action, target_type, details FROM public.audit_log
--   WHERE actor_label = 'system:verify' ORDER BY id;
--   ROLLBACK;
--   BEGIN; SELECT public.set_report_triage('00000000-0000-4000-8000-0000000000a2', now(),
--          'closed', NULL, NULL, NULL, 'system:verify'); ROLLBACK;          -> check violation
--
--   -- 3. The reports rule, rolled back: with one admin, switching user_report
--   --    to off is refused (user_report_needs_one_immediate); another kind
--   --    still changes.
--   BEGIN; SELECT public.set_notification_settings((SELECT user_id FROM public.admins LIMIT 1),
--          '{"user_report": "off"}', NULL, 'system:verify'); ROLLBACK;     -> refused
--   BEGIN; SELECT public.set_notification_settings((SELECT user_id FROM public.admins LIMIT 1),
--          '{"app_feedback": "daily"}', NULL, 'system:verify'); ROLLBACK;  -> t
-- ---------------------------------------------------------------------------
