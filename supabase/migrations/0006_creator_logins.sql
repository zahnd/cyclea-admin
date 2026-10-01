BEGIN;

-- ---------------------------------------------------------------------------
-- 0006: creator portal logins -- the second role.
--
-- A creator (the business record, 0003) and a creator's LOGIN are different
-- things: creating a creator creates no account. An admin invites a creator to
-- the portal by email, which creates (or finds) an account in auth.users and
-- links it here. That link is a role, like public.admins:
--
--   * one login per creator, one creator per login;
--   * never both admin and creator -- one account, one audience (decided
--     2026-10-01), so /admin and /portal stay cleanly apart;
--   * delete_account must refuse a linked account, or a creator's login
--     would count as "no access" and be deletable by the back door -- the
--     rule 0005 said would have to grow, growing here.
--
-- RACE: a grant and an invite for the same account, at the same moment, could
-- each check the other table, find nothing and both succeed -- an account that
-- is admin AND creator. So every function that reads one role table and
-- writes the other locks BOTH, always in the same order (admins, then
-- creator_logins), before checking. That serialises them and cannot deadlock.
--
-- grant_admin (0002), revoke_admin (0004) and delete_account (0005) are
-- replaced here with the same signatures -- applied migrations are never
-- edited -- and keep their privileges (CREATE OR REPLACE preserves them).
-- ---------------------------------------------------------------------------

