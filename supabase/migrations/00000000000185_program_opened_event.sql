-- ============================================================================
-- 185: "she has opened this program", as one more event type.
-- ============================================================================
--
-- The home screen's program card now carries a "New from your coach" mark
-- while a program has been handed to her and never opened. The mark has to
-- clear permanently the first time she opens it, which means the app needs
-- one durable fact per program: was it ever opened.
--
-- That fact is an event, not a column and not a table. Same rule migration
-- 63 set and every migration since has followed (146, 147, 150, 151, 152,
-- 153, 172, 177, 178): widen the constraint, never add a second events
-- table. The event carries the assignment it was opened from on
-- source_record_id, exactly as the lifecycle events (172) do, so "has this
-- program been opened" is a lookup over the assignment ids of one program
-- group and needs no new index and no payload convention.
--
-- Operational, not product analytics. is_product_analytics_event_type is
-- left alone on purpose, so this never reaches the analytics view and never
-- shows up in a funnel as something it is not.

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

    -- The coaching brain (migration 178), operational.
    'program_review_opened',
    'program_review_drafted',
    'exercise_feedback_resolved',
    'exercise_avoidance_released',

    -- She opened her program (this migration), operational.
    'program_opened'
  ));

-- ============================================================================
-- Backfill: nothing that already exists is "new".
-- ============================================================================
--
-- Without this, every program assigned before today would be marked "New
-- from your coach" the moment this ships, because no member has ever
-- written this event. That would be a lie told to every existing member at
-- once, and the mark would then clear on a tap she had already made months
-- ago.
--
-- So every program group that exists at migration time is recorded as
-- already opened, dated to when it was handed to her rather than to now.
-- One row per (member, program group), pointed at that group's earliest
-- assignment. The mark starts meaning something from the next program a
-- coach assigns.
insert into member_wellness_events (
  member_id, event_type, occurred_at, timezone, local_date, payload, source, source_record_id
)
select distinct on (a.member_id, coalesce(a.program_group_key, a.id::text))
  a.member_id,
  'program_opened',
  coalesce(a.published_at, a.created_at),
  coalesce(p.timezone, 'America/New_York'),
  (coalesce(a.published_at, a.created_at) at time zone coalesce(p.timezone, 'America/New_York'))::date,
  jsonb_build_object('backfilled', 'true'),
  'system',
  a.id
from public.coach_program_assignments a
left join public.profiles p on p.id = a.member_id
order by
  a.member_id,
  coalesce(a.program_group_key, a.id::text),
  coalesce(a.published_at, a.created_at) asc,
  a.id asc;

-- ============================================================================
-- Assertions (style: migrations 153, 174, 175, 176, 177 and 178).
-- ============================================================================
do $$
declare
  v_groups int;
  v_opened int;
  v_unmarked int;
begin
  select count(distinct (member_id, coalesce(program_group_key, id::text)))
    into v_groups
  from public.coach_program_assignments;

  select count(*) into v_opened
  from public.member_wellness_events
  where event_type = 'program_opened';

  -- Every program group that existed before this migration now carries
  -- exactly one opened event, so none of them can read as new.
  select count(*) into v_unmarked
  from (
    select a.member_id, coalesce(a.program_group_key, a.id::text) as group_key
    from public.coach_program_assignments a
    group by 1, 2
  ) g
  where not exists (
    select 1
    from public.member_wellness_events e
    join public.coach_program_assignments a2 on a2.id = e.source_record_id
    where e.event_type = 'program_opened'
      and e.member_id = g.member_id
      and coalesce(a2.program_group_key, a2.id::text) = g.group_key
  );

  if v_unmarked <> 0 then
    raise exception 'migration 185: % existing program group(s) were left unmarked', v_unmarked;
  end if;

  raise notice 'migration 185: % existing program group(s), % program_opened event(s), % unmarked',
    v_groups, v_opened, v_unmarked;
end $$;
