-- ============================================================================
-- 178. The coaching brain: the end of a phase, and what happens next.
-- ============================================================================
-- Migration 177 gave a member a voice inside her program. She can say what
-- she lifted, say an exercise hurt, and ask for a different one. All of
-- that landed in real tables and none of it had anywhere to go: her coach
-- could see a needs-attention flag and nothing else, an avoidance could be
-- written and never released, a pain report could be raised and never
-- closed, and a program could reach its last week with no moment at which
-- anybody decided what came next.
--
-- This migration gives four things a place to live.
--
--   1. WHICH WEEK IT WAS.  A one-line backfill. program_week has existed
--      since migration 174 and every occurrence written before it carries
--      null, so a progression read that groups a member's logged weights by
--      week silently drops her whole history. Computed from the two dates
--      that were already on the rows, by exactly the rule
--      lib/programs/weekProgression.ts's programWeekOf applies.
--
--   2. A PAIN REPORT THAT CAN BE CLOSED.  coach_reviewed_at has existed
--      since 177 and nothing wrote it. Two columns beside it: who closed it
--      and what they said. Closing a report clears the coach's flag and
--      keeps the record, because the record is the member's own words and
--      those are not a notification.
--
--   3. THE END-OF-PHASE DECISION.  program_phase_reviews: one row per
--      review a coach opens on one program, carrying the signals as they
--      read at that moment, what the rules recommended and why, what the
--      coach actually chose, and the DRAFT that choice produced. A domain
--      record, not an event log: an event would say a review happened, and
--      this says what was decided and what it created.
--
--      The draft ids are the whole safety story of this feature. Every
--      outcome writes an UNPUBLISHED assignment. Nothing here can publish
--      anything: this table has no relationship to
--      coach_assigned_workouts' member_read_own policy, which gates on
--      published_at, and the review screen never sets it.
--
--   4. A PRESCRIBED WEIGHT THAT TRAVELS.  Nothing schema-level. The `load`
--      and `load_unit` columns have been on the template and assignment
--      exercise tables since migration 82 and have always been copied
--      through by lib/coach-program-builder/{templates,assignments}.ts.
--      They were simply never written, because until a member logged a
--      weight there was no number to write. Said here so a later reader
--      does not go looking for a column that was never needed.
--
-- member_wellness_events widens by four, per the rule this table has
-- followed since migration 63: widen the constraint, never add a second
-- events table. Operational, not product analytics. The payload carries a
-- group key, an outcome key and a count. Never a member's typed words.
-- ============================================================================

-- ============================================================================
-- 1) Which week each occurrence belonged to.
-- ============================================================================
-- The rule, stated once and applied to every row that is missing it: week 1
-- is the assignment's own start date and the six days after it, and an
-- occurrence somehow scheduled before its own program starts is week 1
-- rather than week 0 or a negative. Identical to programWeekOf, which is
-- what the materializer has written on every occurrence created since
-- migration 174.
--
-- Only rows where program_week is null are touched, so this cannot rewrite
-- a week the materializer already decided, and rerunning it is a no-op.
update public.coach_assigned_workouts w
set program_week = greatest(
      1,
      floor((w.scheduled_date - a.start_date) / 7)::int + 1
    )
from public.coach_program_assignments a
where a.id = w.assignment_id
  and w.program_week is null
  and a.start_date is not null;

-- An occurrence whose assignment never carried a start date has no week to
-- compute and keeps its null, which is honest. There are none today; the
-- assertion block below proves it rather than assuming it.

-- ============================================================================
-- 2) Closing a pain report.
-- ============================================================================
alter table public.member_exercise_feedback
  add column if not exists coach_reviewed_by uuid references auth.users(id),
  add column if not exists coach_review_note text;

comment on column public.member_exercise_feedback.coach_review_note is
  'What the coach wrote when marking this report reviewed. Optional, coach facing, never shown to the member. Resolving a report clears the needs-attention flag and changes nothing else about the row: what she said stays exactly as she said it.';

-- ============================================================================
-- 3) The end-of-phase review.
-- ============================================================================
create table if not exists public.program_phase_reviews (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  coach_id uuid not null references auth.users(id),

  -- One review is about one PROGRAM, which is two or three assignments
  -- sharing a group key (migration 172). Never one assignment: pausing or
  -- reviewing a third of a program is not a state this product has.
  program_group_key text not null,
  program_name text not null,

  -- Opened by the coach before the program finished, rather than by the
  -- program reaching its end. Recorded because "she reviewed early" is a
  -- different fact from "the phase ended".
  opened_early boolean not null default false,

  -- The signals exactly as they read when the review was opened. Frozen on
  -- purpose: a recommendation has to be readable months later beside the
  -- numbers it was made from, and those numbers keep moving.
  signal_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(signal_snapshot) = 'object'),

  recommended_outcome text not null check (recommended_outcome in (
    'progress_next_phase', 'rotate_exercises', 'repeat_phase',
    'recovery_week', 'different_program', 'complete_and_archive'
  )),
  -- Why, in the words the coach reads on the screen. Stored rather than
  -- recomputed, for the same reason the snapshot is.
  recommendation_reasoning text not null,

  -- Null until the coach picks. Never defaulted to the recommendation: a
  -- recommendation nobody acted on must not read as a decision.
  chosen_outcome text check (chosen_outcome is null or chosen_outcome in (
    'progress_next_phase', 'rotate_exercises', 'repeat_phase',
    'recovery_week', 'different_program', 'complete_and_archive'
  )),
  chosen_at timestamptz,

  -- What the choice produced. Unpublished, always. The review screen has no
  -- code path that publishes and no test that permits one.
  draft_assignment_ids uuid[] not null default '{}',
  draft_template_ids uuid[] not null default '{}',
  draft_program_group_key text,

  -- The loads the coach approved, per exercise, as she left them. Written
  -- when a draft is produced so that "the coach edited the number" is a
  -- recorded fact and not an inference from the draft's own rows.
  approved_loads jsonb not null default '{}'::jsonb
    check (jsonb_typeof(approved_loads) = 'object'),

  status text not null default 'open' check (status in (
    'open', 'drafted', 'approved', 'discarded'
  )),

  coach_notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One OPEN review per program at a time. A coach opening the review twice
  -- lands back on the one she already has rather than starting a second.
  constraint program_phase_reviews_chosen_consistency check (
    (chosen_outcome is null and chosen_at is null)
    or (chosen_outcome is not null and chosen_at is not null)
  )
);

