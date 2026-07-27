-- Daily Check-In optimization pass. Three independent changes:
--
-- 1. Elapsed-time instrumentation ("without measurement there is no way
--    to know whether the 60-second target is met") — one nullable column
--    each on daily_checkins and evening_reflections, populated by the
--    client from first screen render to submission. Null on a draft save
--    (an exit mid-flow is not a timed completion).
--
-- 2. Evening Reflection becomes optional depth, not an equal second half
--    of the daily ritual (task requirement 2). Its probe-question pool
--    must not silently strand driver evidence for members who never open
--    it. Migration 109 seeded 69 of the 88-question bank as screen =
--    'evening' by default (only 19 were ever screen = 'morning') — far
--    more than the "digestion and movement" the task names, but the same
--    underlying failure mode: a question a member may never see is not a
--    live evidence source. Every currently-evening rotating probe and
--    local follow-up moves to 'morning' so it keeps rotating regardless
--    of whether Evening is ever opened.
--
-- 3. movement_today (MOV-2) is the one exception: task requirement 4
--    pulls water/movement out of the check-in entirely into a Today-screen
--    quick tap, so it's deactivated as a picker-eligible probe rather than
--    folded to morning — its evidence now comes from the Today tap
--    (app/actions/events.ts's logMovementLevel), unconditionally available
--    every day rather than gated behind either check-in screen.

alter table daily_checkins add column completion_seconds int check (completion_seconds >= 0);
alter table evening_reflections add column completion_seconds int check (completion_seconds >= 0);

comment on column daily_checkins.completion_seconds is
  'Elapsed time from the check-in wizard''s first screen render to submission. Null on a draft (exit-triggered) save — only a genuine final submission is timed.';
comment on column evening_reflections.completion_seconds is
  'Same instrumentation as daily_checkins.completion_seconds, for Evening Reflection.';

-- daily_checkins_current is a `select *` view — must be recreated for the
-- new column to be visible (same note as migrations 21/63).
drop view daily_checkins_current;

create view daily_checkins_current
  with (security_invoker = true) as
  select distinct on (user_id, local_date) *
  from daily_checkins
  order by user_id, local_date, checkin_version desc;

-- Supersedes submit_daily_checkin() from migration 63 to accept the new
-- completion_seconds column. Same versioned-insert behavior as before.
drop function if exists public.submit_daily_checkin(
  text, date, int, int, text, int, int, int, int, int, text, boolean, text,
  time, time, int, boolean, int, text
);

create or replace function public.submit_daily_checkin(
  p_timezone text,
  p_local_date date,
  p_mood_level int,
  p_sleep_quality int,
  p_sleep_duration text,
  p_energy_level int,
  p_stress_level int,
  p_water_cups int,
  p_digestion_rating int,
  p_pain_discomfort_level int,
  p_movement_today text,
  p_new_or_worsening_concern boolean,
  p_optional_notes text,
  p_actual_bedtime time,
  p_actual_wake_time time,
  p_night_waking_count int,
  p_night_sweats boolean,
  p_morning_soreness int,
  p_bowel_movement_status text,
  p_completion_seconds int default null
)
returns uuid
language plpgsql
as $$
declare
  v_next_version int;
  v_new_id uuid;
begin
  perform 1
  from daily_checkins
  where user_id = auth.uid() and local_date = p_local_date
  for update;

  select coalesce(max(checkin_version), 0) + 1 into v_next_version
  from daily_checkins
  where user_id = auth.uid() and local_date = p_local_date;

  insert into daily_checkins (
    user_id, recorded_at, timezone, local_date, checkin_version, edited_at,
    mood_level, sleep_quality, sleep_duration, sleep_observation_period_start, sleep_observation_period_end,
    energy_level, stress_level, water_cups, digestion_rating, pain_discomfort_level,
    movement_today, new_or_worsening_concern, optional_notes,
    actual_bedtime, actual_wake_time, night_waking_count, night_sweats, morning_soreness, bowel_movement_status,
    completion_seconds
  ) values (
    auth.uid(), now(), p_timezone, p_local_date, v_next_version,
    case when v_next_version > 1 then now() end,
    p_mood_level, p_sleep_quality, p_sleep_duration, p_local_date - 1, p_local_date,
    p_energy_level, p_stress_level, p_water_cups, p_digestion_rating, p_pain_discomfort_level,
    p_movement_today, p_new_or_worsening_concern, p_optional_notes,
    p_actual_bedtime, p_actual_wake_time, p_night_waking_count, p_night_sweats, p_morning_soreness, p_bowel_movement_status,
    p_completion_seconds
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

grant execute on function public.submit_daily_checkin(
  text, date, int, int, text, int, int, int, int, int, text, boolean, text,
  time, time, int, boolean, int, text, int
) to authenticated;

-- ---- Fold evening-only probes back into the morning rotation pool ----

update driver_probe_questions
set screen = 'morning'
where screen = 'evening'
  and question_key <> 'checkin_probe.movement_today';

-- movement_today leaves the check-in entirely (task requirement 4) — its
-- evidence now comes from a Today-screen quick tap
-- (logMovementLevel/submitEveningBodyCheckin), not the adaptive picker.
-- Deactivated rather than deleted: the row, its response_type/options,
-- and its answer history (if any) stay intact for the coach Question Bank
-- screen and the driver-state engine's own reads; it simply stops being a
-- rotation candidate (buildProbeBank already skips `active = false`).
update driver_probe_questions
set active = false
where question_key = 'checkin_probe.movement_today';

comment on column driver_probe_questions.screen is
  'Which check-in surface this question rotates on. Evening Reflection is optional depth (task: "one required check-in a day"), so every rotating probe and local follow-up that still needs a live evidence source lives on morning — a coach can still author a genuinely evening-only question later via the Question Bank screen, but nothing seeded here relies on Evening being opened.';
