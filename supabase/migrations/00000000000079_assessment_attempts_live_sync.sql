-- Assessment Attempts — live sync.
--
-- Migration 00000000000074 backfilled assessment_attempts once, from
-- history that existed at the time that migration ran. Its own header
-- comment flagged that no trigger was added yet and that live-sync should
-- be "an explicit decision in the build task that actually wires up new
-- UI against this table" (00000000000073). The Questionnaires journey
-- (status.ts / facts.ts, via the assessment_status_by_member view) is
-- exactly that UI, and it reads assessment_attempts as its only source of
-- "completed" — without a live-sync mechanism, every assessment completed
-- after the backfill ran would never appear as completed in the new
-- journey (confirmed empirically: a freshly completed wellness_assessments
-- row with no assessment_attempts counterpart produces zero rows from
-- assessment_status_by_member for that member/assessment).
--
-- These triggers close that gap using the exact same field mapping the
-- backfill used per source table, so a row's shape in assessment_attempts
-- never depends on whether it was created by the migration 74 backfill or
-- by one of these triggers afterward. Idempotent via the same
-- `on conflict (source_table, source_id) do nothing` the backfill used —
-- a row is written once, at first completion, and never mutated afterward
-- (matching the table's own "nothing is overwritten on retake" design).
--
-- None of the four source tables' own columns, constraints, statuses, or
-- application write paths are touched — this only adds an AFTER trigger
-- that reads the already-committed NEW row and writes a derived snapshot
-- into the separate assessment_attempts ledger. A failure inside the
-- trigger function is guarded with EXCEPTION so it can never roll back or
-- block the source table's own completion write.

-- 1. CHEK HLC1 + Four Doctors (wellness_assessments).
create or replace function public.sync_assessment_attempt_from_wellness_assessment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_definition_id uuid;
  v_is_first boolean;
begin
  if new.status <> 'completed' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'completed' then
    return new;
  end if;

  select id into v_definition_id from public.assessment_definitions where key = new.questionnaire_id;
  if v_definition_id is null then
    return new;
  end if;

  select not exists (
    select 1 from public.assessment_attempts
    where member_id = new.member_id and assessment_definition_id = v_definition_id
  ) into v_is_first;

  insert into public.assessment_attempts (
    member_id, assessment_definition_id, assessment_version,
    attempt_type, status, started_at, completed_at,
    calculated_score, result_classification, result_payload,
    source_table, source_id
  ) values (
    new.member_id, v_definition_id, new.questionnaire_version,
    case when v_is_first then 'standard' else 'retake' end,
    'completed', new.started_at, new.completed_at,
    new.total_score, new.total_priority,
    jsonb_build_object('total_score', new.total_score, 'total_max_score', new.total_max_score, 'total_priority', new.total_priority),
    'wellness_assessments', new.id
  )
  on conflict (source_table, source_id) do nothing;

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists sync_assessment_attempt_after_wellness_assessment on public.wellness_assessments;
create trigger sync_assessment_attempt_after_wellness_assessment
  after insert or update on public.wellness_assessments
  for each row
  execute function public.sync_assessment_attempt_from_wellness_assessment();

-- 2. Primal Pattern (primal_pattern_assessments).
create or replace function public.sync_assessment_attempt_from_primal_pattern_assessment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_definition_id uuid;
  v_is_first boolean;
begin
  if new.status <> 'completed' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'completed' then
    return new;
  end if;

  select id into v_definition_id from public.assessment_definitions where key = new.questionnaire_id;
  if v_definition_id is null then
    return new;
  end if;

  select not exists (
    select 1 from public.assessment_attempts
    where member_id = new.member_id and assessment_definition_id = v_definition_id
  ) into v_is_first;

  insert into public.assessment_attempts (
    member_id, assessment_definition_id, assessment_version,
    attempt_type, status, started_at, completed_at,
    result_classification, result_payload,
    source_table, source_id
  ) values (
    new.member_id, v_definition_id, new.questionnaire_version,
    case when v_is_first then 'standard' else 'retake' end,
    'completed', new.started_at, new.completed_at,
    new.result,
    jsonb_build_object('a_count', new.a_count, 'b_count', new.b_count, 'skipped_count', new.skipped_count, 'both_count', new.both_count),
    'primal_pattern_assessments', new.id
  )
  on conflict (source_table, source_id) do nothing;

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists sync_assessment_attempt_after_primal_pattern_assessment on public.primal_pattern_assessments;
create trigger sync_assessment_attempt_after_primal_pattern_assessment
  after insert or update on public.primal_pattern_assessments
  for each row
  execute function public.sync_assessment_attempt_from_primal_pattern_assessment();

-- 3. Onboarding (onboarding_submissions). Every row is a completed attempt
--    by construction (see 00000000000074's comment) — insert-only, fires
--    once per submission.
create or replace function public.sync_assessment_attempt_from_onboarding_submission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_definition_id constant uuid := '6b86f205-a75b-452f-b926-4c5dffc29baa';
  v_assessment_version int;
begin
  select assessment_version into v_assessment_version
  from public.onboarding_assessment_versions where id = new.assessment_version_id;

  insert into public.assessment_attempts (
    member_id, assessment_definition_id, assessment_version,
    attempt_type, status, started_at, completed_at,
    source_table, source_id
  ) values (
    new.user_id, v_definition_id, coalesce(v_assessment_version, 1),
    case when new.assessment_type = 'baseline' then 'baseline' else 'retake' end,
    'completed', new.submitted_at, new.submitted_at,
    'onboarding_submissions', new.id
  )
  on conflict (source_table, source_id) do nothing;

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists sync_assessment_attempt_after_onboarding_submission on public.onboarding_submissions;
create trigger sync_assessment_attempt_after_onboarding_submission
  after insert on public.onboarding_submissions
  for each row
  execute function public.sync_assessment_attempt_from_onboarding_submission();

-- 4. Body Assessment (body_assessments). Fires the first time completed_at
--    is set (matches the backfill's `where completed_at is not null`
--    scope and the status view's `where completed_at is null` draft
--    definition) — regardless of which of the several post-completion
--    status values (submitted/analyzing/analyzed/coach_reviewed/archived)
--    the row is in when that happens.
create or replace function public.sync_assessment_attempt_from_body_assessment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_definition_id constant uuid := '6c071b7d-ca9a-4f52-a7c0-87ae69de726b';
begin
  if new.completed_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.completed_at is not null then
    return new;
  end if;

  insert into public.assessment_attempts (
    member_id, assessment_definition_id, assessment_version,
    attempt_type, status, started_at, completed_at,
    result_payload,
    source_table, source_id
  ) values (
    new.member_id, v_definition_id, 1,
    'standard', 'completed', new.started_at, new.completed_at,
    jsonb_build_object('assessment_type', new.assessment_type, 'status', new.status, 'provider_status', new.provider_status),
    'body_assessments', new.id
  )
  on conflict (source_table, source_id) do nothing;

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists sync_assessment_attempt_after_body_assessment on public.body_assessments;
create trigger sync_assessment_attempt_after_body_assessment
  after insert or update on public.body_assessments
  for each row
  execute function public.sync_assessment_attempt_from_body_assessment();
