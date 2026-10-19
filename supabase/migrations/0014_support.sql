BEGIN;

-- ---------------------------------------------------------------------------
-- 0014: the support inbox -- each admin's signature, and notifications.
--
-- Users write to the team from the app (cyclea-app 0069, docs/support.md).
-- The admin reads conversations through the app views support_threads_admin
-- and support_messages_admin and writes only through two app functions,
-- support_team_reply and support_set_status, granted to admin_portal. Nothing
-- of a conversation is stored HERE: no message, no username, no copy.
--
-- What this project gains:
--
--   admins.support_name -- the first name a reply is signed with
--                          ("Stefan" shows in the app as "Stefan · Cyclea
--                          team"). Each admin sets their own on Profile;
--                          replying is blocked until it is set. Changed only
--                          through set_admin_support_name, audited. The name
--                          is an admin's, not an app user's, so the audit
--                          entry may carry it.
--
--   notification kind 'support' -- a thread counts as news when it is
--                          waiting for us (status open) and its
--                          last_user_message_at is newer than what the admin
--                          was told about: item_version is that time, so a
--                          user's follow-up is news again. A thread still
--                          waiting 24 hours after the user's last message
--                          gets ONE reminder, to admins who get support
--                          messages immediately. Emails carry counts and a
--                          link only -- never the message or the username.
--
-- The audit log records that an admin replied to or closed/reopened a thread
-- (written by the server, thread id only) -- never the message text.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The signature. One line, trimmed, 1-40 characters: the same 40 the app's
-- support_messages.team_name allows, so a name saved here is never refused
-- there.
-- ---------------------------------------------------------------------------
ALTER TABLE public.admins
  ADD COLUMN support_name text
    CONSTRAINT admins_support_name_check
    CHECK (
      support_name = btrim(support_name)
      AND length(support_name) BETWEEN 1 AND 40
      AND support_name !~ '[[:cntrl:]]'
    );

COMMENT ON COLUMN public.admins.support_name IS
  'The first name support replies are signed with ("<name> · Cyclea team"). '
  'NULL until the admin sets it; replying needs it. Written only by '
  'set_admin_support_name() -- migration 0014.';

-- service_role's table-wide SELECT on admins (0002) covers the new column;
-- it still has no UPDATE, so the function below is the only way to change it.

-- ---------------------------------------------------------------------------
-- set_admin_support_name: an admin's own signature, with the audit entry, in
-- one transaction. An empty name clears it. Returns whether anything changed.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.set_admin_support_name(
  p_admin_id    uuid,
  p_name        text,
  p_actor_id    uuid,
  p_actor_label text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old  text;
  v_name text := nullif(btrim(p_name), '');
BEGIN
  SELECT support_name INTO v_old FROM public.admins WHERE user_id = p_admin_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'set_admin_support_name: % is not an admin', p_admin_id USING ERRCODE = 'no_data_found';
  END IF;

  IF v_old IS NOT DISTINCT FROM v_name THEN
    RETURN false;
  END IF;

  -- admins_support_name_check refuses an over-long or multi-line name; the
  -- whole call, audit entry included, rolls back.
  UPDATE public.admins SET support_name = v_name WHERE user_id = p_admin_id;

  INSERT INTO public.audit_log (actor_id, actor_label, action, target_type, target_id, details)
  VALUES (p_actor_id, p_actor_label, 'admin.support_name', 'admin', p_admin_id::text,
          jsonb_build_object('from', v_old, 'to', v_name));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.set_admin_support_name(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_admin_support_name(uuid, text, uuid, text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Notifications learn the kind 'support' (as 0012 did for user_report).
-- No "someone must be on Immediately" rule: support is not a store
-- requirement the way reports are (Apple 1.2), and every admin starts on
-- Immediately (no row) anyway.
-- ---------------------------------------------------------------------------
ALTER TABLE public.notification_settings
  DROP CONSTRAINT notification_settings_kind_check,
  ADD CONSTRAINT notification_settings_kind_check
    CHECK (kind IN ('app_feedback', 'content_feedback', 'user_report', 'support'));
ALTER TABLE public.notification_deliveries
  DROP CONSTRAINT notification_deliveries_kind_check,
  ADD CONSTRAINT notification_deliveries_kind_check
    CHECK (kind IN ('app_feedback', 'content_feedback', 'user_report', 'support'));

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY (dashboard SQL editor, which runs as postgres)
--
--   -- 1. Grants: service_role reads the column but cannot write it; only the
--   --    function changes it. Expect t / f / t / f.
--   SELECT has_column_privilege('service_role', 'public.admins', 'support_name', 'SELECT'),
--          has_column_privilege('service_role', 'public.admins', 'support_name', 'UPDATE'),
--          has_function_privilege('service_role', 'public.set_admin_support_name(uuid, text, uuid, text)', 'EXECUTE'),
--          has_function_privilege('authenticated', 'public.set_admin_support_name(uuid, text, uuid, text)', 'EXECUTE');
--
--   -- 2. The signature, rolled back: set -> t; same again -> f; the audit
--   --    entry is admin.support_name with from/to; an over-long or
--   --    two-line name is refused (admins_support_name_check); '' clears it.
--   BEGIN;
--   SELECT public.set_admin_support_name((SELECT user_id FROM public.admins LIMIT 1),
--          '  Stefan ', NULL, 'system:verify');                                   -> t
--   SELECT public.set_admin_support_name((SELECT user_id FROM public.admins LIMIT 1),
--          'Stefan', NULL, 'system:verify');                                      -> f
--   SELECT action, target_type, details FROM public.audit_log
--   WHERE actor_label = 'system:verify';   -> admin.support_name, admin, {"to": "Stefan", "from": null}
--   SELECT public.set_admin_support_name((SELECT user_id FROM public.admins LIMIT 1),
--          '', NULL, 'system:verify');                                            -> t (cleared)
--   ROLLBACK;
--   BEGIN; SELECT public.set_admin_support_name((SELECT user_id FROM public.admins LIMIT 1),
--          repeat('x', 41), NULL, 'system:verify'); ROLLBACK;                     -> check violation
--   BEGIN; SELECT public.set_admin_support_name((SELECT user_id FROM public.admins LIMIT 1),
--          E'Ste\nfan', NULL, 'system:verify'); ROLLBACK;                         -> check violation
--
--   -- 3. The kind, rolled back: support can be set like the others; an
--   --    unknown kind is still refused.
--   BEGIN; SELECT public.set_notification_settings((SELECT user_id FROM public.admins LIMIT 1),
--          '{"support": "daily"}', NULL, 'system:verify'); ROLLBACK;              -> t
--   BEGIN; SELECT public.set_notification_settings((SELECT user_id FROM public.admins LIMIT 1),
--          '{"chat": "daily"}', NULL, 'system:verify'); ROLLBACK;                 -> check violation
-- ---------------------------------------------------------------------------
