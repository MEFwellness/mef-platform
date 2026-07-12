-- Architecture v2.1, Section B.3. Full time-semantics field set:
-- recorded_at (server UTC, immutable), timezone (captured per-record),
-- local_date (computed at write time, never recomputed on read),
-- checkin_version (append-only edit history — see submit_daily_checkin()
-- in a later migration), sleep_observation_period_* (the one metric pair
-- whose period differs from the row's own local_date: it describes the
-- night ending on the morning of local_date, not local_date itself).
create table daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  timezone text not null,
  local_date date not null,
  checkin_version int not null default 1,
  edited_at timestamptz,
  sleep_quality int check (sleep_quality between 1 and 5),
  sleep_duration text check (sleep_duration in ('<5h', '5-6h', '6-7h', '7-8h', '8h+')),
  sleep_observation_period_start date,
  sleep_observation_period_end date,
  energy_level int check (energy_level between 1 and 5),
  stress_level int check (stress_level between 1 and 5),
  digestion_rating int check (digestion_rating between 1 and 5),
  pain_discomfort_level int check (pain_discomfort_level between 0 and 5),
  movement_today text check (movement_today in ('none', 'light', 'moderate', 'full_session')),
  new_or_worsening_concern boolean not null default false,
  optional_notes text,
  created_at timestamptz not null default now(),
  unique (user_id, local_date, checkin_version)
);

create index daily_checkins_user_date_idx on daily_checkins (user_id, local_date, checkin_version desc);

comment on column daily_checkins.optional_notes is
  'Never read by any scoring or Pattern Engine logic (not built this sprint
   regardless). Free-text safety screening is Architecture v2.1 Section F,
   not implemented until the safety repository sprint.';

-- Convenience read view: the current (highest-version) row per user/date.
-- security_invoker = true means it runs under the querying user's own RLS,
-- not the view owner's — the view adds no privilege the base table doesn't
-- already grant.
create view daily_checkins_current
  with (security_invoker = true) as
  select distinct on (user_id, local_date) *
  from daily_checkins
  order by user_id, local_date, checkin_version desc;
