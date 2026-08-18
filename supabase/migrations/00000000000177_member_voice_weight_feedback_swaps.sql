-- ============================================================================
-- 177. The member's voice inside her own program.
-- ============================================================================
-- Until now a member could read her program, walk it, and mark each
-- exercise done or skipped. She could not say what weight she used, she
-- could not say an exercise hurt, and she had no way to ask for a
-- different one. Everything she might have wanted to say had to be typed
-- into a free-text box her coach would read days later, or not said at
-- all.
--
-- This migration gives three things a place to live.
--
--   1. WHAT SHE LIFTED.  Four columns on the frozen exercise row, beside
--      the completion state that has always been mutable there. One row
--      per exercise per session occurrence is already how this table is
--      shaped, so a weight logged in week 1 and a weight logged in week 3
--      are two rows that already know which week they belong to
--      (coach_assigned_workouts.program_week). That IS the progression
--      history; no second table is needed to hold it, and adding one
--      would mean two records of the same fact.
--
--   2. WHAT SHE THOUGHT OF IT.  member_exercise_feedback: one row per
--      report, carrying the reason she picked, her own words if she typed
--      any, what the app did about it, and the swap it produced if it
--      produced one. This is a proper domain table, not an event log: an
--      event says something happened, and this says what was decided.
--
--   3. WHAT MUST NOT BE OFFERED AGAIN.  member_exercise_avoidance: the
--      short list of exercises the swap engine will never put in front of
--      her. Written from exactly one place in the app
--      (lib/programs/feedback/data.ts) so it cannot drift from the
--      feedback that produced it.
--
-- member_wellness_events widens by five, per the rule this table has
-- followed since migration 63: widen the constraint, never add a second
-- events table. They are operational, not product analytics
-- (is_product_analytics_event_type is deliberately left alone), and the
-- payload carries a reason and a week, never a finding and never a
-- member's typed words.
--
-- Also here, because the coach asked for it after reading migration 176's
-- report: "Split squat (L)" becomes "Bodyweight Split Squat". See
-- section 7.
-- ============================================================================

-- ============================================================================
-- 1) What she lifted.
-- ============================================================================
-- These sit beside status, member_notes, difficulty_rating and
-- comfort_rating, which have been the mutable member-facing half of this
-- row since migration 82. The prescription half is still frozen.
--
-- The weight is OPTIONAL and never blocks completing anything. A hold or a
-- timed exercise gets no field at all on her screen
-- (lib/programs/weightLogging.ts decides, from the prescription's own
-- shape), and a bodyweight strength movement gets one anyway, because
-- plenty of people hold a dumbbell for a glute bridge.
alter table public.coach_assigned_workout_exercises
  add column if not exists logged_load numeric(6, 2)
    check (logged_load is null or (logged_load > 0 and logged_load <= 2000)),
  add column if not exists logged_load_unit text
    check (logged_load_unit is null or logged_load_unit in ('lbs', 'kg')),
  add column if not exists logged_load_per_side boolean not null default false,
  add column if not exists logged_load_at timestamptz;

comment on column public.coach_assigned_workout_exercises.logged_load is
  'What the member says she actually used on this occurrence of this exercise. Optional, never required to complete anything, and never the same thing as the prescribed load column above it, which is what her coach asked for.';
comment on column public.coach_assigned_workout_exercises.logged_load_per_side is
  'True when the number is per side, which is what a member reads on a unilateral exercise. Stored rather than re-derived so a later reader never has to guess what the number meant.';

-- The prefill read: her most recent logged weight for one exercise. Also
-- the read a progression engine makes per exercise over time.
create index if not exists coach_assigned_workout_exercises_logged_load_idx
  on public.coach_assigned_workout_exercises (member_id, external_id, logged_load_at desc)
  where logged_load is not null;

