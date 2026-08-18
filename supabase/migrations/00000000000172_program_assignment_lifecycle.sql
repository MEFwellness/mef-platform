-- Assignment lifecycle — a program that starts, progresses and ends.
--
-- coach_program_assignments (migration 82) could only ever say
-- active/completed/cancelled, nothing ever set 'completed', and the row
-- carried no dates of its own. A four-week program assigned in July still
-- read 'active' in August, and neither the member nor her coach could see
-- which week she was in. This migration gives the assignment a real
-- lifecycle and nothing else: no blueprint tables, no swaps, no coach
-- review/outcome workflow, no change to how the corrective engine selects
-- or doses an exercise.
--
-- Additive only. Every column is nullable or defaulted, every existing
-- row is backfilled below, and the frozen snapshot tables
-- (coach_assigned_workouts / _sections / _exercises) are not touched by
-- this migration or by any lifecycle transition. A status change says
-- where a member is in a program; it never edits what she was given.
--
-- The columns:
--
--   start_date / end_date       The program's own span, as dates rather
--                                than as an inference over its
--                                occurrences. end_date always derives
--                                from start_date + duration_weeks
--                                (inclusive), so the two can never
--                                disagree; a constraint holds the order.
--
--   duration_weeks              How long the program runs. Comes from the
--                                program itself — a corrective program is
--                                4 weeks, which is what
--                                approveCorrectiveDraftGroup already
--                                assigns — rather than being a global
--                                constant anywhere in app code.
--
--   current_week                Which week she is in, 1..duration_weeks.
--                                Written by the daily lifecycle job, not
--                                computed at read time, so the coach
--                                screen, the member screen and the event
--                                stream all agree on one number and a
--                                week advance is a real, logged event
--                                rather than a re-derivation.
--
--   paused_days                 Total days this program has spent paused.
--                                A pause must not cost a member weeks of
--                                her program: on resume, end_date is
--                                pushed out by the days paused and this
--                                accumulates them, so week arithmetic
--                                (elapsed = today - start_date -
--                                paused_days) stays correct across any
--                                number of pauses.
--
--   replaced_by_assignment_id   Lineage. Assigning a new program to a
--                                member who already has an active one
--                                marks the old one 'replaced' and points
--                                it at its successor. Nothing is ever
--                                deleted, and the member's history keeps
--                                the program she actually did.
--
--   program_group_key           Which assignments are one program. The
--                                corrective engine delivers a single
--                                4-week program as one assignment per
--                                weekly session (Session A/B/C), so
--                                without this a member would read "Week 2
--                                of 4" three times and a coach would
--                                count three active programs where there
--                                is one. Text, and for a corrective
--                                program it is the group tag the source
--                                templates already carry
--                                (`corrective-program:<uuid>`, see
--                                lib/corrective-engine/save.ts) rather
--                                than a second identity invented here.
--                                An ordinary one-off assignment is its
--                                own group.
--
-- The status vocabulary widens to the six states a program really has.
-- 'upcoming' and 'paused' are new non-terminal states; 'replaced' joins
-- 'completed' and 'cancelled' as terminal. Every query that means "her
-- program right now" must read 'active' (and 'paused' where a paused
-- program should still be visible) — a completed program is never active
-- again.

-- ============================================================================
-- 1) The lifecycle columns.
-- ============================================================================
alter table coach_program_assignments
  add column start_date date,
  add column end_date date,
  add column duration_weeks int,
  add column current_week int,
  add column paused_days int not null default 0,
  add column started_at timestamptz,
  add column completed_at timestamptz,
  add column paused_at timestamptz,
  add column resumed_at timestamptz,
  add column replaced_at timestamptz,
  -- Soft lineage, same on-delete posture as template_id above it: losing a
  -- successor must never cascade away the history of what it replaced.
  add column replaced_by_assignment_id uuid references coach_program_assignments(id) on delete set null,
  add column program_group_key text;

alter table coach_program_assignments
  add constraint coach_program_assignments_duration_weeks_check
    check (duration_weeks is null or duration_weeks between 1 and 52);

alter table coach_program_assignments
  add constraint coach_program_assignments_current_week_check
    check (current_week is null or current_week >= 1);

alter table coach_program_assignments
  add constraint coach_program_assignments_paused_days_check
    check (paused_days >= 0);

alter table coach_program_assignments
  add constraint coach_program_assignments_date_order_check
    check (start_date is null or end_date is null or end_date >= start_date);

-- A program can never be its own successor.
alter table coach_program_assignments
  add constraint coach_program_assignments_replacement_not_self_check
    check (replaced_by_assignment_id is null or replaced_by_assignment_id <> id);

-- ============================================================================
-- 2) The widened status vocabulary.
-- ============================================================================
alter table coach_program_assignments
  drop constraint coach_program_assignments_status_check;

alter table coach_program_assignments
  add constraint coach_program_assignments_status_check
    check (status in (
      -- Non-terminal.
      'upcoming',   -- assigned, start_date has not arrived yet
      'active',     -- running now
      'paused',     -- held by the coach, resumable, does not advance
      -- Terminal.
      'completed',  -- ran to the day after end_date
      'replaced',   -- superseded by a newer program (see replaced_by_assignment_id)
      'cancelled'   -- stopped by the coach (migration 82, unchanged)
    ));

create index coach_program_assignments_lifecycle_idx
  on coach_program_assignments (status, start_date, end_date);

create index coach_program_assignments_group_idx
  on coach_program_assignments (member_id, program_group_key);

comment on column coach_program_assignments.current_week is
  'Which week of duration_weeks the member is in, written by the daily movement lifecycle job. One number, so the coach screen, the member screen and the event stream cannot disagree.';
