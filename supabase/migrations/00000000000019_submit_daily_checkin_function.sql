-- Sprint 1 tasks 8 and 10 ("check-in edits increment the version safely").
-- daily_checkins is append-only: an "edit" inserts a new row with
-- checkin_version = previous max + 1 for that (user_id, local_date); it
-- never UPDATEs an existing row. This function computes the next version
-- under a row lock on the existing rows for that date, so two concurrent
-- submissions for the same day can't both compute the same next version.
--
-- SECURITY INVOKER — RLS's member_insert_own_checkins policy (user_id =
-- auth.uid()) is what actually authorizes the write.
create or replace function public.submit_daily_checkin(
  p_timezone text,
  p_local_date date,           -- explicit, to support the late-checkin
                                 -- "log for yesterday" flow (app-layer decides
                                 -- whether to allow it based on the 6-hour rule)
  p_sleep_quality int,
  p_sleep_duration text,
  p_energy_level int,
  p_stress_level int,
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
  -- Lock any existing rows for this user/date so a concurrent submit can't
  -- read the same "current max" before this transaction commits.
  perform 1
  from daily_checkins
  where user_id = auth.uid() and local_date = p_local_date
  for update;

  select coalesce(max(checkin_version), 0) + 1 into v_next_version
  from daily_checkins
  where user_id = auth.uid() and local_date = p_local_date;

  insert into daily_checkins (
    user_id, recorded_at, timezone, local_date, checkin_version, edited_at,
    sleep_quality, sleep_duration, sleep_observation_period_start, sleep_observation_period_end,
    energy_level, stress_level, digestion_rating, pain_discomfort_level,
    movement_today, new_or_worsening_concern, optional_notes
  ) values (
    auth.uid(), now(), p_timezone, p_local_date, v_next_version,
    case when v_next_version > 1 then now() end,
    p_sleep_quality, p_sleep_duration, p_local_date - 1, p_local_date,
    p_energy_level, p_stress_level, p_digestion_rating, p_pain_discomfort_level,
    p_movement_today, p_new_or_worsening_concern, p_optional_notes
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

grant execute on function public.submit_daily_checkin(
  text, date, int, text, int, int, int, int, text, boolean, text
) to authenticated;
