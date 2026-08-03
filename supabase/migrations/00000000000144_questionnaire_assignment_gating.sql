-- Assignment-Gated Questionnaires. Two real gaps closed in the existing
-- assessment_assignments table (migration 77) rather than a new table:
--
-- 1. Nothing enforced "one active assignment per member per questionnaire"
--    at the DB level — a coach could insert duplicate pending rows for the
--    same (member, assessment) pair. A partial unique index closes that,
--    and is idempotent by construction: once a row exists for a pair while
--    status = 'pending', a second insert for the same pair while still
--    pending violates the index (the application layer, in
--    app/actions/assessmentAssignments.ts, checks first and treats an
--    existing pending row as success rather than surfacing this as an
--    error to the coach). A new assignment cycle is still possible once
--    the prior one leaves 'pending' (completed/cancelled) since the index
--    predicate only covers pending rows.
--
-- 2. Nothing ever transitioned an assignment's status to 'completed' when
--    the member actually finished the assigned questionnaire — confirmed
--    by reading every reference to assessment_assignments in the app
--    (app/actions/assessmentAssignments.ts, lib/assessment-registry/
--    facts.ts) and finding no write path that ever sets status =
--    'completed' or populates completed_attempt_id. Without this, a
--    completed assignment would stay in facts.pendingAssignment forever,
--    which the Assignment-Gated Questionnaires task depends on being
--    false the moment a member finishes: the member app's "assigned"
--    priority placement must come off as soon as the questionnaire is
--    done. assessment_attempts (migration 73/79/100) is already the one
--    place every one of the 5 completion sources (generic engine, Primal
--    Pattern, Onboarding, Body Assessment, Unified Runtime) converges via
--    an AFTER INSERT trigger on its own source table, and every one of
--    those rows is insert-only (never mutated after creation, per
--    migration 79's own header comment) — so a single AFTER INSERT
--    trigger on assessment_attempts itself is the one correct, already-
--    proven place to close out a matching pending assignment, without
--    touching any of the 5 source-specific trigger functions.

-- 1. One active (pending) assignment per member per questionnaire.
create unique index if not exists assessment_assignments_one_pending_per_member_assessment
  on assessment_assignments (member_id, assessment_definition_id)
  where status = 'pending';

-- 2. Auto-complete a pending assignment the moment its questionnaire is
--    completed. Same EXCEPTION-guarded, "never block the row it fires
--    from" discipline as every trigger in migration 79/100 — a failure
--    here can never roll back or block the attempt's own completion.
create or replace function public.complete_assignment_on_assessment_attempt()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.assessment_assignments
  set status = 'completed',
      completed_attempt_id = new.id,
      updated_at = now()
  where member_id = new.member_id
    and assessment_definition_id = new.assessment_definition_id
    and status = 'pending';

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists complete_assignment_after_assessment_attempt on public.assessment_attempts;
create trigger complete_assignment_after_assessment_attempt
  after insert on public.assessment_attempts
  for each row
  execute function public.complete_assignment_on_assessment_attempt();
