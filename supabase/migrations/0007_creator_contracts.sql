BEGIN;

-- ---------------------------------------------------------------------------
-- 0007: the creator's contract state, and which payout method they use.
--
-- Contracts are signed in Skribble (decided 2026-10-01: Swiss hosting, free
-- plan, by hand). The contract -- and the bank details written into it --
-- STAY IN SKRIBBLE. This table records only what the admin needs to manage
-- it: where the contract stands, when it was signed or ended, and a link to
-- it. docs/payouts.md § Contracts and payee details has the whole flow.
--
-- STATES: none -> sent -> signed -> ended. A declined or withdrawn signature
-- request goes back to 'none'; the audit log keeps the history. Any state may
-- follow any other: this is a manual record, and corrections must be possible.
-- 'ended' does not deactivate the code -- that stays a separate, deliberate
-- action in the app project.
--
-- THE LINK MAY ONLY POINT AT SKRIBBLE. A Skribble link carries a document id;
-- opening it needs the Skribble login. A Dropbox or Drive share link could
-- carry the PDF itself, bank details included, to anyone holding it -- so the
-- CHECK refuses everything else.
--
-- PAYOUT METHOD IS A LABEL: 'bank' (our e-banking) or 'wise'. The only two we
-- can pay through today. payee_reference (0003) says where to find the payee
-- in that service; account details stay there.
--
-- update_creator_record (0003) is REPLACED with a new signature: the contract
-- date moves to update_creator_contract, so each column has one write path,
-- and the record function takes the payout method instead. Applied migrations
-- are never edited, so the old signature is dropped here.
-- ---------------------------------------------------------------------------

ALTER TABLE public.creators
  ADD COLUMN contract_status text NOT NULL DEFAULT 'none'
    CONSTRAINT creators_contract_status_check
      CHECK (contract_status IN ('none', 'sent', 'signed', 'ended')),
  ADD COLUMN contract_ended_on date,
  ADD COLUMN contract_url text
    CONSTRAINT creators_contract_url_check CHECK (
      length(contract_url) <= 500
      AND contract_url ~ '^https://my\.skribble\.(com|de)/\S+$'
    ),
  ADD COLUMN payout_method text
    CONSTRAINT creators_payout_method_check CHECK (payout_method IN ('bank', 'wise'));

-- A date entered before this migration means a signed contract. Production
-- has no records today; this keeps the constraint below true for any row.
UPDATE public.creators SET contract_status = 'signed' WHERE contract_signed_on IS NOT NULL;

-- The dates must match the state, so the list can trust either.
ALTER TABLE public.creators
  ADD CONSTRAINT creators_contract_dates_check CHECK (
    CASE contract_status
      WHEN 'signed' THEN contract_signed_on IS NOT NULL AND contract_ended_on IS NULL
      WHEN 'ended'  THEN contract_signed_on IS NOT NULL AND contract_ended_on IS NOT NULL
                         AND contract_ended_on >= contract_signed_on
      ELSE contract_signed_on IS NULL AND contract_ended_on IS NULL
    END
  );

COMMENT ON COLUMN public.creators.contract_status IS
  'none | sent | signed | ended. The contract itself is in Skribble -- migration 0007.';
COMMENT ON COLUMN public.creators.contract_url IS
  'Link to the contract in Skribble (my.skribble.com / .de) only. Never a file share.';
COMMENT ON COLUMN public.creators.payout_method IS
  'bank | wise; NULL = not set. A label: the payee is found by payee_reference in that service.';

