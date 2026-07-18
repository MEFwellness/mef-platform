-- Member Wellness Event Stream — the standardized, append-only record of
-- everything a member logs throughout their day (Morning Readiness,
-- hydration, movement, a flagged concern, Evening Reflection). Every event
-- carries two distinct timestamps, deliberately not conflated:
--
--   occurred_at — when the thing actually happened in the member's life.
--     Member-suppliable (e.g. "log this walk as 30 minutes ago"), defaults
--     to now() when not specified. This is the ONLY column any ordering,
--     timeline, scoring, or future pattern-analysis logic may use.
--   recorded_at — when the row was written to the database. Server-set,
--     immutable, never used to order the member's day. Exists purely as an
--     audit/entry-latency fact, same meaning "recorded_at" already carries
--     on daily_checkins (migration 13) and habit_logs (migration 14) — kept
--     consistent with that existing convention rather than redefining it.
--
-- Deliberately a new, purpose-built table rather than repurposing
-- health_timeline_events (migration 42): that table is a "notable
-- milestones" story feed (one row per checkin submission, not one per
-- hydration cup) and its occurred_at has never actually been separated
-- from insert time by any existing caller. This table is the real
-- fine-grained event source; a Morning Readiness / Evening Reflection
-- submission still also writes one summarized health_timeline_events row
-- for the existing timeline UI, same "detailed table + summarized
-- timeline entry" split submit_daily_checkin already does today.
--
-- event_type is extended additively (same convention as ai_events.event_type
-- and health_timeline_events.event_type) — a future event source widens
-- this check constraint, never adds a second events table.
create table member_wellness_events (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  event_type text not null check (event_type in (
    'morning_readiness_recorded',
    'hydration_logged',
    'movement_logged',
    'concern_flagged',
    'evening_reflection_recorded'
  )),

  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  timezone text not null,
  -- Computed at write time from occurred_at in the member's timezone, same
  -- "never recomputed on read" discipline as daily_checkins.local_date.
  local_date date not null,

  payload jsonb not null default '{}'::jsonb,
  source text not null default 'member' check (source in ('member', 'coach', 'system')),
  -- Polymorphic pointer to whatever primary row this event summarizes
  -- (a daily_checkins.id, an evening_reflections.id) — same convention as
  -- health_timeline_events.source_record_id.
  source_record_id uuid,

  created_at timestamptz not null default now()
);

-- occurred_at is the ordering column every reader must use — see header.
create index member_wellness_events_member_occurred_idx
  on member_wellness_events (member_id, occurred_at desc);

create index member_wellness_events_member_date_type_idx
  on member_wellness_events (member_id, local_date, event_type);

alter table member_wellness_events enable row level security;

-- Append-only: no update or delete policy for anyone but the platform
-- admin catch-all below, same posture as health_timeline_events.
create policy member_read_own_wellness_events on member_wellness_events
  for select
  using (member_id = auth.uid());

create policy member_insert_own_wellness_events on member_wellness_events
  for insert
  with check (member_id = auth.uid());

