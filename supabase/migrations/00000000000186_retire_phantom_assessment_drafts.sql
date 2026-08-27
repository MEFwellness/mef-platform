-- Retire the empty drafts a completed assessment left behind.
--
-- WHAT WENT WRONG. The take pages of the free experiences (and of the
-- Whole-Body Check-In) create a questionnaire session as a side effect of
-- RENDERING. Finishing an assessment is a Next.js Server Action, and a
-- Server Action re-renders the page it was called from, so the act of
-- finishing re-ran the take page and started a brand-new, empty session of
-- the assessment that had just been completed. Locally that new session
-- appeared 72ms after the completion; in production the gap is 1.4 to 2.5
-- seconds.
--
-- WHY IT MATTERED. assessment_status_by_member deliberately lets an open
-- draft outrank a past completion, so one empty draft made every surface
-- in the app forget the member had ever finished: the Home card went back
-- to "Continue", the Questionnaires page counted "0 of 3 complete", the
-- Priority Card told her to "Pick up Core Values Snapshot where you left
-- off", the free-arc pop-up invited her to the same conversation on every
-- login, and the prerequisite chain locked Life Signal Check behind a Core
-- Values Snapshot she had in fact completed. One member answered all twelve
-- Core Values Snapshot questions four separate times.
--
-- The code fix (lib/assessment-runtime/data.ts) stops new ones being made.
-- This retires the ones already in the database.
--
-- SAFETY. Three conditions, all required, and it never touches a completed
-- session:
--   1. status = 'in_progress'  (a completed session is never a candidate)
--   2. the session has ZERO stored answers (nobody typed anything into it)
--   3. a COMPLETED session of the same assessment, for the same member,
--      finished at or before this draft was started
-- A member who genuinely abandoned an assessment part way keeps her draft,
-- because it has answers in it. A member who genuinely abandoned it having
-- answered nothing, and who had never completed it, keeps hers too,
-- because condition 3 fails.
--
-- Idempotent: re-running it finds nothing left to delete.

do $$
declare
  v_deleted integer;
begin
  with phantom as (
    select s.id
    from public.unified_assessment_sessions s
    where s.status = 'in_progress'
      and not exists (
        select 1 from public.unified_assessment_answers a where a.session_id = s.id
      )
      and exists (
        select 1
        from public.unified_assessment_sessions done
        where done.member_id = s.member_id
          and done.assessment_definition_id = s.assessment_definition_id
          and done.status = 'completed'
          and done.completed_at is not null
          and done.completed_at <= s.started_at
      )
  )
  delete from public.unified_assessment_sessions t
  using phantom p
  where t.id = p.id;

  get diagnostics v_deleted = row_count;
  raise notice 'retire_phantom_assessment_drafts: removed % empty draft session(s) left behind by a completion', v_deleted;
end $$;
