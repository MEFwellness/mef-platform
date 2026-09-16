-- TWO OPTIONAL BOXES ON THE DAILY CHECK-IN, and nothing else changes.
--
-- WHAT THIS IS FOR. The check-in asks two questions that a member answers
-- with a tap and cannot say anything about. She ticks "something new or
-- worsening" and the app learns that a concern exists but not what it is.
-- She says yes to discomfort, picks a location from a list and a level
-- from a scale, and never gets to say what it actually feels like. Both
-- answers already reach the safety classifier, which is right and stays,
-- and both are invisible to Root, which is the gap: Root reads sentences,
-- and there were none here to read.
--
-- OPTIONAL EVERYWHERE, AND NEVER REQUIRED. Both columns are nullable, both
-- boxes appear only after the answer that makes them relevant, and a
-- member who types nothing submits exactly the check-in she submitted
-- before this migration.
--
-- NOTHING HERE TOUCHES SCORING. Not one number the check-in produces is
-- read from either column, and no reader of daily_checkins computes
-- anything from text. The Root Score, the coaching grades, the
-- longitudinal signals and the Body Systems layer all read the same
-- numeric columns they read yesterday.

alter table daily_checkins
  add column concern_note text,
  add column discomfort_note text;

comment on column daily_checkins.concern_note is
  'Optional free text a member may add after answering yes to the new or worsening concern item. Never required, never scored, and screened by the safety layer exactly like the notes field.';
comment on column daily_checkins.discomfort_note is
  'Optional free text a member may add after answering yes to the discomfort item. Never required, never scored.';

-- daily_checkins_current is a `select *` view, so it has to be recreated
-- for the new columns to be visible. Same note as migrations 21, 63 and
-- 113, and the same recreation, unchanged in every other respect.
drop view daily_checkins_current;

create view daily_checkins_current
  with (security_invoker = true) as
  select distinct on (user_id, local_date) *
  from daily_checkins
  order by user_id, local_date, checkin_version desc;

-- Supersedes migration 113's submit_daily_checkin to accept the two new
-- columns. BOTH DEFAULT TO NULL, so an older caller that does not pass
-- them writes exactly what it wrote before. Same versioned insert
-- behaviour as before, and no other line of the body changes.
drop function if exists public.submit_daily_checkin(
  text, date, int, int, text, int, int, int, int, int, text, boolean, text,
  time, time, int, boolean, int, text, int
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
  p_completion_seconds int default null,
  p_concern_note text default null,
  p_discomfort_note text default null
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
    completion_seconds, concern_note, discomfort_note
  ) values (
    auth.uid(), now(), p_timezone, p_local_date, v_next_version,
    case when v_next_version > 1 then now() end,
    p_mood_level, p_sleep_quality, p_sleep_duration, p_local_date - 1, p_local_date,
    p_energy_level, p_stress_level, p_water_cups, p_digestion_rating, p_pain_discomfort_level,
    p_movement_today, p_new_or_worsening_concern, p_optional_notes,
    p_actual_bedtime, p_actual_wake_time, p_night_waking_count, p_night_sweats, p_morning_soreness, p_bowel_movement_status,
    p_completion_seconds, p_concern_note, p_discomfort_note
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

grant execute on function public.submit_daily_checkin(
  text, date, int, int, text, int, int, int, int, int, text, boolean, text,
  time, time, int, boolean, int, text, int, text, text
) to authenticated;
