BEGIN;

-- ---------------------------------------------------------------------------
-- 0010: triage for content feedback.
--
-- Content ratings (cyclea-app 0038, read through the app view
-- content_feedback_admin, 0067) join app feedback in the admin. A rating WITH
-- a note can be triaged like app feedback -- status, note, link -- in
-- feedback_triage, under the new kind 'content'. A bare thumb has nothing to
-- act on and gets no triage; the admin enforces that, as it reads the note.
--
-- The id is content_feedback.id in the APP project. It stays the same when
-- the user changes their mind (the app upserts on user + item), so a triage
-- row follows the rating. Like 'app', it cannot be checked for existence from
-- here; set_feedback_triage() (0008) needs no change, and its audit target
-- becomes 'content_feedback' from the kind.
--
-- As for every kind, the triage row never copies what the user wrote.
-- ---------------------------------------------------------------------------

ALTER TABLE public.feedback_triage
  DROP CONSTRAINT feedback_triage_kind_check,
  ADD CONSTRAINT feedback_triage_kind_check CHECK (kind IN ('app', 'manual', 'content'));

COMMENT ON COLUMN public.feedback_triage.kind IS
  'Which table feedback_id points into: app = app_feedback and content = '
  'content_feedback in the APP project (no foreign key possible), manual = '
  'manual_feedback here -- migrations 0008, 0010.';

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY (dashboard SQL editor, which runs as postgres)
--
--   -- 1. The constraint. Expect CHECK ((kind = ANY (ARRAY['app', 'manual', 'content']))).
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname = 'feedback_triage_kind_check';
--
--   -- 2. Triage of a content rating, rolled back: a row, and one audit entry
--   --    feedback.triage -> content_feedback:<id>, without the note text.
--   BEGIN;
--   SELECT public.set_feedback_triage('content', '00000000-0000-4000-8000-0000000000c1',
--                                     'done', 'verify', NULL, NULL, 'system:verify');   -> t
--   SELECT kind, status FROM public.feedback_triage WHERE feedback_id = '00000000-0000-4000-8000-0000000000c1';
--   SELECT action, target_type, target_id, details FROM public.audit_log
--   WHERE actor_label = 'system:verify' ORDER BY id DESC LIMIT 1;
--   ROLLBACK;
--
--   -- 3. A kind that does not exist is still refused (feedback_triage_kind_check).
--   BEGIN; SELECT public.set_feedback_triage('other', gen_random_uuid(), 'done', NULL, NULL, NULL, 'system:verify'); ROLLBACK;
-- ---------------------------------------------------------------------------
