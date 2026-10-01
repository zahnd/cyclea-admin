BEGIN;

-- ---------------------------------------------------------------------------
-- 0003: the creator's business record.
--
-- A creator exists in two places under one uuid (docs/architecture.md §
-- Creator identity spans both projects). The APP project's public.creators
-- holds what the app needs -- code, name, active -- and must stay there,
-- because claim_creator_code reads it synchronously. THIS table holds what
-- only the business needs: when the agreement was signed, where payouts go,
-- and our own notes. Code and name are deliberately NOT copied here: two
-- copies of a name is a drift waiting to happen, and the app's row is the one
-- users see.
--
-- NO REVENUE SHARE COLUMN. The percentage, and whether it applies to gross or
-- net, are open contract questions (docs/payouts.md). A column would invite a
-- guess; it arrives with the payout work, once decided.
--
-- payee_reference IS A REFERENCE, NEVER ACCOUNT DETAILS. A Wise recipient id
-- or a bank's own payee reference -- something that points at the payee in the
-- system that moves the money. The CHECK rejects the most likely mistake, an
-- IBAN pasted into the field; it cannot catch everything, which is why the
-- form says so too.
--
-- WRITES ONLY THROUGH FUNCTIONS that also write the audit_log entry in the
-- same transaction (0002's pattern). service_role can read the table and call
-- the functions; it has no INSERT/UPDATE/DELETE, so no change can skip the log.
-- There is no delete function: removing a creator is rare, deliberate, and
-- done by hand (docs/setup.md § Removing a creator).
-- ---------------------------------------------------------------------------

CREATE TABLE public.creators (
  -- The SAME uuid as the app project's public.creators.id. Not a foreign key:
  -- the other row lives in another database.
  id                  uuid        PRIMARY KEY,
  created_at          timestamptz NOT NULL DEFAULT now(),
  -- The admin who created (or adopted) the record; NULL for system work.
  created_by          uuid,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  contract_signed_on  date,
  payee_reference     text
    CONSTRAINT creators_payee_reference_check CHECK (
      length(payee_reference) BETWEEN 1 AND 100
      -- Not an IBAN: two letters, two digits, then 10-30 alphanumerics, with
      -- spaces ignored the way people type them.
      AND upper(regexp_replace(payee_reference, '\s', '', 'g'))
          !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$'
    ),
  internal_note       text
    CONSTRAINT creators_internal_note_check CHECK (length(internal_note) BETWEEN 1 AND 5000)
);

COMMENT ON TABLE public.creators IS
  'Business record per creator, keyed by the app project''s creators.id. '
  'Written only by record_creator() and update_creator_record(), which also '
  'write audit_log -- migration 0003. Never bank details.';
COMMENT ON COLUMN public.creators.payee_reference IS
  'Wise recipient id or a bank''s payee reference. Never an account number.';

REVOKE ALL ON public.creators FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.creators TO service_role;
ALTER TABLE public.creators ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- record_creator: the admin-side half of creating a creator, or adopting one
-- that already exists in the app project without a record here.
--
-- Called AFTER the app row exists (the code must work the moment it is handed
-- out). Code and name are taken only for the audit entry. Returns false when
-- the record already exists -- idempotent, so a retry after a half-failed
-- create writes no second entry.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.record_creator(
  p_id          uuid,
  p_code        text,
  p_name        text,
  p_adopted     boolean,
  p_actor_id    uuid,
  p_actor_label text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.creators (id, created_by) VALUES (p_id, p_actor_id)
  ON CONFLICT (id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.audit_log (actor_id, actor_label, action, target_type, target_id, details)
  VALUES (p_actor_id, p_actor_label,
          CASE WHEN p_adopted THEN 'creator.adopt' ELSE 'creator.create' END,
          'creator', p_id::text,
          jsonb_build_object('code', p_code, 'name', p_name));

  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- update_creator_record: change the business fields, with the change logged.
--
-- Empty strings become NULL here, so "cleared" has one representation. Returns
-- false and logs nothing when nothing changed.
--
-- What the audit entry keeps: contract date and payee reference FROM and TO --
-- a changed payee is exactly the change an audit trail exists for. The note
-- only as "changed": notes are free text, and an append-only log keeps
-- whatever enters it forever.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.update_creator_record(
  p_id                 uuid,
  p_contract_signed_on date,
  p_payee_reference    text,
  p_internal_note      text,
  p_actor_id           uuid,
  p_actor_label        text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old     public.creators;
  v_payee   text := nullif(btrim(p_payee_reference), '');
  v_note    text := nullif(btrim(p_internal_note), '');
  v_changes jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO v_old FROM public.creators WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'update_creator_record: no record for creator %', p_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_old.contract_signed_on IS DISTINCT FROM p_contract_signed_on THEN
    v_changes := v_changes || jsonb_build_object('contract_signed_on',
      jsonb_build_object('from', v_old.contract_signed_on, 'to', p_contract_signed_on));
  END IF;
  IF v_old.payee_reference IS DISTINCT FROM v_payee THEN
    v_changes := v_changes || jsonb_build_object('payee_reference',
      jsonb_build_object('from', v_old.payee_reference, 'to', v_payee));
  END IF;
  IF v_old.internal_note IS DISTINCT FROM v_note THEN
    v_changes := v_changes || jsonb_build_object('internal_note', 'changed');
  END IF;

  IF v_changes = '{}'::jsonb THEN
    RETURN false;
  END IF;

  UPDATE public.creators
  SET contract_signed_on = p_contract_signed_on,
      payee_reference    = v_payee,
      internal_note      = v_note,
      updated_at         = now()
  WHERE id = p_id;

  INSERT INTO public.audit_log (actor_id, actor_label, action, target_type, target_id, details)
  VALUES (p_actor_id, p_actor_label, 'creator.update_record', 'creator', p_id::text, v_changes);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_creator(uuid, text, text, boolean, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_creator_record(uuid, date, text, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_creator(uuid, text, text, boolean, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_creator_record(uuid, date, text, text, uuid, text) TO service_role;

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY (dashboard SQL editor, which runs as postgres)
--
--   -- 1. Grants: service_role reads and calls the two functions, nothing
--   --    else; client roles get nothing. Expect t,f,f,f,t,t / f,f,f.
--   SELECT has_table_privilege('service_role', 'public.creators', 'SELECT')   AS sr_select,
--          has_table_privilege('service_role', 'public.creators', 'INSERT')   AS sr_insert,
--          has_table_privilege('service_role', 'public.creators', 'UPDATE')   AS sr_update,
--          has_table_privilege('service_role', 'public.creators', 'TRUNCATE') AS sr_truncate,
--          has_function_privilege('service_role', 'public.record_creator(uuid, text, text, boolean, uuid, text)', 'EXECUTE') AS sr_record,
--          has_function_privilege('service_role', 'public.update_creator_record(uuid, date, text, text, uuid, text)', 'EXECUTE') AS sr_update_fn;
--   SELECT has_table_privilege('anon', 'public.creators', 'SELECT') AS anon_select,
--          has_table_privilege('authenticated', 'public.creators', 'SELECT') AS auth_select,
--          has_function_privilege('authenticated', 'public.record_creator(uuid, text, text, boolean, uuid, text)', 'EXECUTE') AS auth_record;
--
--   -- 2. Behaviour, all rolled back: record twice (t, then f), update (t),
--   --    same update again (f), an IBAN as payee (check violation).
--   BEGIN;
--   SELECT public.record_creator('00000000-0000-0000-0000-0000000000aa', 'VERIFY', 'Verify', false, NULL, 'system:verify');
--   SELECT public.record_creator('00000000-0000-0000-0000-0000000000aa', 'VERIFY', 'Verify', false, NULL, 'system:verify');
--   SELECT public.update_creator_record('00000000-0000-0000-0000-0000000000aa', '2026-10-01', 'P-123', 'note', NULL, 'system:verify');
--   SELECT public.update_creator_record('00000000-0000-0000-0000-0000000000aa', '2026-10-01', 'P-123', 'note', NULL, 'system:verify');
--   SELECT action, details FROM public.audit_log WHERE target_id = '00000000-0000-0000-0000-0000000000aa';
--                                   -> creator.create, creator.update_record
--   ROLLBACK;
--   BEGIN;
--   SELECT public.record_creator('00000000-0000-0000-0000-0000000000ab', 'VERIFY2', 'Verify', false, NULL, 'system:verify');
--   SELECT public.update_creator_record('00000000-0000-0000-0000-0000000000ab', NULL, 'CH93 0076 2011 6238 5295 7', NULL, NULL, 'system:verify');
--                                   -> violates creators_payee_reference_check
--   ROLLBACK;
-- ---------------------------------------------------------------------------
