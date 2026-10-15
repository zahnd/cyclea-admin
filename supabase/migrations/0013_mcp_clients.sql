BEGIN;

-- ---------------------------------------------------------------------------
-- 0013: AI clients approved for the admin's MCP endpoint.
--
-- An admin can let an AI client (Claude Code, a claude.ai connector) read
-- feedback and record status, note and link through
-- https://admin.cyclea.app/mcp. This project's Supabase Auth is the OAuth 2.1
-- server; the client registers itself and the admin approves it on our own
-- consent page, signed in with a fresh authenticator code.
--
-- Supabase's grant lives until revoked (its refresh tokens rotate). Ours does
-- not: mcp_grants records each approval for 30 days, and the endpoint accepts
-- a token only while its (user, client) has a row here that is neither
-- expired nor revoked. So a forgotten client stops working on its own, and a
-- token whose aal says nothing about the authenticator never matters: the
-- approval that created the row did require one.
--
-- Reports are not reachable through MCP, nor screenshots or images; the
-- endpoint's tools say so. The audit log records approvals and revocations
-- with the client's name and redirect host only.
-- ---------------------------------------------------------------------------

CREATE TABLE public.mcp_grants (
  admin_id      uuid        NOT NULL REFERENCES public.admins (user_id) ON DELETE CASCADE,
  -- The OAuth client id Supabase assigned at registration.
  client_id     uuid        NOT NULL,
  -- As the client registered it -- self-chosen, so shown beside the host.
  client_name   text        NOT NULL CHECK (length(client_name) BETWEEN 1 AND 200),
  -- The host of the redirect URI the approval went to (localhost for Claude Code).
  redirect_host text        NOT NULL CHECK (length(redirect_host) BETWEEN 1 AND 255),
  approved_at   timestamptz NOT NULL,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  PRIMARY KEY (admin_id, client_id),
  CONSTRAINT mcp_grants_expires_after_approval CHECK (expires_at > approved_at)
);

COMMENT ON TABLE public.mcp_grants IS
  'AI clients an admin approved for the MCP endpoint, for 30 days each. The '
  'endpoint refuses a token without an active row here -- migration 0013.';

REVOKE ALL ON public.mcp_grants FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.mcp_grants TO service_role;
ALTER TABLE public.mcp_grants ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- approve_mcp_client: an admin approved a client on the consent page. (Re)sets
-- 30 days from now and clears a revocation; audited.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.approve_mcp_client(
  p_admin_id      uuid,
  p_client_id     uuid,
  p_client_name   text,
  p_redirect_host text,
  p_actor_label   text
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expires timestamptz := now() + interval '30 days';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admins WHERE user_id = p_admin_id) THEN
    RAISE EXCEPTION 'approve_mcp_client: % is not an admin', p_admin_id USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.mcp_grants (admin_id, client_id, client_name, redirect_host, approved_at, expires_at, revoked_at)
  VALUES (p_admin_id, p_client_id, p_client_name, p_redirect_host, now(), v_expires, NULL)
  ON CONFLICT (admin_id, client_id) DO UPDATE
  SET client_name   = EXCLUDED.client_name,
      redirect_host = EXCLUDED.redirect_host,
      approved_at   = EXCLUDED.approved_at,
      expires_at    = EXCLUDED.expires_at,
      revoked_at    = NULL;

  INSERT INTO public.audit_log (actor_id, actor_label, action, target_type, target_id, details)
  VALUES (p_admin_id, p_actor_label, 'mcp.approve', 'admin', p_admin_id::text,
          jsonb_build_object('client_id', p_client_id, 'client', p_client_name,
                             'redirect_host', p_redirect_host, 'expires_at', v_expires));
  RETURN v_expires;
END;
$$;

-- ---------------------------------------------------------------------------
-- revoke_mcp_client: the admin withdrew a client's access. Returns whether an
-- active approval was revoked; audited only then.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.revoke_mcp_client(
  p_admin_id    uuid,
  p_client_id   uuid,
  p_actor_label text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text;
BEGIN
  UPDATE public.mcp_grants
  SET revoked_at = now()
  WHERE admin_id = p_admin_id AND client_id = p_client_id AND revoked_at IS NULL
  RETURNING client_name INTO v_name;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.audit_log (actor_id, actor_label, action, target_type, target_id, details)
  VALUES (p_admin_id, p_actor_label, 'mcp.revoke', 'admin', p_admin_id::text,
          jsonb_build_object('client_id', p_client_id, 'client', v_name));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_mcp_client(uuid, uuid, text, text, text),
                       public.revoke_mcp_client(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_mcp_client(uuid, uuid, text, text, text),
                          public.revoke_mcp_client(uuid, uuid, text)
  TO service_role;

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY (dashboard SQL editor, which runs as postgres)
--
--   -- 1. Grants. Expect t / f / f.
--   SELECT has_table_privilege('service_role',  'public.mcp_grants', 'SELECT'),
--          has_table_privilege('service_role',  'public.mcp_grants', 'INSERT'),
--          has_function_privilege('authenticated', 'public.approve_mcp_client(uuid, uuid, text, text, text)', 'EXECUTE');
--
--   -- 2. Rolled back: approve -> 30 days out; revoke -> t, again -> f;
--   --    approve again clears the revocation. Audit: mcp.approve, mcp.revoke,
--   --    mcp.approve, with client name and host only.
--   BEGIN;
--   SELECT public.approve_mcp_client((SELECT user_id FROM public.admins LIMIT 1),
--          '00000000-0000-4000-8000-0000000000c9', 'Verify client', 'localhost', 'system:verify');
--   SELECT public.revoke_mcp_client((SELECT user_id FROM public.admins LIMIT 1),
--          '00000000-0000-4000-8000-0000000000c9', 'system:verify');   -> t
--   SELECT public.revoke_mcp_client((SELECT user_id FROM public.admins LIMIT 1),
--          '00000000-0000-4000-8000-0000000000c9', 'system:verify');   -> f
--   SELECT public.approve_mcp_client((SELECT user_id FROM public.admins LIMIT 1),
--          '00000000-0000-4000-8000-0000000000c9', 'Verify client', 'localhost', 'system:verify');
--   SELECT expires_at - approved_at, revoked_at FROM public.mcp_grants;   -> 30 days, NULL
--   SELECT action, details FROM public.audit_log WHERE actor_label = 'system:verify' ORDER BY id;
--   ROLLBACK;
-- ---------------------------------------------------------------------------
