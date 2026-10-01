BEGIN;

-- ---------------------------------------------------------------------------
-- 0001: the append-only audit log.
--
-- First, because it has to exist before anything it records does. Who created
-- which creator, who changed a rate, who marked which payout paid, who granted
-- what -- for money, a log is the difference between a discrepancy being
-- explainable and it being an argument, and a log retrofitted after the first
-- payout has a hole exactly where the first payouts are.
--
-- APPEND-ONLY IS ENFORCED BY POSTGRES, NOT BY OUR CODE. Two layers:
--
--   1. Grants. The application reaches this project as `service_role`, which
--      gets SELECT and INSERT here and nothing else. No UPDATE, no DELETE --
--      and no TRUNCATE, which is the one that is easy to miss: this project's
--      default privileges give anon, authenticated AND service_role
--      TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on every new public table
--      (`Dxtm` in pg_default_acl, checked 2026-09-30). TRUNCATE empties a
--      table without a DELETE grant, so "no DELETE" alone would have left the
--      log one statement from empty. Hence REVOKE ALL first, then grant back
--      exactly two privileges.
--
--   2. Triggers that raise on UPDATE, DELETE and TRUNCATE. The grants already
--      stop service_role; these also stop the table owner (`postgres`, i.e.
--      the dashboard SQL editor), so a correction cannot be made by quietly
--      editing history. A correction is a new row that says what it corrects.
--      Removing a trigger is DDL -- a migration, reviewed and committed --
--      which is the right amount of friction for rewriting an audit trail.
--
-- WHAT GOES IN `details`: what changed, from what, to what -- enough to
-- reconstruct the decision without the row it was about. NEVER an app user's
-- id, nothing per referred subscriber, nothing from the app project's health
-- tables, and never bank details (CLAUDE.md). This table is read by admins and
-- kept forever; whatever enters it cannot be removed, which is the point, and
-- also why it must not receive anything that might later have to be.
--
-- HOW ROWS ARRIVE. An action on this project's own tables should write its
-- audit row in the same transaction, through a function, so the change and its
-- record cannot diverge. A write to the APP project (creating a creator
-- through `admin_portal`) cannot share a transaction with this one -- they are
-- different databases -- so the audit row is written after the app-side write
-- succeeds, carrying the id it produced. Both are the callers' contract; this
-- migration only provides the table.
--
-- NO FOREIGN KEY TO auth.users, deliberately. ON DELETE CASCADE would delete
-- an admin's history with the admin; RESTRICT would make an admin undeletable.
-- `actor_id` records who it was, and `actor_label` records who they were at
-- the time, which survives the account.
-- ---------------------------------------------------------------------------

CREATE TABLE public.audit_log (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Set by the trigger below, whatever the caller sends. A backdated audit
  -- entry is worse than a missing one.
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  -- auth.users.id of the admin who acted. NULL only for a system actor.
  actor_id     uuid,
  -- The admin's email at the time, or 'system:<job>' for scheduled work.
  actor_label  text        NOT NULL CHECK (length(actor_label) BETWEEN 1 AND 320),
  -- '<noun>.<verb>': 'creator.create', 'rate.change', 'payout.mark_paid'.
  action       text        NOT NULL CHECK (action ~ '^[a-z][a-z_]*\.[a-z][a-z_]*$'),
  -- What it was done to: 'creator' + its uuid, 'payout' + its id.
  target_type  text        NOT NULL CHECK (target_type ~ '^[a-z][a-z_]*$'),
  target_id    text        NOT NULL CHECK (length(target_id) BETWEEN 1 AND 200),
  details      jsonb       NOT NULL DEFAULT '{}'::jsonb
                           CHECK (jsonb_typeof(details) = 'object'),
  -- Every human action has an id behind it; only system work may omit one.
  CONSTRAINT audit_log_actor_known
    CHECK (actor_id IS NOT NULL OR actor_label LIKE 'system:%')
);

COMMENT ON TABLE public.audit_log IS
  'Append-only record of administrative actions. No UPDATE/DELETE/TRUNCATE for '
  'any role, enforced by grants and triggers -- see migration 0001. Never '
  'holds app-user ids, health data or bank details.';

