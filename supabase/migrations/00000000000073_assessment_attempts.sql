-- Assessment Attempts — a cross-assessment ledger.
--
-- This does NOT replace wellness_assessments, primal_pattern_assessments,
-- onboarding_submissions, or body_assessments. Those four tables remain
-- the system of record for each assessment's actual question flow,
-- answers, and scoring — per the inventory, their answer shapes are
-- genuinely incompatible (points-scored single-select vs. letter-select
-- vs. raw typed answers vs. media capture, risk list item 8) and
-- forcing them into one shared answers table would mean inventing a
-- lossy common format for data that already has a correct, working home.
--
-- What this table adds: one place to query "every attempt, across every
-- assessment system, for this member" — the Attempt model — without
-- already knowing which of the four underlying tables to look in. Each
-- row here points back at its source row via (source_table, source_id),
-- so full question-level detail is always one join away, never
-- duplicated. Every attempt is its own row here too, exactly like the
-- source tables — nothing is overwritten on retake.
--
-- Populated two ways:
--   1. This migration's own backfill (00000000000074) for real, already-
--      completed historical attempts — see that migration for exactly
--      what evidence backs each backfilled row.
--   2. Going forward, by application write-path code (a build-phase
--      decision, not made here) — this migration intentionally does NOT
--      add triggers on the four source tables, because a trigger runs
--      inside the same transaction as e.g. completeAssessment() and a
--      bug in it could break an existing, working completion flow. A
--      one-time, reviewable backfill is the lower-risk choice for this
--      task; live-sync (trigger vs. explicit dual-write in application
--      code) should be an explicit decision in the build task that
--      actually wires up new UI against this table.
create table assessment_attempts (
  id uuid primary key default gen_random_uuid(),

  member_id uuid not null references auth.users(id) on delete cascade,
  assessment_definition_id uuid not null references assessment_definitions(id),
  assessment_version int not null default 1,

  attempt_type text not null default 'standard'
    check (attempt_type in ('baseline', 'midpoint', 'final', 'retake', 'standard')),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),

  started_at timestamptz not null,
  completed_at timestamptz,

  -- Denormalized copy for attempts written going forward by code that
  -- chooses to populate it; null on every backfilled historical row
  -- (see 00000000000074 — full answer detail for those already lives in
  -- the source table, reachable via source_table/source_id below, and
  -- copying it here would duplicate data that already has a correct home
  -- rather than add anything).
  answers jsonb,

  calculated_score numeric,
  result_classification text,
  result_payload jsonb,

  -- Best-effort context captured at completion time. Null on every
  -- backfilled historical row — membership tiers and program enrollment
  -- did not exist as concepts at the time those attempts happened, so
  -- there is no real value to record for them (see 00000000000074).
  membership_level_at_completion text references membership_tiers(key),
  program_enrollment_id uuid references program_enrollments(id),
  coach_assignment_id uuid references coach_client_assignments(id),

  -- Which underlying system this attempt actually happened in, and that
  -- system's own row for it — the join back to full question-level
  -- detail.
  source_table text not null
    check (source_table in ('wellness_assessments', 'primal_pattern_assessments', 'onboarding_submissions', 'body_assessments')),
  source_id uuid not null,

  -- Origin channel. Every attempt in this product today is member
  -- self-serve (no coach-assigned-attempt flow exists yet per the
  -- inventory), so this defaults accordingly rather than being left
  -- ambiguous.
  source text not null default 'member_self_serve',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (source_table, source_id),

  constraint assessment_attempts_completed_fields check (
    (status = 'completed' and completed_at is not null)
    or
    (status = 'in_progress' and completed_at is null)
  )
);

create index assessment_attempts_member_definition_idx
  on assessment_attempts (member_id, assessment_definition_id, completed_at desc);

alter table assessment_attempts enable row level security;

create policy member_read_own_assessment_attempts on assessment_attempts
  for select
  using (member_id = auth.uid());

create policy member_insert_own_assessment_attempts on assessment_attempts
  for insert
  with check (member_id = auth.uid());

create policy member_update_own_assessment_attempts on assessment_attempts
  for update
  using (member_id = auth.uid());

create policy coach_read_assigned_assessment_attempts on assessment_attempts
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_assessment_attempts on assessment_attempts
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
