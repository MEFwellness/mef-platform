-- Prescription Intelligence Engine.
--
-- The engine that decides today's movement STRATEGY before any exercise is
-- picked — reusing, not replacing, the Coach Program Builder / Workout
-- Prescription System (migration 82). A coach triggers a run for one of
-- their members; the engine reads the member's Movement Profile (migration
-- 81), Universal Registry findings and wearable metrics (migration 40),
-- daily_checkins (migration 13/21/63), and exercise completion history
-- (migration 81), decides which strategy blocks today's prescription needs
-- (breathing, mobility, activation, stability, strength, power,
-- conditioning, recovery), searches mef_exercise_metadata (migration 80)
-- for each block, and writes one frozen, permanent record of the whole
-- decision — never re-derived, never silently changed by a later profile
-- edit. A coach reviews it, edits/substitutes/locks/removes exercises, and
-- either approves it (which materializes a real coach_program_template +
-- coach_program_assignment + coach_assigned_workout* through the existing
-- Program Builder data layer — this migration adds no second prescription
-- format) or rejects it. Members never see this schema at all — only the
-- resulting coach_assigned_workout, once published, same as every other
-- coach-authored program.
--
--   prescription_snapshots        One row per engine run = one permanent,
--                                   immutable-after-review record of "what
--                                   the engine decided and why." Holds the
--                                   frozen Layer 1/2 input snapshots
--                                   (movement profile, readiness,
--                                   assessments), the corrective priorities
--                                   and goals considered, the computed
--                                   confidence, and — when the engine
--                                   declines to prescribe — why. Coach-only,
--                                   editable only while status is
--                                   'pending_coach_review'; a status
--                                   transition to 'approved'/'rejected' is
--                                   the last write RLS ever allows on that
--                                   row. A later re-run creates a new
--                                   snapshot; this one is never mutated to
--                                   reflect it.
--
--   prescription_blocks           The Layer 3 strategy — one row per
--                                   included block (not every block exists
--                                   every run), each with its own objective,
--                                   required/preferred/excluded movement
--                                   tags, equipment, difficulty, time
--                                   allocation, and the plain-language
--                                   reasoning behind including it, always
--                                   traceable to real data on the parent
--                                   snapshot.
--
--   prescription_block_exercises  The Layer 4 output — the specific
--                                   mef_exercise_metadata-backed exercises
--                                   (provider+external_id, same convention
--                                   as coach_program_template_exercises)
--                                   the engine selected for each block, with
--                                   a conservative prescription (sets/reps/
--                                   tempo/rest/hold), why each one was
--                                   picked, and — if a coach swaps one out —
--                                   the original pick preserved for
--                                   substitution-history purposes.
--
--   prescription_constraints      The Constraint Engine's output — real
--                                   issues (pain, poor breathing, high
--                                   stress, missing assessments, a red flag)
--                                   identified before any exercise was
--                                   chosen, each optionally linked to the
--                                   block that addresses it.
--
-- RLS: unlike coach_assigned_workouts, there is no member SELECT policy on
-- any of these four tables, anywhere, ever — "Members never see:
-- recommendation scores, internal ranking, confidence score, decision
-- engine" is enforced by Postgres, not app-layer hiding, same posture as
-- coach_notes and coach_program_templates. Coaches read/write only their
-- own assigned members' rows (is_active_coach_for), and only while a
-- snapshot is still 'pending_coach_review' for INSERT/UPDATE/DELETE on the
-- child block/exercise/constraint tables — once a snapshot leaves that
-- status the whole tree is frozen, same "Postgres-enforced immutability,
-- not just discipline" posture as coach_assigned_workout_exercises'
-- missing coach UPDATE policy.

