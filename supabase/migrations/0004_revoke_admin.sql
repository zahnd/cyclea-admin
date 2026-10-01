BEGIN;

-- ---------------------------------------------------------------------------
-- 0004: the way out -- revoking an admin.
--
-- 0002 deliberately shipped only grant_admin(): revoking needed rules that a
-- grant does not, and the bootstrap did not need them yet. Now admins are
-- managed in the panel, and a revoke path that can lock everyone out is worse
-- than none. So this function refuses two things outright:
--
--   * revoking yourself -- the panel would immediately stop working for the
--     person who clicked, and if they were the only one paying attention, the
--     next admin to notice may not exist;
--   * revoking the LAST admin -- there would be nobody left to grant anyone,
--     and the only way back would be the break-glass script with the secret
--     key.
--
-- RACE: two admins revoking each other at the same moment would each see a
-- count of 2 and each succeed, leaving zero. The table lock below serialises
-- revokes (and grants, which also write to admins), so the second one sees the
-- first one's result. SHARE ROW EXCLUSIVE conflicts with itself and with the
-- ROW EXCLUSIVE an INSERT takes; plain reads are not blocked.
--
-- Revoking removes access, not the account (decided 2026-10-01): the auth user
-- stays, holds nothing but an email, and can be granted again. The DAL checks
-- public.admins on every request, so a revoked admin is stopped and signed
-- out on their next click.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.revoke_admin(
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

REVOKE ALL ON FUNCTION public.revoke_admin(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_admin(uuid, uuid, text) TO service_role;

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY (dashboard SQL editor, which runs as postgres)
--
--   -- 1. Only service_role may call it. Expect t / f / f.
--   SELECT has_function_privilege('service_role',  'public.revoke_admin(uuid, uuid, text)', 'EXECUTE'),
--          has_function_privilege('authenticated', 'public.revoke_admin(uuid, uuid, text)', 'EXECUTE'),
--          has_function_privilege('anon',          'public.revoke_admin(uuid, uuid, text)', 'EXECUTE');
--
--   -- 2. With a single admin, revoking them is refused (rolled back either way).
--   BEGIN;
--   SELECT public.revoke_admin((SELECT user_id FROM public.admins LIMIT 1),
--                              gen_random_uuid(), 'system:verify');
--                                      -> cannot revoke the last admin
--   ROLLBACK;
--
--   -- 3. Revoking yourself is refused.
--   BEGIN;
--   SELECT public.revoke_admin(a.user_id, a.user_id, 'system:verify') FROM public.admins a LIMIT 1;
--                                      -> you cannot revoke yourself
--   ROLLBACK;
-- ---------------------------------------------------------------------------
