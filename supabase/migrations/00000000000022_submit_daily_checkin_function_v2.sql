-- Supersedes submit_daily_checkin() from migration 19 to accept the
-- mood_level/water_cups columns added in migration 21. Postgres treats a
-- CREATE OR REPLACE with a changed parameter list as a new overload rather
-- than a replacement, so the old signature is dropped explicitly first —
-- otherwise both would coexist and PostgREST's RPC lookup would become
-- ambiguous.
drop function if exists public.submit_daily_checkin(
  text, date, int, text, int, int, int, int, text, boolean, text
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
  p_optional_notes text
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
    movement_today, new_or_worsening_concern, optional_notes
  ) values (
    auth.uid(), now(), p_timezone, p_local_date, v_next_version,
    case when v_next_version > 1 then now() end,
    p_mood_level, p_sleep_quality, p_sleep_duration, p_local_date - 1, p_local_date,
    p_energy_level, p_stress_level, p_water_cups, p_digestion_rating, p_pain_discomfort_level,
    p_movement_today, p_new_or_worsening_concern, p_optional_notes
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

grant execute on function public.submit_daily_checkin(
  text, date, int, int, text, int, int, int, int, int, text, boolean, text
) to authenticated;