-- ============================================================================
-- Program Section taxonomy — widen additively to add 'power', the same
-- convention migration 80 already used to add 'stability'. Every block/
-- section taxonomy in this codebase reuses this exact list (see
-- movement.types.ts's header) rather than inventing a parallel one — this
-- migration's own prescription_blocks.block_type does the same below.
-- ============================================================================
alter table movement_session_exercises drop constraint movement_session_exercises_section_check;
alter table movement_session_exercises add constraint movement_session_exercises_section_check
  check (section in (
    'preparation', 'breathing', 'mobility', 'activation', 'stability',
    'strength', 'power', 'conditioning', 'recovery'
  ));

alter table mef_exercise_metadata drop constraint mef_exercise_metadata_program_section_check;
alter table mef_exercise_metadata add constraint mef_exercise_metadata_program_section_check
  check (program_section in (
    'preparation', 'breathing', 'mobility', 'activation', 'stability',
    'strength', 'power', 'conditioning', 'recovery'
  ));

-- ============================================================================
-- health_timeline_events.event_type — widen additively, same convention
-- migrations 58/80/81/82 already used on this exact table.
-- ============================================================================
alter table health_timeline_events drop constraint health_timeline_events_event_type_check;
alter table health_timeline_events add constraint health_timeline_events_event_type_check
  check (event_type in (
    'onboarding_completed', 'reassessment_completed', 'checkin_submitted',
    'assessment_published', 'wearable_synced',
    'streak_milestone', 'trend_improving', 'trend_declining', 'wearable_connected',
    'movement_session_completed', 'evening_reflection_submitted',
    'exercise_completed', 'exercise_favorited', 'exercise_unfavorited',
    'exercise_skipped', 'movement_coach_review', 'movement_capability_milestone',
    'movement_program_completed',
    'coach_workout_assigned', 'coach_workout_completed', 'coach_workout_skipped',
    'prescription_generated', 'prescription_approved', 'prescription_rejected'
  ));

-- ============================================================================
-- Explanation fields on the existing Program Builder tables — additive,
-- nullable, so every existing coach-authored-from-scratch template/
-- assignment keeps working unchanged (these are simply never populated for
-- them). Lets an engine-generated block/exercise's "why" travel through the
-- exact same frozen-copy pipeline (template -> assigned workout) the
-- Program Builder already has, rather than inventing a second delivery
-- path for member-visible explanations.
-- ============================================================================
alter table coach_program_template_sections add column block_reasoning text;
alter table coach_program_template_exercises add column selection_reasoning text;
alter table coach_assigned_workout_sections add column block_reasoning text;
alter table coach_assigned_workout_exercises add column selection_reasoning text;

-- ============================================================================
-- prescription_snapshots
-- ============================================================================
create table prescription_snapshots (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  coach_id uuid not null references auth.users(id),

  trigger_source text not null default 'coach_manual' check (trigger_source in (
    'coach_manual', 'member_request'
  )),
  requested_by uuid not null references auth.users(id),

  generated_at timestamptz not null default now(),

  -- Frozen copies of exactly what Layer 1 (who is this person) and Layer 2
  -- (how are they today) actually read, so a later Movement Profile edit or
  -- a new check-in never rewrites the reasoning behind a past prescription.
  -- Shape documented in lib/prescription-intelligence/types.ts — same
  -- "structured jsonb bag, shape kept in application code" convention as
  -- movement_sessions.selection_reasons.
  movement_profile_snapshot jsonb not null default '{}'::jsonb,
  readiness_snapshot jsonb not null default '{}'::jsonb,
  assessment_snapshot jsonb not null default '{}'::jsonb,

  corrective_priorities text[] not null default '{}',
  goals text[] not null default '{}',
  equipment text[] not null default '{}',
  time_available_minutes int,

  strategy_summary text,

  -- Prescription Confidence — coach-only, never rendered to a member (see
  -- this migration's header). Same numeric[0,1] + bucketed-level convention
  -- as root_score_snapshots' root_confidence/root_confidence_level.
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  confidence_level text not null default 'building' check (confidence_level in (
    'building', 'low', 'moderate', 'high'
  )),
  -- Array<{label, detail}> — every entry traces to a real fact, same
  -- discipline as movement_sessions.selection_reasons.
  confidence_reasons jsonb not null default '[]'::jsonb,

  status text not null default 'pending_coach_review' check (status in (
    'pending_coach_review', 'approved', 'rejected', 'blocked'
  )),
  -- Populated only when status = 'blocked' — the "When Not To Prescribe"
  -- gate fired before any block/exercise was chosen.
  block_reason text check (block_reason in (
    'red_flag', 'missing_baseline_assessment', 'missing_movement_assessment',
    'extremely_poor_readiness', 'insufficient_data'
  )),
  recommended_alternative text check (recommended_alternative in (
    'recovery_session', 'mobility_session', 'breathing_session',
    'coach_review', 'medical_follow_up'
  )),

  -- Array<{action, targetType, targetId, detail}> — every coach edit made
  -- before approval (replace/lock/remove/reorder/edit), same jsonb-bag
  -- convention as alternate_exercises. Rows themselves are also mutated
  -- directly (see prescription_block_exercises), this is the human-readable
  -- audit trail of what changed and why.
  coach_modifications jsonb not null default '[]'::jsonb,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  rejection_reason text,

  -- Lineage only (on delete set null, never re-read to render a workout) —
  -- same posture as coach_program_assignments.template_id.
  resulting_template_id uuid references coach_program_templates(id) on delete set null,
  resulting_assignment_id uuid references coach_program_assignments(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index prescription_snapshots_member_idx on prescription_snapshots (member_id, generated_at desc);
create index prescription_snapshots_coach_idx on prescription_snapshots (coach_id, status);

alter table prescription_snapshots enable row level security;

-- No member SELECT policy anywhere in this migration — see header.
create policy coach_read_assigned_prescription_snapshots on prescription_snapshots
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_insert_assigned_prescription_snapshots on prescription_snapshots
  for insert
  with check (
    coach_id = auth.uid()
    and public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

-- Once a snapshot leaves 'pending_coach_review' (approved/rejected/blocked
-- is set at INSERT time in the blocked case, or by this very UPDATE in the
-- approve/reject case) no further coach UPDATE can ever match this policy's
-- USING clause again — "This snapshot never changes after assignment"
-- enforced by Postgres, not just discipline.
-- WITH CHECK is deliberately narrower than USING: USING gates which rows
-- can be touched at all (only while still 'pending_coach_review'), but
-- approving/rejecting is itself the update that moves status away from
-- 'pending_coach_review' — if WITH CHECK repeated that same condition (Postgres'
-- default when WITH CHECK is omitted), the new row would have to satisfy
-- status = 'pending_coach_review' too, which no approval/rejection ever
-- does, permanently blocking the very transition this policy exists to
-- allow. WITH CHECK here only re-affirms ownership on the row being
-- written, the same way the old row's ownership was already confirmed by
-- USING.
create policy coach_update_pending_prescription_snapshots on prescription_snapshots
  for update
  using (
    coach_id = auth.uid()
    and public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
    and status = 'pending_coach_review'
  )
  with check (
    coach_id = auth.uid()
    and public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_prescription_snapshots on prescription_snapshots
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- Lineage only, on delete set null, never re-read to render a workout —
-- added now that prescription_snapshots exists.
alter table coach_assigned_workouts
  add column source_prescription_snapshot_id uuid references prescription_snapshots(id) on delete set null;

-- ============================================================================
-- prescription_blocks
-- ============================================================================
create table prescription_blocks (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references prescription_snapshots(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  coach_id uuid not null references auth.users(id),

  block_type text not null check (block_type in (
    'preparation', 'breathing', 'mobility', 'activation', 'stability',
    'strength', 'power', 'conditioning', 'recovery'
  )),
  sequence_index int not null default 0,

  primary_objective text not null,
  secondary_objective text,
  required_movement_tags text[] not null default '{}',
  preferred_movement_tags text[] not null default '{}',
  excluded_tags text[] not null default '{}',
  equipment text[] not null default '{}',
  difficulty text check (difficulty in ('beginner', 'intermediate', 'advanced')),
  movement_pattern text,
  time_allocation_seconds int,
  -- The mef_exercise_metadata.program_section value this block searches
  -- against — equal to block_type for every value except when the catalog
  -- has no 'power'-tagged content yet, in which case the engine falls back
  -- to 'strength' (see lib/prescription-intelligence/exerciseSelection.ts).
  exercise_category text,

  block_reasoning text not null,

  created_at timestamptz not null default now()
);

create index prescription_blocks_snapshot_idx on prescription_blocks (snapshot_id, sequence_index);

alter table prescription_blocks enable row level security;

create policy coach_read_assigned_prescription_blocks on prescription_blocks
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_insert_assigned_prescription_blocks on prescription_blocks
  for insert
  with check (
    coach_id = auth.uid()
    and public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

-- Coach edit/reorder/lock surface, but only while the parent snapshot is
-- still under review — see this migration's header.
create policy coach_update_pending_prescription_blocks on prescription_blocks
  for update
  using (
    coach_id = auth.uid()
    and public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
    and exists (
      select 1 from prescription_snapshots s
      where s.id = snapshot_id and s.status = 'pending_coach_review'
    )
  );

create policy coach_delete_pending_prescription_blocks on prescription_blocks
  for delete
  using (
    coach_id = auth.uid()
    and public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
    and exists (
      select 1 from prescription_snapshots s
      where s.id = snapshot_id and s.status = 'pending_coach_review'
    )
  );

create policy platform_admin_all_prescription_blocks on prescription_blocks
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================================
-- prescription_block_exercises
-- ============================================================================
create table prescription_block_exercises (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references prescription_blocks(id) on delete cascade,
  snapshot_id uuid not null references prescription_snapshots(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  coach_id uuid not null references auth.users(id),

  -- Not a foreign key — same provider+external_id convention as
  -- coach_program_template_exercises and mef_exercise_metadata.
  provider text not null default 'exercise_api_dev',
  external_id text not null,
  exercise_name text not null,
  sequence_index int not null default 0,

  -- A deliberately conservative prescription — the engine's own conclusion,
  -- not the full ExercisePrescriptionFields set (load/rpe/band color/etc.
  -- are nuance a coach adds at approval time; see lib/prescription-
  -- intelligence/exerciseSelection.ts).
  sets int,
  reps text,
  rep_range_low int,
  rep_range_high int,
  time_seconds int,
  rest_seconds int,
  tempo text,
  hold_duration_seconds int,
  side text check (side in ('left', 'right', 'both', 'alternating')),
  unilateral boolean not null default false,

  selection_reasoning text not null,
  corrective_purpose text,
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),

  -- Locked exercises are skipped by any future re-run's substitution pass
  -- (see lib/prescription-intelligence/progression.ts) — the coach's own
  -- pick is never silently swapped out.
  is_locked boolean not null default false,

  is_coach_modified boolean not null default false,
  original_provider text,
  original_external_id text,
  original_exercise_name text,
  substitution_reason text,

  created_at timestamptz not null default now()
);

create index prescription_block_exercises_block_idx
  on prescription_block_exercises (block_id, sequence_index);
create index prescription_block_exercises_snapshot_idx
  on prescription_block_exercises (snapshot_id);

alter table prescription_block_exercises enable row level security;

create policy coach_read_assigned_prescription_block_exercises on prescription_block_exercises
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_insert_assigned_prescription_block_exercises on prescription_block_exercises
  for insert
  with check (
    coach_id = auth.uid()
    and public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_update_pending_prescription_block_exercises on prescription_block_exercises
  for update
  using (
    coach_id = auth.uid()
    and public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
    and exists (
      select 1 from prescription_snapshots s
      where s.id = snapshot_id and s.status = 'pending_coach_review'
    )
  );

create policy coach_delete_pending_prescription_block_exercises on prescription_block_exercises
  for delete
  using (
    coach_id = auth.uid()
    and public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
    and exists (
      select 1 from prescription_snapshots s
      where s.id = snapshot_id and s.status = 'pending_coach_review'
    )
  );

create policy platform_admin_all_prescription_block_exercises on prescription_block_exercises
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================================
-- prescription_constraints
-- ============================================================================
create table prescription_constraints (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references prescription_snapshots(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  coach_id uuid not null references auth.users(id),

  constraint_type text not null check (constraint_type in (
    'poor_breathing', 'limited_mobility', 'poor_recovery', 'pain',
    'movement_dysfunction', 'high_stress', 'sleep_deprivation',
    'red_flag', 'missing_assessment'
  )),
  description text not null,
  severity text not null default 'moderate' check (severity in (
    'low', 'moderate', 'high', 'blocking'
  )),
  -- Array<{type, id, note?}> — same evidence-ref shape used throughout this
  -- schema (HealthTimelineEvidenceRef).
  evidence_refs jsonb not null default '[]'::jsonb,
  addressed_by_block_id uuid references prescription_blocks(id) on delete set null,

  created_at timestamptz not null default now()
);

create index prescription_constraints_snapshot_idx on prescription_constraints (snapshot_id);

alter table prescription_constraints enable row level security;

create policy coach_read_assigned_prescription_constraints on prescription_constraints
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_insert_assigned_prescription_constraints on prescription_constraints
  for insert
  with check (
    coach_id = auth.uid()
    and public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_prescription_constraints on prescription_constraints
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