-- ---------------------------------------------------------------------------
-- update_creator_contract: the contract fields, with the change logged.
--
-- Empty link -> NULL, so "cleared" has one representation. Returns false and
-- logs nothing when nothing changed. Every changed field is logged FROM and
-- TO: a contract's state is what payouts will depend on.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.update_creator_contract(
  p_id          uuid,
  p_status      text,
  p_signed_on   date,
  p_ended_on    date,
  p_url         text,
  p_actor_id    uuid,
  p_actor_label text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old     public.creators;
  v_url     text := nullif(btrim(p_url), '');
  v_changes jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO v_old FROM public.creators WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'update_creator_contract: no record for creator %', p_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_old.contract_status IS DISTINCT FROM p_status THEN
    v_changes := v_changes || jsonb_build_object('contract_status',
      jsonb_build_object('from', v_old.contract_status, 'to', p_status));
  END IF;
  IF v_old.contract_signed_on IS DISTINCT FROM p_signed_on THEN
    v_changes := v_changes || jsonb_build_object('contract_signed_on',
      jsonb_build_object('from', v_old.contract_signed_on, 'to', p_signed_on));
  END IF;
  IF v_old.contract_ended_on IS DISTINCT FROM p_ended_on THEN
    v_changes := v_changes || jsonb_build_object('contract_ended_on',
      jsonb_build_object('from', v_old.contract_ended_on, 'to', p_ended_on));
  END IF;
  IF v_old.contract_url IS DISTINCT FROM v_url THEN
    v_changes := v_changes || jsonb_build_object('contract_url',
      jsonb_build_object('from', v_old.contract_url, 'to', v_url));
  END IF;

  IF v_changes = '{}'::jsonb THEN
    RETURN false;
  END IF;

  -- The CHECKs above refuse a bad state, date pair or link; the whole call,
  -- audit entry included, then rolls back.
  UPDATE public.creators
  SET contract_status    = p_status,
      contract_signed_on = p_signed_on,
      contract_ended_on  = p_ended_on,
      contract_url       = v_url,
      updated_at         = now()
  WHERE id = p_id;

  INSERT INTO public.audit_log (actor_id, actor_label, action, target_type, target_id, details)
  VALUES (p_actor_id, p_actor_label, 'creator.update_contract', 'creator', p_id::text, v_changes);

  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- update_creator_record, new signature: payout method instead of the contract
-- date. Otherwise as 0003 -- payout method and payee reference logged FROM and
-- TO (where money goes is exactly what an audit trail is for), the note only
-- as "changed".
-- ---------------------------------------------------------------------------
DROP FUNCTION public.update_creator_record(uuid, date, text, text, uuid, text);