-- ============================================================================
-- 2) An exercise she has stopped.
-- ============================================================================
-- 'stopped' is a widening of the status vocabulary, not a replacement for
-- 'skipped'. They mean different things and a coach must be able to tell
-- them apart: skipped is "not today", stopped is "this one hurt me and I
-- am not doing it until you have looked at it".
alter table public.coach_assigned_workout_exercises
  drop constraint if exists coach_assigned_workout_exercises_status_check;

alter table public.coach_assigned_workout_exercises
  add constraint coach_assigned_workout_exercises_status_check
  check (status in (
    'not_started', 'in_progress', 'completed', 'skipped', 'partially_completed',
    'stopped'
  ));

alter table public.coach_assigned_workout_exercises
  add column if not exists stopped_at timestamptz;

comment on column public.coach_assigned_workout_exercises.stopped_at is
  'When a member reported pain or discomfort on this exercise and it was stopped. Distinct from skipped_at semantics: a stop is a safety decision, and the coach is flagged for it.';

-- ============================================================================
-- 3) What a slot will accept, carried into the snapshot.
-- ============================================================================
-- A blueprint slot knows whether it is locked, what movement pattern it
-- holds and what it will take instead. A frozen assigned exercise knew
-- none of that, because nothing downstream had ever needed to ask. A
-- member-initiated swap needs all three, and it must read them off the row
-- she is actually looking at rather than by walking back to a blueprint
-- that may have been revised, archived or replaced since she was given the
-- program.
--
-- So the three travel: slot -> template exercise -> frozen exercise, the
-- same path member_reasoning takes. Null and false are what every existing
-- row carries, and they mean exactly what they meant before this existed:
-- no lock, no recorded pattern, no extra criteria.
alter table public.coach_program_template_exercises
  add column if not exists movement_pattern text,
  add column if not exists is_locked boolean not null default false,
  add column if not exists replacement_criteria jsonb not null default '{}'::jsonb
    check (jsonb_typeof(replacement_criteria) = 'object');

alter table public.coach_assigned_workout_exercises
  add column if not exists movement_pattern text,
  add column if not exists is_locked boolean not null default false,
  add column if not exists replacement_criteria jsonb not null default '{}'::jsonb
    check (jsonb_typeof(replacement_criteria) = 'object'),
  add column if not exists swapped_from_external_id text,
  add column if not exists swapped_from_exercise_name text,
  add column if not exists swapped_at timestamptz;

comment on column public.coach_assigned_workout_exercises.is_locked is
  'True when the coach or the blueprint chose this exercise specifically. A locked exercise offers a member no swap at all, and her screen says so in words rather than hiding the control.';
comment on column public.coach_assigned_workout_exercises.swapped_from_exercise_name is
  'What was here before a member swapped it. The row keeps its own history so a coach reading one occurrence can see it changed without joining anything.';