comment on column coach_program_assignments.paused_days is
  'Total days spent paused. end_date is pushed out by the same amount on resume, so a pause never costs the member part of her program.';
comment on column coach_program_assignments.program_group_key is
  'Which assignments are one program. A corrective program is one assignment per weekly session; they share this key.';

-- ============================================================================
-- 3) Backfill — nothing is left in an undefined state.
-- ============================================================================
-- Dates come from the assignment's own occurrences, which is the only
-- record of when the program was actually scheduled to run. Duration
-- prefers what the coach configured (schedule_config.weeks) and falls back
-- to the span the occurrences actually cover.
-- An assignment with no occurrences at all (nothing generated from its
-- schedule) still gets a start date and a duration from its own created_at
-- and config, so no row is left undefined.
update coach_program_assignments a
set
  start_date = coalesce(
    (select min(w.scheduled_date) from coach_assigned_workouts w where w.assignment_id = a.id),
    (a.created_at at time zone 'UTC')::date
  ),
  duration_weeks = greatest(1, coalesce(
    case when (a.schedule_config ->> 'weeks') ~ '^[0-9]+$'
         then (a.schedule_config ->> 'weeks')::int end,
    (select ceil((max(w.scheduled_date) - min(w.scheduled_date) + 1) / 7.0)::int
       from coach_assigned_workouts w where w.assignment_id = a.id),
    1
  ))
where a.start_date is null or a.duration_weeks is null;

-- end_date is always start_date + duration_weeks whole weeks, inclusive.
update coach_program_assignments
set end_date = start_date + (duration_weeks * 7 - 1)
where end_date is null;

-- Status, from the dates. cancelled is a coach decision and is never
-- overwritten; everything else lands on the state its own dates describe.
update coach_program_assignments
set status = case
  when current_date < start_date then 'upcoming'
  when current_date > end_date then 'completed'
  else 'active'
end
where status <> 'cancelled';

update coach_program_assignments
set current_week = least(
      duration_weeks,
      greatest(1, floor((current_date - start_date) / 7)::int + 1)
    )
where current_week is null and status in ('active', 'paused');

update coach_program_assignments
set current_week = 1
where current_week is null and status = 'upcoming';

update coach_program_assignments
set current_week = duration_weeks
where current_week is null and status = 'completed';

-- Timestamps for the states the backfill just declared. These are honest
-- about being derived: a program that has clearly already started gets a
-- started_at of its start date, not of the moment this migration ran.
update coach_program_assignments
set started_at = coalesce(started_at, (start_date::timestamptz))
where status in ('active', 'paused', 'completed');

update coach_program_assignments
set completed_at = coalesce(completed_at, ((end_date + 1)::timestamptz))
where status = 'completed';

-- program_group_key: a corrective program's assignments already share a
-- `corrective-program:<uuid>` tag on their source templates, so that tag
-- is reused rather than a second grouping identity being invented. Every
-- other assignment is its own group.
update coach_program_assignments a
set program_group_key = sub.group_tag
from (
  select
    a2.id,
    (select tag from unnest(t.program_tags) as tag where tag like 'corrective-program:%' limit 1) as group_tag
  from coach_program_assignments a2
  join coach_program_templates t on t.id = a2.template_id
) sub
where sub.id = a.id and sub.group_tag is not null and a.program_group_key is null;

update coach_program_assignments
set program_group_key = id::text
where program_group_key is null;

-- ============================================================================
-- 4) What the member may read.
-- ============================================================================
-- coach_program_assignments deliberately has no member SELECT policy
-- (migration 82: the container holds internal_notes, which is coach-only),
-- and a row policy cannot withhold a column. So the member's lifecycle
-- surface is a view of exactly the lifecycle columns, the same shape
-- member_exercise_cues (migration 170) uses for the same reason. Nothing
-- here can leak assignment_notes or internal_notes: they are not in the
-- select list.
create view public.member_program_lifecycle as
  select
    a.id,
    a.member_id,
    a.template_name_snapshot,
    a.program_group_key,
    a.status,
    a.start_date,
    a.end_date,
    a.duration_weeks,
    a.current_week,
    a.paused_days,
    a.started_at,
    a.completed_at,
    a.paused_at,
    a.resumed_at,
    a.replaced_at,
    a.replaced_by_assignment_id,
    a.schedule_type,
    a.schedule_config,
    a.published_at,
    a.created_at,
    a.updated_at
  from coach_program_assignments a
  where a.member_id = auth.uid()
    and a.visibility = 'published';

comment on view public.member_program_lifecycle is
  'One member''s own published programs, lifecycle columns only. Never assignment_notes, never internal_notes: they are not in the select list, so there is no policy to get wrong.';

revoke all on public.member_program_lifecycle from public;
grant select on public.member_program_lifecycle to authenticated;

-- ============================================================================
-- 5) member_wellness_events.event_type — widen additively.
-- ============================================================================
-- Program lifecycle events are operational facts about a program, written
-- by the daily job and by a coach's own pause/resume/replace. They are
-- NOT product analytics (is_product_analytics_event_type is deliberately
-- left alone below, so the analytics view does not pick them up) and they
-- are not health content: the payload carries a week number and a
-- duration, never an exercise, a finding or a check-in answer. Same
-- "widen the constraint, never add a second events table" rule this table
-- has followed since migration 63.
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

    -- Program lifecycle (this migration), operational only.
    'program_started',
    'program_week_advanced',
    'program_completed',
    'program_paused',
    'program_resumed',
    'program_replaced'
  ));
