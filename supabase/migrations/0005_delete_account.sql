BEGIN;

-- ---------------------------------------------------------------------------
-- 0005: deleting an account that has no role.
--
-- Every login in this project is someone we let in deliberately: admins now,
-- creator portal logins later, perhaps staff. Revoking an admin keeps the
-- account (decided 2026-10-01), so accounts with no role accumulate and need
-- a way out -- but only those: deleting an account that still grants
-- something would be revoking by the back door, without the checks
-- revoke_admin applies.
--
-- THE ROLE CHECK MUST GROW WITH THE ROLES. Today a role is a row in
-- public.admins. When creator portal logins arrive, their link (creator <->
-- auth user) is a role too, and that migration must add it to the check below
-- -- otherwise a creator's login would count as "no access" and be deletable
-- here. docs/architecture.md says the same.
--
-- Same lock as revoke_admin (0004): a grant racing a delete is serialised.
-- Grant first -> the delete then sees an admin and refuses. Delete first ->
-- the grant then fails on the foreign key, the account being gone.
--
-- Deleting from auth.users in SQL is allowed for the owner here, and every
-- foreign key to it cascades: sessions, identities, mfa_factors, recovery
-- codes, one-time tokens, public.admins. It skips Auth's own internal log of
-- the deletion; ours below records it.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.delete_account(
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
  LOCK TABLE public.admins IN SHARE ROW EXCLUSIVE MODE;

  IF p_user_id = p_actor_id THEN
    RAISE EXCEPTION 'delete_account: you cannot delete yourself'
      USING ERRCODE = 'check_violation', HINT = 'self';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Roles. Today: admin. Creator portal logins must be added here.
  IF EXISTS (SELECT 1 FROM public.admins WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'delete_account: this account is an admin; revoke it first'
      USING ERRCODE = 'check_violation', HINT = 'admin';
  END IF;

  DELETE FROM auth.users WHERE id = p_user_id;

  INSERT INTO public.audit_log (actor_id, actor_label, action, target_type, target_id, details)
  VALUES (p_actor_id, p_actor_label, 'account.delete', 'user', p_user_id::text,
          jsonb_build_object('email', v_email));

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_account(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_account(uuid, uuid, text) TO service_role;

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY (dashboard SQL editor, which runs as postgres)
--
--   -- 1. Only service_role may call it. Expect t / f / f.
--   SELECT has_function_privilege('service_role',  'public.delete_account(uuid, uuid, text)', 'EXECUTE'),
--          has_function_privilege('authenticated', 'public.delete_account(uuid, uuid, text)', 'EXECUTE'),
--          has_function_privilege('anon',          'public.delete_account(uuid, uuid, text)', 'EXECUTE');
--
--   -- 2. An admin cannot be deleted; nor can you delete yourself (rolled back).
--   BEGIN;
--   SELECT public.delete_account((SELECT user_id FROM public.admins LIMIT 1),
--                                gen_random_uuid(), 'system:verify');
--                                     -> this account is an admin; revoke it first
--   ROLLBACK;
--
--   -- 3. An unknown id returns false and writes nothing.
--   SELECT public.delete_account(gen_random_uuid(), NULL, 'system:verify');   -> f
-- ---------------------------------------------------------------------------