CREATE TABLE public.creator_logins (
  user_id    uuid        PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  -- Requires the creator's business record. If that record is removed (by
  -- hand -- there is no delete in the app), the link goes with it and the
  -- account remains, with no access.
  creator_id uuid        NOT NULL UNIQUE REFERENCES public.creators (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

COMMENT ON TABLE public.creator_logins IS
  'Which account signs in to the portal as which creator. A role, like '
  'public.admins; never both. Written only by link/unlink_creator_login, '
  'which also write audit_log -- migration 0006.';

REVOKE ALL ON public.creator_logins FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.creator_logins TO service_role;
ALTER TABLE public.creator_logins ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- link_creator_login: give an account portal access as one creator.
-- Returns false when exactly this link already exists (idempotent).
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.link_creator_login(
  p_user_id     uuid,
  p_creator_id  uuid,
  p_actor_id    uuid,
  p_actor_label text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email    text;
  v_existing uuid;
BEGIN
  LOCK TABLE public.admins, public.creator_logins IN SHARE ROW EXCLUSIVE MODE;

  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'link_creator_login: no auth user %', p_user_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.creators WHERE id = p_creator_id) THEN
    RAISE EXCEPTION 'link_creator_login: creator % has no business record', p_creator_id
      USING ERRCODE = 'check_violation', HINT = 'no_record';
  END IF;

  IF EXISTS (SELECT 1 FROM public.admins WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'link_creator_login: this account is an admin'
      USING ERRCODE = 'check_violation', HINT = 'admin';
  END IF;

  SELECT creator_id INTO v_existing FROM public.creator_logins WHERE user_id = p_user_id;
  IF FOUND THEN
    IF v_existing = p_creator_id THEN
      RETURN false;
    END IF;
    RAISE EXCEPTION 'link_creator_login: this account is linked to another creator'
      USING ERRCODE = 'check_violation', HINT = 'linked';
  END IF;

  IF EXISTS (SELECT 1 FROM public.creator_logins WHERE creator_id = p_creator_id) THEN
    RAISE EXCEPTION 'link_creator_login: this creator already has a login'
      USING ERRCODE = 'check_violation', HINT = 'taken';
  END IF;

  INSERT INTO public.creator_logins (user_id, creator_id, created_by)
  VALUES (p_user_id, p_creator_id, p_actor_id);

  INSERT INTO public.audit_log (actor_id, actor_label, action, target_type, target_id, details)
  VALUES (p_actor_id, p_actor_label, 'creator.invite_login', 'creator', p_creator_id::text,
          jsonb_build_object('email', v_email, 'user_id', p_user_id));

  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- unlink_creator_login: end a creator's portal access. The account stays,
-- with no role; it can be deleted in Users afterwards.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.unlink_creator_login(
  p_creator_id  uuid,
  p_actor_id    uuid,
  p_actor_label text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_email   text;
BEGIN
  LOCK TABLE public.admins, public.creator_logins IN SHARE ROW EXCLUSIVE MODE;

  DELETE FROM public.creator_logins WHERE creator_id = p_creator_id
  RETURNING user_id INTO v_user_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;

  INSERT INTO public.audit_log (actor_id, actor_label, action, target_type, target_id, details)
  VALUES (p_actor_id, p_actor_label, 'creator.remove_login', 'creator', p_creator_id::text,
          jsonb_build_object('email', v_email, 'user_id', v_user_id));

  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- grant_admin (0002), now refusing a creator login and locking both tables.
-- Otherwise unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_admin(
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
  LOCK TABLE public.admins, public.creator_logins IN SHARE ROW EXCLUSIVE MODE;

  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'grant_admin: no auth user %', p_user_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM public.creator_logins WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'grant_admin: this account is a creator login'
      USING ERRCODE = 'check_violation', HINT = 'creator';
  END IF;

  INSERT INTO public.admins (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.audit_log (actor_id, actor_label, action, target_type, target_id, details)
  VALUES (p_actor_id, p_actor_label, 'admin.grant', 'admin', p_user_id::text,
          jsonb_build_object('email', v_email));

  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- revoke_admin (0004): only the lock changes, to the shared two-table order.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_admin(
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
  LOCK TABLE public.admins, public.creator_logins IN SHARE ROW EXCLUSIVE MODE;

  IF p_user_id = p_actor_id THEN
    RAISE EXCEPTION 'revoke_admin: you cannot revoke yourself'
      USING ERRCODE = 'check_violation', HINT = 'self';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.admins WHERE user_id = p_user_id) THEN
    RETURN false;
  END IF;

  IF (SELECT count(*) FROM public.admins) <= 1 THEN
    RAISE EXCEPTION 'revoke_admin: cannot revoke the last admin'
      USING ERRCODE = 'check_violation', HINT = 'last';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;

  DELETE FROM public.admins WHERE user_id = p_user_id;

  INSERT INTO public.audit_log (actor_id, actor_label, action, target_type, target_id, details)
  VALUES (p_actor_id, p_actor_label, 'admin.revoke', 'admin', p_user_id::text,
          jsonb_build_object('email', v_email));

  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- delete_account (0005), now refusing a creator login too -- the role check
-- 0005 said must grow with the roles.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_account(
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
  LOCK TABLE public.admins, public.creator_logins IN SHARE ROW EXCLUSIVE MODE;

  IF p_user_id = p_actor_id THEN
    RAISE EXCEPTION 'delete_account: you cannot delete yourself'
      USING ERRCODE = 'check_violation', HINT = 'self';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Roles: admin (0002), creator login (0006). A new role must be added here.
  IF EXISTS (SELECT 1 FROM public.admins WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'delete_account: this account is an admin; revoke it first'
      USING ERRCODE = 'check_violation', HINT = 'admin';
  END IF;
  IF EXISTS (SELECT 1 FROM public.creator_logins WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'delete_account: this account is a creator login; remove its portal access first'
      USING ERRCODE = 'check_violation', HINT = 'creator';
  END IF;

  DELETE FROM auth.users WHERE id = p_user_id;

  INSERT INTO public.audit_log (actor_id, actor_label, action, target_type, target_id, details)
  VALUES (p_actor_id, p_actor_label, 'account.delete', 'user', p_user_id::text,
          jsonb_build_object('email', v_email));

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.link_creator_login(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.unlink_creator_login(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.link_creator_login(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.unlink_creator_login(uuid, uuid, text) TO service_role;

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY (dashboard SQL editor, which runs as postgres)
--
--   -- 1. Privileges: the four functions are service_role only; the table is
--   --    SELECT for service_role only. Expect t,t,t,t / f,f / t,f.
--   SELECT has_function_privilege('service_role', 'public.link_creator_login(uuid, uuid, uuid, text)', 'EXECUTE'),
--          has_function_privilege('service_role', 'public.unlink_creator_login(uuid, uuid, text)', 'EXECUTE'),
--          has_function_privilege('service_role', 'public.grant_admin(uuid, uuid, text)', 'EXECUTE'),
--          has_function_privilege('service_role', 'public.delete_account(uuid, uuid, text)', 'EXECUTE');
--   SELECT has_function_privilege('authenticated', 'public.link_creator_login(uuid, uuid, uuid, text)', 'EXECUTE'),
--          has_function_privilege('anon', 'public.grant_admin(uuid, uuid, text)', 'EXECUTE');
--   SELECT has_table_privilege('service_role', 'public.creator_logins', 'SELECT'),
--          has_table_privilege('service_role', 'public.creator_logins', 'INSERT');
--
--   -- 2. An admin cannot become a creator login (rolled back):
--   BEGIN;
--   SELECT public.link_creator_login((SELECT user_id FROM public.admins LIMIT 1),
--                                    gen_random_uuid(), NULL, 'system:verify');
--                          -> no business record (or: this account is an admin)
--   ROLLBACK;
-- ---------------------------------------------------------------------------