-- ============================================================================
-- 4) Every report she makes.
-- ============================================================================
create table if not exists public.member_exercise_feedback (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  coach_id uuid references auth.users(id),

  -- Where she was when she said it. The exercise row is the anchor; the
  -- workout and assignment are kept so a later reader never has to walk
  -- back up through a row that may have been swapped since.
  assigned_workout_exercise_id uuid
    references public.coach_assigned_workout_exercises(id) on delete set null,
  assigned_workout_id uuid
    references public.coach_assigned_workouts(id) on delete set null,
  assignment_id uuid
    references public.coach_program_assignments(id) on delete set null,
  program_group_key text,
  program_week int,

  -- What the exercise was at the moment she reported it. Denormalized on
  -- purpose: the row above it may be swapped a second later, and a report
  -- about Split Squat must not silently become a report about something
  -- else.
  provider text not null default 'your_move',
  external_id text not null,
  exercise_name text not null,

  reason text not null check (reason in (
    'pain', 'too_difficult', 'too_easy', 'do_not_understand',
    'no_equipment', 'no_space', 'not_comfortable', 'do_not_like', 'other'
  )),
  -- Only ever her own words, only ever from the "Other" box. Never shown
  -- back to her, never composed into anything, read by her coach.
  other_text text,

  -- Which branch the rules sent her down. Recorded rather than re-derived,
  -- because the rules may get better and what actually happened to her
  -- must stay true.
  branch text not null check (branch in (
    'safety', 'regression', 'progression_note', 'alternatives'
  )),
  outcome text not null check (outcome in (
    'stopped_for_pain', 'swapped', 'kept_original', 'logged_for_coach', 'no_options'
  )),

  -- The swap, when there was one.
  replacement_provider text,
  replacement_external_id text,
  replacement_exercise_name text,
  occurrences_updated int not null default 0,

  initiated_by text not null default 'member' check (initiated_by in ('member', 'coach')),
  coach_notified boolean not null default false,
  coach_reviewed_at timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists member_exercise_feedback_member_idx
  on public.member_exercise_feedback (member_id, created_at desc);
create index if not exists member_exercise_feedback_exercise_idx
  on public.member_exercise_feedback (member_id, external_id, created_at desc);
create index if not exists member_exercise_feedback_attention_idx
  on public.member_exercise_feedback (member_id, coach_notified, coach_reviewed_at);

comment on table public.member_exercise_feedback is
  'One row per report a member makes about one exercise: the reason, her own words, the branch the rules took, and what happened. A domain record, not an event: member_wellness_events says that a report happened, this says what it decided.';

alter table public.member_exercise_feedback enable row level security;

create policy member_read_own_exercise_feedback on public.member_exercise_feedback
  for select using (member_id = auth.uid());

create policy member_insert_own_exercise_feedback on public.member_exercise_feedback
  for insert with check (member_id = auth.uid() and initiated_by = 'member');

create policy coach_read_assigned_exercise_feedback on public.member_exercise_feedback
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

-- A coach marks a report reviewed. She does not get to edit what a member
-- said: there is no coach INSERT policy and the update is only ever used
-- for coach_reviewed_at by the app layer.
create policy coach_update_assigned_exercise_feedback on public.member_exercise_feedback
  for update using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_exercise_feedback on public.member_exercise_feedback
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================================
-- 5) What must not be offered again.
-- ============================================================================
-- Deliberately small, and deliberately a table rather than a view over
-- section 4. A view would have to re-decide, on every read, what counts as
-- "enough dislikes", and that judgement would then live in a SQL
-- expression nobody tests. The decision is made once, in one function, at
-- the moment the report is written.
create table if not exists public.member_exercise_avoidance (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  provider text not null default 'your_move',
  external_id text not null,
  exercise_name text not null,

  source text not null check (source in (
    'pain', 'repeated_dislike', 'repeated_skip', 'swapped_away'
  )),
  -- The feedback report that put it here, when there was one.
  feedback_id uuid references public.member_exercise_feedback(id) on delete set null,

  -- A coach letting an exercise back in is Prompt 8's job. The column
  -- exists now so an avoidance is released rather than deleted, which is
  -- what keeps the history readable.
  released_at timestamptz,
  released_by uuid references auth.users(id),

  created_at timestamptz not null default now(),

  unique (member_id, provider, external_id)
);

create index if not exists member_exercise_avoidance_active_idx
  on public.member_exercise_avoidance (member_id)
  where released_at is null;

comment on table public.member_exercise_avoidance is
  'Exercises the swap engine will never offer this member again, and why. One row per member per exercise; a pain report writes one immediately, repeated dislikes and repeated skips write one once they repeat.';

alter table public.member_exercise_avoidance enable row level security;

create policy member_read_own_exercise_avoidance on public.member_exercise_avoidance
  for select using (member_id = auth.uid());

create policy member_write_own_exercise_avoidance on public.member_exercise_avoidance
  for insert with check (member_id = auth.uid());

create policy member_update_own_exercise_avoidance on public.member_exercise_avoidance
  for update using (member_id = auth.uid());