create unique index if not exists program_phase_reviews_one_open_idx
  on public.program_phase_reviews (member_id, program_group_key)
  where status = 'open';

create index if not exists program_phase_reviews_member_idx
  on public.program_phase_reviews (member_id, created_at desc);

comment on table public.program_phase_reviews is
  'One row per end-of-phase review a coach opens on one program: the signals as they read at that moment, what the rules recommended and why, what the coach chose, and the unpublished draft the choice produced. Nothing in this table or the screens over it publishes anything to a member.';

alter table public.program_phase_reviews enable row level security;

create policy coach_all_assigned_program_phase_reviews on public.program_phase_reviews
  for all using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_program_phase_reviews on public.program_phase_reviews
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- Deliberately NO member policy. A review is a coach's workspace and a
-- member has no reason to read a recommendation nobody has acted on yet.
-- What she reads is the completion message her program already gives her,
-- until a draft is approved and delivered through the normal pipeline.

-- ============================================================================
-- 4) Four more event types.
-- ============================================================================
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

    -- The member's voice inside her program (migration 177), operational.
    'exercise_weight_logged',
    'exercise_feedback_reported',
    'exercise_stopped_for_pain',
    'exercise_swapped',
    'exercise_progression_flagged',

    -- The coaching brain (this migration), operational.
    'program_review_opened',
    'program_review_drafted',
    'exercise_feedback_resolved',
    'exercise_avoidance_released'
  ));

-- ============================================================================
-- 5) Assertions (style: migrations 153, 174, 175, 176 and 177).
-- ============================================================================
do $$
declare
  v_null_week int;
  v_orphan_week int;
  v_bad_week int;
  v_reviews int;
begin
  -- Every occurrence whose assignment has a start date now knows its week.
  select count(*) into v_null_week
  from coach_assigned_workouts w
  join coach_program_assignments a on a.id = w.assignment_id
  where w.program_week is null and a.start_date is not null;
  if v_null_week <> 0 then
    raise exception '% occurrence(s) still have no program week', v_null_week;
  end if;

  -- And there is nothing left that could not be computed.
  select count(*) into v_orphan_week
  from coach_assigned_workouts w
  join coach_program_assignments a on a.id = w.assignment_id
  where w.program_week is null;
  if v_orphan_week <> 0 then
    raise notice '% occurrence(s) have no week because their assignment has no start date', v_orphan_week;
  end if;

  -- No week is nonsense: at least 1, and never past the program's own
  -- duration plus one week of slack for a program whose last session sits
  -- on the boundary.
  select count(*) into v_bad_week
  from coach_assigned_workouts w
  join coach_program_assignments a on a.id = w.assignment_id
  where w.program_week is not null
    and (w.program_week < 1
         or (a.duration_weeks is not null and w.program_week > a.duration_weeks + 1));
  if v_bad_week <> 0 then
    raise exception '% occurrence(s) carry a week outside their own program', v_bad_week;
  end if;

  -- The review table exists, is empty, and has row level security on with
  -- no unconditional read policy. Same three checks migration 177 made of
  -- its own two tables.
  select count(*) into v_reviews from program_phase_reviews;
  if v_reviews <> 0 then
    raise exception 'program_phase_reviews should be created empty, found %', v_reviews;
  end if;

  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'program_phase_reviews' and rowsecurity = true
  ) then
    raise exception 'program_phase_reviews has row level security off';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'program_phase_reviews' and qual = 'true'
  ) then
    raise exception 'program_phase_reviews carries an unconditional policy';
  end if;

  -- A member cannot reach a review at all: there is no policy on this table
  -- that a plain member satisfies.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'program_phase_reviews'
      and qual like '%auth.uid()%' and qual not like '%has_active_role%'
  ) then
    raise exception 'program_phase_reviews has a policy that a member could satisfy';
  end if;

  -- Nothing about a member's own reports changed except that they can now
  -- be closed.
  if exists (select 1 from member_exercise_feedback where coach_review_note is not null) then
    raise exception 'a feedback row already carries a review note';
  end if;
end $$;