-- "Everything that happened to this creator / this payout", newest first.
CREATE INDEX audit_log_target_idx
  ON public.audit_log (target_type, target_id, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- Guards.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.audit_log_stamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Transaction time, like the DEFAULT -- so a row written alongside the
  -- change it records carries the same timestamp as that change.
  NEW.occurred_at := now();
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.audit_log_reject_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege',
          HINT = 'Record a correction as a new row that references the old id.';
END;
$$;

CREATE TRIGGER audit_log_stamp
  BEFORE INSERT ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_stamp();

CREATE TRIGGER audit_log_no_update_or_delete
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_reject_change();

-- TRUNCATE fires no row triggers, so it needs its own statement-level one.
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON public.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.audit_log_reject_change();

-- Trigger functions are never called directly; nothing needs EXECUTE on them.
-- 0030's lesson (app repo): FROM PUBLIC alone leaves Supabase's explicit grants.
REVOKE ALL ON FUNCTION public.audit_log_stamp()         FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.audit_log_reject_change() FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Grants. Everything off, then exactly what the server needs back.
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.audit_log FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.audit_log TO service_role;

-- RLS on with no policies: anon and authenticated could see nothing even if a
-- later blanket GRANT reached them. service_role bypasses RLS, as intended.
-- When admins read the log through their own session rather than the server,
-- that is a SELECT policy in its own migration, not a wider grant here.
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY (dashboard SQL editor, which runs as postgres)
--
--   -- 1. Grants are exactly SELECT + INSERT for service_role, nothing for the
--   --    client roles. Expect t,t,f,f,f / f,f,f.
--   SELECT has_table_privilege('service_role',  'public.audit_log', 'SELECT')   AS sr_select,
--          has_table_privilege('service_role',  'public.audit_log', 'INSERT')   AS sr_insert,
--          has_table_privilege('service_role',  'public.audit_log', 'UPDATE')   AS sr_update,
--          has_table_privilege('service_role',  'public.audit_log', 'DELETE')   AS sr_delete,
--          has_table_privilege('service_role',  'public.audit_log', 'TRUNCATE') AS sr_truncate;
--   SELECT has_table_privilege('anon',          'public.audit_log', 'SELECT')   AS anon_select,
--          has_table_privilege('authenticated', 'public.audit_log', 'SELECT')   AS auth_select,
--          has_table_privilege('authenticated', 'public.audit_log', 'TRUNCATE') AS auth_truncate;
--
--   -- 2. service_role can append, and the timestamp is not the caller's.
--   --    Rolled back, so VERIFY leaves no row behind.
--   BEGIN;
--   SET LOCAL ROLE service_role;
--   INSERT INTO public.audit_log (occurred_at, actor_label, action, target_type, target_id)
--   VALUES ('2000-01-01', 'system:verify', 'audit.verify', 'audit', 'verify')
--   RETURNING id, occurred_at;                  -> today, not 2000-01-01
--   ROLLBACK;
--
--   -- 3. ...and cannot change or remove anything. One transaction each,
--   --    because the first error aborts the rest. Each -> permission denied.
--   BEGIN; SET LOCAL ROLE service_role; UPDATE public.audit_log SET details = '{}'; ROLLBACK;
--   BEGIN; SET LOCAL ROLE service_role; DELETE FROM public.audit_log;           ROLLBACK;
--   BEGIN; SET LOCAL ROLE service_role; TRUNCATE public.audit_log;              ROLLBACK;
--
--   -- 4. Not even the owner. Each -> "audit_log is append-only".
--   BEGIN;
--   INSERT INTO public.audit_log (actor_label, action, target_type, target_id)
--   VALUES ('system:verify', 'audit.verify', 'audit', 'verify');
--   DELETE FROM public.audit_log WHERE actor_label = 'system:verify';
--   ROLLBACK;
--   BEGIN; TRUNCATE public.audit_log; ROLLBACK;
--
--   -- 5. A human action without an actor id is refused.
--   INSERT INTO public.audit_log (actor_label, action, target_type, target_id)
--   VALUES ('someone@example.com', 'creator.create', 'creator', 'x');
--                                               -> violates audit_log_actor_known
--
--   -- 6. Supabase advisors: expect no "RLS disabled" for audit_log. "RLS
--   --    enabled, no policy" is intended -- see the comment above.
-- ---------------------------------------------------------------------------