create policy coach_read_assigned_wellness_events on member_wellness_events
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_wellness_events on member_wellness_events
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- Evening Reflection — deliberately a separate table from daily_checkins,
-- not a same-row extension: it has its own independent lifecycle (must be
-- completable with zero morning data present, and vice versa), and unlike
-- daily_checkins it is NOT version-audited (low-stakes reflective text, a
-- member correcting today's entry just overwrites it) — one row per
-- member per local_date, upserted in place via the member_update_own
-- policy below.
create table evening_reflections (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  timezone text not null,
  local_date date not null,

  overall_day_rating int check (overall_day_rating between 1 and 5),
  daytime_stress int check (daytime_stress between 1 and 5),
  energy_pattern text check (energy_pattern in ('steady', 'dipped', 'crashed', 'improved')),
  symptoms_or_changes text,
  recovery int check (recovery between 1 and 5),

  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (member_id, local_date)
);

create index evening_reflections_member_date_idx
  on evening_reflections (member_id, local_date desc);

alter table evening_reflections enable row level security;

create policy member_read_own_evening_reflections on evening_reflections
  for select
  using (member_id = auth.uid());

create policy member_insert_own_evening_reflections on evening_reflections
  for insert
  with check (member_id = auth.uid());

create policy member_update_own_evening_reflections on evening_reflections
  for update
  using (member_id = auth.uid());

create policy coach_read_assigned_evening_reflections on evening_reflections
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_evening_reflections on evening_reflections
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- Morning Readiness — additive, nullable columns on the existing
-- daily_checkins table (migration 13/21) rather than a new table: this is
-- the same row the check-in form has always written, gaining the fields
-- Morning Readiness needs. Every existing column, row, and version is
-- untouched; nothing here can affect a pre-migration daily_checkins row,
-- since every new column defaults to null.
alter table daily_checkins
  add column actual_bedtime time,
  add column actual_wake_time time,
  add column night_waking_count int check (night_waking_count >= 0),
  add column night_sweats boolean,
  add column morning_soreness int check (morning_soreness between 1 and 5),
  add column bowel_movement_status text check (bowel_movement_status in ('normal', 'constipated', 'loose', 'none'));

-- daily_checkins_current is a `select *` view — Postgres freezes a
-- select-* view's column list at creation time (see migration 21's own
-- note), so it must be recreated for the new columns to be visible.
drop view daily_checkins_current;

create view daily_checkins_current
  with (security_invoker = true) as
  select distinct on (user_id, local_date) *
  from daily_checkins
  order by user_id, local_date, checkin_version desc;

-- Supersedes submit_daily_checkin() from migration 22 to accept the six
-- new Morning Readiness columns. Same versioned-insert behavior as before
-- (every submission is a new checkin_version row, never an in-place
-- update) — only the column list grows.
drop function if exists public.submit_daily_checkin(
  text, date, int, int, text, int, int, int, int, int, text, boolean, text
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
  p_bowel_movement_status text
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
    actual_bedtime, actual_wake_time, night_waking_count, night_sweats, morning_soreness, bowel_movement_status
  ) values (
    auth.uid(), now(), p_timezone, p_local_date, v_next_version,
    case when v_next_version > 1 then now() end,
    p_mood_level, p_sleep_quality, p_sleep_duration, p_local_date - 1, p_local_date,
    p_energy_level, p_stress_level, p_water_cups, p_digestion_rating, p_pain_discomfort_level,
    p_movement_today, p_new_or_worsening_concern, p_optional_notes,
    p_actual_bedtime, p_actual_wake_time, p_night_waking_count, p_night_sweats, p_morning_soreness, p_bowel_movement_status
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

grant execute on function public.submit_daily_checkin(
  text, date, int, int, text, int, int, int, int, int, text, boolean, text,
  time, time, int, boolean, int, text
) to authenticated;

-- Additive: widen safety_classifications.source_feature (migration 28,
-- last widened by migration 37) so the event-stream's concern-flagging
-- paths (mid-day "Flag a concern" quick action, Morning Readiness,
-- Evening Reflection) can route through the same evaluateConcern()
-- pipeline everything else already uses, without impersonating
-- 'daily_checkin'.
alter table safety_classifications drop constraint safety_classifications_source_feature_check;
alter table safety_classifications add constraint safety_classifications_source_feature_check
  check (source_feature in (
    'daily_checkin',
    'coach_note',
    'ai_recommendation',
    'daily_feed',
    'dynamic_coaching',
    'wellness_intelligence',
    'conversation_coach',
    'body_assessment',
    'member_wellness_event'
  ));

-- Additive: widen health_timeline_events.event_type (migration 42, last
-- widened by migration 58) so an Evening Reflection submission can add a
-- real timeline entry, same as a check-in submission already does.
alter table health_timeline_events drop constraint health_timeline_events_event_type_check;
alter table health_timeline_events add constraint health_timeline_events_event_type_check
  check (event_type in (
    'onboarding_completed', 'reassessment_completed', 'checkin_submitted',
    'assessment_published', 'wearable_synced', 'streak_milestone',
    'trend_improving', 'trend_declining', 'wearable_connected',
    'movement_session_completed', 'evening_reflection_submitted'
  ));
