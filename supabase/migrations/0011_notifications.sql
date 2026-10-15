BEGIN;

-- ---------------------------------------------------------------------------
-- 0011: email notifications, per admin.
--
-- Feedback reaches the admin, but nothing says so until someone opens it. From
-- here, each admin chooses per kind -- app feedback, content notes (user
-- reports join in 0012) -- whether to hear about it Immediately, in a Daily
-- digest (08:00 Zürich) or not at all. No row means Immediately, so a new
-- admin misses nothing until they choose.
--
-- HOW IT RUNS: pg_cron calls the admin's own endpoint every 5 minutes
-- (POST /api/notifications/sweep, with a bearer secret kept in Vault -- never
-- in this file). The endpoint reads the app project's views, works out what
-- each admin has not been told yet, sends at most one email per admin, and
-- records what it sent. Nothing changes in the app's Edge Functions, and a
-- failed call is only a delay: the next sweep finds the same items.
--
-- WHAT IS STORED: which admin was told about which item and when -- ids and
-- times only. Never a message, a note, a title or a username; the emails do
-- not carry user text either (they say what arrived and link here). The
-- delivery log is purged after 90 days.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Settings: one row per admin and kind that differs from the default.
-- ---------------------------------------------------------------------------
CREATE TABLE public.notification_settings (
  admin_id   uuid        NOT NULL REFERENCES public.admins (user_id) ON DELETE CASCADE,
  kind       text        NOT NULL
                         CONSTRAINT notification_settings_kind_check
                         CHECK (kind IN ('app_feedback', 'content_feedback')),
  mode       text        NOT NULL
                         CONSTRAINT notification_settings_mode_check
                         CHECK (mode IN ('immediate', 'daily', 'off')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (admin_id, kind)
);

COMMENT ON TABLE public.notification_settings IS
  'How each admin hears about each kind of feedback. No row = immediate. '
  'Written only by set_notification_settings() -- migration 0011.';

-- ---------------------------------------------------------------------------
-- Deliveries: what each admin was told about, so nothing is sent twice.
-- item_version is the item's created_at -- or, for a content rating, the
-- time its note last changed, so an edited note is news once more.
-- ---------------------------------------------------------------------------
CREATE TABLE public.notification_deliveries (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id     uuid        NOT NULL REFERENCES public.admins (user_id) ON DELETE CASCADE,
  kind         text        NOT NULL
                           CONSTRAINT notification_deliveries_kind_check
                           CHECK (kind IN ('app_feedback', 'content_feedback')),
  item_id      uuid        NOT NULL,
  item_version timestamptz NOT NULL,
  mode         text        NOT NULL
                           CONSTRAINT notification_deliveries_mode_check
                           CHECK (mode IN ('immediate', 'daily', 'reminder')),
  sent_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_deliveries_once UNIQUE (admin_id, kind, item_id, item_version, mode)
);

CREATE INDEX notification_deliveries_sent_at ON public.notification_deliveries (sent_at);

COMMENT ON TABLE public.notification_deliveries IS
  'Which admin was told about which item, ids and times only. Purged after '
  '90 days -- migration 0011.';

-- When each admin's last daily digest went out.
CREATE TABLE public.notification_digests (
  admin_id     uuid        PRIMARY KEY REFERENCES public.admins (user_id) ON DELETE CASCADE,
  last_sent_at timestamptz NOT NULL
);

-- One row: a lease, so two sweeps never run at once, and the moment the
-- feature went live -- the first sweep ignores everything older.
CREATE TABLE public.notification_sweep (
  id           boolean     PRIMARY KEY DEFAULT true CONSTRAINT notification_sweep_one_row CHECK (id),
  locked_until timestamptz NOT NULL DEFAULT '-infinity',
  launched_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.notification_sweep DEFAULT VALUES;

-- 0001's lesson: everything off, then exactly what the server needs.
REVOKE ALL ON public.notification_settings, public.notification_deliveries,
              public.notification_digests, public.notification_sweep
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.notification_settings, public.notification_deliveries,
                public.notification_digests, public.notification_sweep
  TO service_role;
ALTER TABLE public.notification_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_digests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_sweep      ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- set_notification_settings: an admin's choices, e.g.
-- {"app_feedback": "immediate", "content_feedback": "daily"}, with an audit
-- entry listing what changed (kinds and modes only). Returns whether anything
-- did. Kinds left out stay as they are.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.set_notification_settings(
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
  IF NOT EXISTS (SELECT 1 FROM public.admins WHERE user_id = p_admin_id) THEN
    RAISE EXCEPTION 'set_notification_settings: % is not an admin', p_admin_id USING ERRCODE = 'no_data_found';
  END IF;
  IF jsonb_typeof(p_settings) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'set_notification_settings: settings must be an object' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  FOR v_kind, v_mode IN SELECT key, value FROM jsonb_each_text(p_settings) LOOP
    SELECT mode INTO v_old FROM public.notification_settings
    WHERE admin_id = p_admin_id AND kind = v_kind FOR UPDATE;
    v_old := coalesce(v_old, 'immediate');
    CONTINUE WHEN v_old = v_mode;

    -- The CHECKs refuse an unknown kind or mode; the whole call rolls back.
    INSERT INTO public.notification_settings (admin_id, kind, mode, updated_at)
    VALUES (p_admin_id, v_kind, v_mode, now())
    ON CONFLICT (admin_id, kind) DO UPDATE SET mode = EXCLUDED.mode, updated_at = EXCLUDED.updated_at;

    v_changes := v_changes || jsonb_build_object(v_kind, jsonb_build_object('from', v_old, 'to', v_mode));
  END LOOP;

  IF v_changes = '{}'::jsonb THEN
    RETURN false;
  END IF;

  INSERT INTO public.audit_log (actor_id, actor_label, action, target_type, target_id, details)
  VALUES (p_actor_id, p_actor_label, 'notification.settings', 'admin', p_admin_id::text, v_changes);
  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- The sweep's lease. claim returns launched_at when this sweep may run, NULL
-- when another one holds the lease. A sweep that dies keeps it until it
-- expires, so the next-but-one sweep runs again.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.claim_notification_sweep(p_lease_seconds integer DEFAULT 240)
RETURNS timestamptz
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.notification_sweep
  SET locked_until = now() + make_interval(secs => p_lease_seconds)
  WHERE id AND locked_until < now()
  RETURNING launched_at;
$$;

CREATE FUNCTION public.release_notification_sweep()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.notification_sweep SET locked_until = '-infinity' WHERE id;
$$;

-- ---------------------------------------------------------------------------
-- record_notification_deliveries: after an email went out, what it covered:
-- [{"admin_id", "kind", "item_id", "item_version", "mode"}, ...]. Duplicates
-- are ignored. A digest also moves that admin's last_sent_at.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.record_notification_deliveries(p_rows jsonb, p_digest_admin_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.notification_deliveries (admin_id, kind, item_id, item_version, mode)
  SELECT r.admin_id, r.kind, r.item_id, r.item_version, r.mode
  FROM jsonb_to_recordset(p_rows)
       AS r(admin_id uuid, kind text, item_id uuid, item_version timestamptz, mode text)
  ON CONFLICT ON CONSTRAINT notification_deliveries_once DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF p_digest_admin_id IS NOT NULL THEN
    INSERT INTO public.notification_digests (admin_id, last_sent_at)
    VALUES (p_digest_admin_id, now())
    ON CONFLICT (admin_id) DO UPDATE SET last_sent_at = EXCLUDED.last_sent_at;
  END IF;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.set_notification_settings(uuid, jsonb, uuid, text),
                       public.claim_notification_sweep(integer),
                       public.release_notification_sweep(),
                       public.record_notification_deliveries(jsonb, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_notification_settings(uuid, jsonb, uuid, text),
                          public.claim_notification_sweep(integer),
                          public.release_notification_sweep(),
                          public.record_notification_deliveries(jsonb, uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- The schedule. The secret is read from Vault on every run: until it exists
-- (created by hand, docs/setup.md § Notifications) the sweep job selects no
-- row and calls nothing. pg_net is asynchronous; the response is not awaited.
-- ---------------------------------------------------------------------------
SELECT cron.schedule(
  'notify-sweep',
  '*/5 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://admin.cyclea.app/api/notifications/sweep',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || s.decrypted_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  FROM vault.decrypted_secrets s
  WHERE s.name = 'notify_sweep_secret';
  $job$
);

SELECT cron.schedule(
  'purge-notification-deliveries',
  '41 3 * * *',
  $job$ DELETE FROM public.notification_deliveries WHERE sent_at < now() - interval '90 days'; $job$
);

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY (dashboard SQL editor, which runs as postgres)
--
--   -- 1. Grants: service_role reads, client roles do not; writes only through
--   --    the functions. Expect t / f / f / f.
--   SELECT has_table_privilege('service_role',  'public.notification_settings', 'SELECT'),
--          has_table_privilege('service_role',  'public.notification_settings', 'INSERT'),
--          has_table_privilege('authenticated', 'public.notification_settings', 'SELECT'),
--          has_function_privilege('authenticated', 'public.set_notification_settings(uuid, jsonb, uuid, text)', 'EXECUTE');
--
--   -- 2. The jobs: notify-sweep */5 and purge-notification-deliveries.
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE '%notif%';
--
--   -- 3. Settings, rolled back: a change writes one audit entry with kinds and
--   --    modes only; the same again changes nothing; a bad mode is refused.
--   BEGIN;
--   SELECT public.set_notification_settings((SELECT user_id FROM public.admins LIMIT 1),
--          '{"content_feedback": "daily"}', NULL, 'system:verify');            -> t
--   SELECT public.set_notification_settings((SELECT user_id FROM public.admins LIMIT 1),
--          '{"content_feedback": "daily"}', NULL, 'system:verify');            -> f
--   SELECT action, target_type, details FROM public.audit_log
--   WHERE actor_label = 'system:verify';   -> notification.settings, admin, {"content_feedback": {"from": "immediate", "to": "daily"}}
--   ROLLBACK;
--   BEGIN; SELECT public.set_notification_settings((SELECT user_id FROM public.admins LIMIT 1),
--          '{"content_feedback": "hourly"}', NULL, 'system:verify'); ROLLBACK;  -> check violation
--
--   -- 4. The lease, rolled back: the first claim returns launched_at, a second
--   --    one NULL; after release it can be claimed again.
--   BEGIN;
--   SELECT public.claim_notification_sweep();   -> a timestamp
--   SELECT public.claim_notification_sweep();   -> NULL
--   SELECT public.release_notification_sweep();
--   SELECT public.claim_notification_sweep();   -> a timestamp
--   ROLLBACK;
--
--   -- 5. After the setup (Vault secret, Render env): the job's runs succeed.
--   SELECT status, return_message, start_time FROM cron.job_run_details
--   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'notify-sweep')
--   ORDER BY start_time DESC LIMIT 5;
--   SELECT status_code, error_msg, created FROM net._http_response ORDER BY created DESC LIMIT 5;
-- ---------------------------------------------------------------------------
