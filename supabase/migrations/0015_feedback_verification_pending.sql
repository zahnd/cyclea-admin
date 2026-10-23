BEGIN;

-- ---------------------------------------------------------------------------
-- 0015: a fifth triage state, 'verification_pending'.
--
-- Some fixes cannot be tested here -- an Android-only bug, with no Android
-- phone at hand. They ship, but whether they hold is known only once the user
-- confirms it or the data shows it. 'in_progress' is wrong for them (the work
-- is done) and 'done' too early. So:
--
--   new -> in_progress -> verification_pending -> done | wont_fix
--
-- As before (0008), any state may follow any other. The admin counts
-- verification_pending as open, so a pending check stays in the default list
-- until someone closes it; only 'new' counts as New or triggers anything.
--
-- It applies to every kind (app, manual, content): one status set, one CHECK.
-- set_feedback_triage() (0008) needs no change -- it passes the status through
-- and this CHECK validates it.
-- ---------------------------------------------------------------------------

ALTER TABLE public.feedback_triage
  DROP CONSTRAINT feedback_triage_status_check,
  ADD CONSTRAINT feedback_triage_status_check
    CHECK (status IN ('new', 'in_progress', 'verification_pending', 'done', 'wont_fix'));

COMMENT ON COLUMN public.feedback_triage.status IS
  'new, in_progress, verification_pending (a fix shipped, not yet confirmed by '
  'the user or the data), done, wont_fix -- migrations 0008, 0015.';

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY (dashboard SQL editor, which runs as postgres)
--
--   -- 1. The constraint. Expect CHECK ((status = ANY (ARRAY['new', 'in_progress',
--   --    'verification_pending', 'done', 'wont_fix']))).
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname = 'feedback_triage_status_check';
--
--   -- 2. Triage to the new state, rolled back: t, and one audit entry
--   --    feedback.triage with status from new to verification_pending.
--   BEGIN;
--   SELECT public.set_feedback_triage('app', '00000000-0000-4000-8000-0000000000f5',
--                                     'verification_pending', NULL, NULL, NULL, 'system:verify');   -> t
--   SELECT action, target_type, target_id, details FROM public.audit_log
--   WHERE actor_label = 'system:verify' ORDER BY id DESC LIMIT 1;
--   ROLLBACK;
--
--   -- 3. A status that does not exist is still refused (feedback_triage_status_check).
--   BEGIN; SELECT public.set_feedback_triage('app', gen_random_uuid(), 'verifying', NULL, NULL, NULL, 'system:verify'); ROLLBACK;
-- ---------------------------------------------------------------------------
