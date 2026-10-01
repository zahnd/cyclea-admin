BEGIN;

-- ---------------------------------------------------------------------------
-- 0002: who is an admin.
--
-- Admins and (later) creators both sign in to this project's auth.users, so a
-- login proves who someone is, not what they may do. This table is the "what":
-- a user is an admin if and only if a row here says so. The Next.js data
-- access layer checks it on every admin page and every admin server action.
--
-- WHY A TABLE AND NOT A JWT CLAIM: a claim lives in a token until it expires,
-- so removing an admin would take effect up to an hour later; a row is checked
-- per request and takes effect at once. At our scale the lookup costs nothing.
--
-- WRITES ONLY THROUGH grant_admin(), which inserts the row and its audit_log
-- entry in one transaction, so a grant cannot exist without its record.
-- service_role gets SELECT on the table and EXECUTE on the function -- no
-- INSERT, so the server cannot add an admin by a path that skips the log.
-- Revoking comes with the admin-management UI, as its own audited function.
--
-- ON DELETE CASCADE from auth.users: an account that no longer exists cannot
-- be an admin. Deleting an account is itself an administrative action, and is
-- recorded by whatever performs it, not by this table.
-- ---------------------------------------------------------------------------

CREATE TABLE public.admins (
  user_id    uuid        PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admins IS
  'A user is an admin iff a row exists here. Written only by grant_admin(), '
  'which also writes the audit_log entry -- migration 0002.';

-- 0001's lesson: this project's default privileges give anon, authenticated
-- and service_role TRUNCATE (and more) on every new table. Everything off,
-- then exactly what the server needs.
REVOKE ALL ON public.admins FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.admins TO service_role;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- grant_admin: the only way in.
--
-- Returns true when the grant happened, false when the user already was an
-- admin -- idempotent, so the bootstrap script can be re-run safely, and a
-- repeated grant writes no second audit row for something that did not change.
--
-- SECURITY DEFINER so it can write both tables without service_role holding
-- INSERT on either for this purpose; search_path is empty so every name below
-- is schema-qualified and nothing can be shadowed.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.grant_admin(
  p_user_id     uuid,
  p_actor_id    uuid,
  p_actor_label text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'grant_admin: no auth user %', p_user_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  INSERT INTO public.admins (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- The grantee's email is an admin's, not an app user's, so it may be
  -- recorded; it keeps the entry readable after the account is gone.
  INSERT INTO public.audit_log (actor_id, actor_label, action, target_type, target_id, details)
  VALUES (p_actor_id, p_actor_label, 'admin.grant', 'admin', p_user_id::text,
          jsonb_build_object('email', v_email));

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_admin(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.grant_admin(uuid, uuid, text) TO service_role;

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY (dashboard SQL editor, which runs as postgres)
--
--   -- 1. Grants: service_role reads admins and calls grant_admin, nothing
--   --    else; client roles get nothing. Expect t,f,f,f,t / f,f,f.
--   SELECT has_table_privilege('service_role', 'public.admins', 'SELECT')   AS sr_select,
--          has_table_privilege('service_role', 'public.admins', 'INSERT')   AS sr_insert,
--          has_table_privilege('service_role', 'public.admins', 'DELETE')   AS sr_delete,
--          has_table_privilege('service_role', 'public.admins', 'TRUNCATE') AS sr_truncate,
--          has_function_privilege('service_role', 'public.grant_admin(uuid, uuid, text)', 'EXECUTE') AS sr_grant;
--   SELECT has_table_privilege('anon', 'public.admins', 'SELECT')          AS anon_select,
--          has_table_privilege('authenticated', 'public.admins', 'SELECT') AS auth_select,
--          has_function_privilege('authenticated', 'public.grant_admin(uuid, uuid, text)', 'EXECUTE') AS auth_grant;
--
--   -- 2. A grant writes both rows; a repeat writes neither. Needs a real
--   --    auth user, so run it after the bootstrap grant instead of here:
--   SELECT a.user_id, l.action, l.actor_label, l.details
--   FROM public.admins a
--   JOIN public.audit_log l ON l.target_type = 'admin' AND l.target_id = a.user_id::text;
--                                               -> one row per admin, action admin.grant
--
--   -- 3. Unknown user -> "grant_admin: no auth user".
--   SELECT public.grant_admin(gen_random_uuid(), NULL, 'system:verify');
-- ---------------------------------------------------------------------------