create policy coach_read_assigned_exercise_avoidance on public.member_exercise_avoidance
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_update_assigned_exercise_avoidance on public.member_exercise_avoidance
  for update using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_exercise_avoidance on public.member_exercise_avoidance
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================================
-- 6) Five more event types.
-- ============================================================================
-- Widen the constraint, never a second events table (migration 63's rule,
-- followed by 146, 147, 150, 151, 152, 153 and 172). Operational, not
-- product analytics: is_product_analytics_event_type is left alone, so
-- none of these reaches the analytics view. The payload carries a reason
-- key, a week and a count. Never her typed words, never a finding.
alter table member_wellness_events drop constraint member_wellness_events_event_type_check;

alter table member_wellness_events add constraint member_wellness_events_event_type_check
  check (event_type in (
    -- Wellness types (migration 63) — real health content, NOT analytics.
    'morning_readiness_recorded',
    'hydration_logged',
    'movement_logged',
    'concern_flagged',
    'evening_reflection_recorded',

    -- Product analytics types (migration 146), behavioral only.
    'signup_completed',
    'session_started',
    'onboarding_started',
    'onboarding_completed',
    'surface_viewed',
    'daily_reset_started',
    'daily_reset_completed',
    'food_scan_performed',
    'food_entry_logged',
    'feature_engaged',
    'paywall_viewed',
    'membership_tier_changed',
    'purchase_completed',

    -- Priority Card (migration 147), behavioral only.
    'priority_shown',
    'priority_action',
    're_entry_shown',

    -- Adaptive Coaching Direction Part 1 (migration 150), behavioral only.
    'coaching_action_delivered',
    'coaching_action_acted',
    'coaching_action_dismissed',

    -- The Weekly Root Review, Part 2 (migration 151), behavioral only.
    'weekly_review_delivered',
    'weekly_review_viewed',
    'weekly_review_completed',
    'weekly_review_question_answered',

    -- Adaptive Coaching Direction Part 3 (migration 152), behavioral only.
    'coaching_thread_escalated',
    'coaching_escalation_resolved',
    'coaching_grades_computed',

    -- Root Movement Level 1 (migration 153), behavioral only.
    'movement_session_viewed',
    'movement_session_started',
    'movement_session_completed',
    'movement_exercise_skipped',

    -- Program lifecycle (migration 172), operational only.
    'program_started',
    'program_week_advanced',
    'program_completed',
    'program_paused',
    'program_resumed',
    'program_replaced',

    -- The member's voice inside her program (this migration), operational.
    'exercise_weight_logged',
    'exercise_feedback_reported',
    'exercise_stopped_for_pain',
    'exercise_swapped',
    'exercise_progression_flagged'
  ));

-- ============================================================================
-- 7) Catalog rename: "Split squat (L)" becomes "Bodyweight Split Squat".
-- ============================================================================
-- Migration 176 renamed the dumbbell row and left this one alone, per that
-- prompt's scope, and flagged it in its report. The coach's answer: rename
-- it and KEEP it client-assignable, because it is the beginner regression
-- a member reporting "too difficult" on Split Squat should be offered.
--
-- "(L)" was vendor plumbing, exactly as "(R)" was. "Bodyweight" is not:
-- it is the word that distinguishes this exercise from the dumbbell one,
-- and without it the catalog would hold two different exercises under one
-- name. That is the narrow case CLAUDE.md's naming rule now names: a
-- variant word describing how the movement is performed is allowed when it
-- is what makes a genuine regression tellable from the movement it
-- regresses.
--
-- Same rule as 176 about what follows and what does not: the catalog is
-- the live record and is renamed, an authored blueprint slot follows the
-- catalog, and the four snapshot/history tables are left alone because
-- renaming inside a frozen snapshot changes what a coach approved after
-- she approved it.
update public.exercise_catalog
set name = 'Bodyweight Split Squat', updated_at = now()
where provider = 'your_move'
  and name = 'Split squat (L)';

update public.program_blueprint_slots
set exercise_name = 'Bodyweight Split Squat', updated_at = now()
where exercise_name = 'Split squat (L)';