CREATE FUNCTION public.update_creator_record(
  p_id              uuid,
  p_payout_method   text,
  p_payee_reference text,
  p_internal_note   text,
  p_actor_id        uuid,
  p_actor_label     text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old     public.creators;
  v_method  text := nullif(btrim(p_payout_method), '');
  v_payee   text := nullif(btrim(p_payee_reference), '');
  v_note    text := nullif(btrim(p_internal_note), '');
  v_changes jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO v_old FROM public.creators WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'update_creator_record: no record for creator %', p_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_old.payout_method IS DISTINCT FROM v_method THEN
    v_changes := v_changes || jsonb_build_object('payout_method',
      jsonb_build_object('from', v_old.payout_method, 'to', v_method));
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
  SET payout_method   = v_method,
      payee_reference = v_payee,
      internal_note   = v_note,
      updated_at      = now()
  WHERE id = p_id;

  INSERT INTO public.audit_log (actor_id, actor_label, action, target_type, target_id, details)
  VALUES (p_actor_id, p_actor_label, 'creator.update_record', 'creator', p_id::text, v_changes);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.update_creator_contract(uuid, text, date, date, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_creator_record(uuid, text, text, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_creator_contract(uuid, text, date, date, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_creator_record(uuid, text, text, text, uuid, text) TO service_role;

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY (dashboard SQL editor, which runs as postgres)
--
--   -- 1. Grants: service_role calls both functions, client roles nothing; the
--   --    old record signature is gone. Expect t,t / f,f,f,f / f.
--   SELECT has_function_privilege('service_role', 'public.update_creator_contract(uuid, text, date, date, text, uuid, text)', 'EXECUTE') AS sr_contract,
--          has_function_privilege('service_role', 'public.update_creator_record(uuid, text, text, text, uuid, text)', 'EXECUTE') AS sr_record;
--   SELECT has_function_privilege('anon', 'public.update_creator_contract(uuid, text, date, date, text, uuid, text)', 'EXECUTE') AS anon_contract,
--          has_function_privilege('authenticated', 'public.update_creator_contract(uuid, text, date, date, text, uuid, text)', 'EXECUTE') AS auth_contract,
--          has_function_privilege('anon', 'public.update_creator_record(uuid, text, text, text, uuid, text)', 'EXECUTE') AS anon_record,
--          has_function_privilege('authenticated', 'public.update_creator_record(uuid, text, text, text, uuid, text)', 'EXECUTE') AS auth_record;
--   SELECT to_regprocedure('public.update_creator_record(uuid, date, text, text, uuid, text)') IS NOT NULL AS old_record_fn;
--
--   -- 2. Behaviour, rolled back: sent (t), same again (f), signed (t), ended
--   --    (t), back to none (t); record with Wise (t), same again (f). Then the
--   --    audit entries, with from/to.
--   BEGIN;
--   SELECT public.record_creator('00000000-0000-0000-0000-0000000000ac', 'VERIFY', 'Verify', false, NULL, 'system:verify');
--   SELECT public.update_creator_contract('00000000-0000-0000-0000-0000000000ac', 'sent', NULL, NULL, 'https://my.skribble.com/view/abc', NULL, 'system:verify');
--   SELECT public.update_creator_contract('00000000-0000-0000-0000-0000000000ac', 'sent', NULL, NULL, 'https://my.skribble.com/view/abc', NULL, 'system:verify');
--   SELECT public.update_creator_contract('00000000-0000-0000-0000-0000000000ac', 'signed', '2026-10-01', NULL, 'https://my.skribble.com/view/abc', NULL, 'system:verify');
--   SELECT public.update_creator_contract('00000000-0000-0000-0000-0000000000ac', 'ended', '2026-10-01', '2026-12-31', 'https://my.skribble.com/view/abc', NULL, 'system:verify');
--   SELECT public.update_creator_contract('00000000-0000-0000-0000-0000000000ac', 'none', NULL, NULL, '', NULL, 'system:verify');
--   SELECT public.update_creator_record('00000000-0000-0000-0000-0000000000ac', 'wise', 'W-123', 'note', NULL, 'system:verify');
--   SELECT public.update_creator_record('00000000-0000-0000-0000-0000000000ac', 'wise', 'W-123', 'note', NULL, 'system:verify');
--   SELECT action, details FROM public.audit_log WHERE target_id = '00000000-0000-0000-0000-0000000000ac' ORDER BY id;
--                                   -> creator.create, 4 x creator.update_contract, creator.update_record
--   ROLLBACK;
--
--   -- 3. Refusals, each in its own rolled-back transaction:
--   --    a Dropbox link              -> creators_contract_url_check
--   --    signed without a date       -> creators_contract_dates_check
--   --    ended before it was signed  -> creators_contract_dates_check
--   --    an unknown payout method    -> creators_payout_method_check
--   BEGIN;
--   SELECT public.record_creator('00000000-0000-0000-0000-0000000000ad', 'VERIFY2', 'Verify', false, NULL, 'system:verify');
--   SELECT public.update_creator_contract('00000000-0000-0000-0000-0000000000ad', 'sent', NULL, NULL, 'https://www.dropbox.com/s/x/contract.pdf', NULL, 'system:verify');
--   ROLLBACK;
--   BEGIN;
--   SELECT public.record_creator('00000000-0000-0000-0000-0000000000ad', 'VERIFY2', 'Verify', false, NULL, 'system:verify');
--   SELECT public.update_creator_contract('00000000-0000-0000-0000-0000000000ad', 'signed', NULL, NULL, NULL, NULL, 'system:verify');
--   ROLLBACK;
--   BEGIN;
--   SELECT public.record_creator('00000000-0000-0000-0000-0000000000ad', 'VERIFY2', 'Verify', false, NULL, 'system:verify');
--   SELECT public.update_creator_contract('00000000-0000-0000-0000-0000000000ad', 'ended', '2026-10-01', '2026-09-01', NULL, NULL, 'system:verify');
--   ROLLBACK;
--   BEGIN;
--   SELECT public.record_creator('00000000-0000-0000-0000-0000000000ad', 'VERIFY2', 'Verify', false, NULL, 'system:verify');
--   SELECT public.update_creator_record('00000000-0000-0000-0000-0000000000ad', 'paypal', NULL, NULL, NULL, 'system:verify');
--   ROLLBACK;
-- ---------------------------------------------------------------------------