-- ============================================================================
-- 8) Assertions (style: migrations 153, 174, 175 and 176).
-- ============================================================================
do $$
declare
  v_renamed int;
  v_old_name int;
  v_assignable boolean;
  v_dumbbell int;
  v_logged int;
  v_locked int;
begin
  -- The rename landed on exactly one catalog row, the old name is gone
  -- from the whole catalog, and the row is still assignable to a member,
  -- which is the entire point of keeping it.
  select count(*) into v_renamed
  from exercise_catalog where name = 'Bodyweight Split Squat';
  if v_renamed <> 1 then
    raise exception 'Expected exactly 1 catalog row named "Bodyweight Split Squat", found %', v_renamed;
  end if;

  select count(*) into v_old_name
  from exercise_catalog where name = 'Split squat (L)';
  if v_old_name <> 0 then
    raise exception 'Catalog still carries "Split squat (L)" on % row(s)', v_old_name;
  end if;

  select is_client_assignable into v_assignable
  from exercise_catalog where name = 'Bodyweight Split Squat';
  if v_assignable is distinct from true then
    raise exception 'Bodyweight Split Squat must stay client assignable: it is the beginner regression';
  end if;

  -- The two are still two, and the dumbbell one still needs a dumbbell.
  select count(*) into v_dumbbell
  from exercise_catalog where name = 'Split Squat' and equipment = 'dumbbell';
  if v_dumbbell <> 1 then
    raise exception 'Expected exactly 1 dumbbell "Split Squat", found %', v_dumbbell;
  end if;

  if exists (
    select 1 from exercise_catalog
    where name = 'Bodyweight Split Squat' and equipment is distinct from 'bodyweight'
  ) then
    raise exception 'Bodyweight Split Squat is not a bodyweight exercise';
  end if;

  -- Every slot's denormalized name still agrees with the catalog row it
  -- points at, over the whole table. Same check migration 176 added, run
  -- again because a rename is exactly what breaks it silently.
  if exists (
    select 1
    from program_blueprint_slots s
    join exercise_catalog c
      on c.provider = s.provider and c.external_id = s.external_id
    where s.exercise_name is distinct from c.name
  ) then
    raise exception 'A blueprint slot name disagrees with its catalog row';
  end if;

  -- Nothing that already existed gained a value. Every column added here
  -- is null or its default on every pre-existing row, which is the state
  -- that means "this program was assigned before a member had a voice".
  select count(*) into v_logged
  from coach_assigned_workout_exercises where logged_load is not null;
  if v_logged <> 0 then
    raise exception '% assigned exercises already carry a logged load', v_logged;
  end if;

  select count(*) into v_locked
  from coach_assigned_workout_exercises where is_locked = true;
  if v_locked <> 0 then
    raise exception '% assigned exercises already read as locked', v_locked;
  end if;

  if exists (select 1 from coach_assigned_workout_exercises where status = 'stopped') then
    raise exception 'An assigned exercise already reads as stopped';
  end if;

  -- The two new tables exist, are empty, and have row level security on.
  if (select count(*) from member_exercise_feedback) <> 0 then
    raise exception 'member_exercise_feedback should be created empty';
  end if;
  if (select count(*) from member_exercise_avoidance) <> 0 then
    raise exception 'member_exercise_avoidance should be created empty';
  end if;

  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'member_exercise_feedback' and rowsecurity = true
  ) then
    raise exception 'member_exercise_feedback has row level security off';
  end if;
  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'member_exercise_avoidance' and rowsecurity = true
  ) then
    raise exception 'member_exercise_avoidance has row level security off';
  end if;

  -- Neither new table is reachable by a signed-in member who is not the
  -- member the row belongs to: there is no blanket authenticated policy on
  -- either of them.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('member_exercise_feedback', 'member_exercise_avoidance')
      and qual = 'true'
  ) then
    raise exception 'A new table carries an unconditional read policy';
  end if;
end $$;
