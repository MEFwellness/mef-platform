-- Forecast & Calibration Loop — a return hook that works on day two, with
-- no wearable connected and before the correlation engine has anything to
-- say: she predicts tomorrow's energy at the end of Evening Reflection,
-- and tomorrow's Morning Readiness check-in grades it. Root goes on
-- record too, once it has a genuine basis to forecast from.
--
-- Two tables, deliberately separate from daily_checkins and from each
-- other:
--   1. energy_forecasts — her forecast. A permanent record: once made, the
--      prediction itself (predicted_energy_level, forecast_date,
--      made_from_local_date) can never change, even if she edits the
--      check-in it was made from. Scoring fields (actual_energy_level,
--      gap, scored_at) are settable exactly once, after the forecasted
--      day's real check-in exists — enforced by a BEFORE UPDATE trigger,
--      not just application code, per the task's "enforce it in code, not
--      just layout" instruction (that instruction was about anchoring
--      specifically, but the same "don't trust the UI alone" discipline
--      applies here to immutability too).
--   2. root_energy_forecasts — Root's own forecast for the same date,
--      written independently of whether she made one herself. Carries
--      basis_observation_count so "did Root have a genuine basis" is
--      always a real, auditable number, never asserted. Same immutability
--      trigger, same one-time scoring discipline.
--
-- Neither table touches the correlation engine, driver-state engine,
-- trend engine, or daily_checkins in any way — this is a new, independent
-- prediction loop over the same already-collected energy_level values.

create table energy_forecasts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  -- The date being forecast (tomorrow, relative to the evening reflection
  -- it was made from) — this is the key a morning check-in's real
  -- energy_level gets matched against to score it.
  forecast_date date not null,
  -- The evening reflection's own local_date this forecast was made from —
  -- provenance only, never used to gate or recompute anything.
  made_from_local_date date not null,
  predicted_energy_level smallint not null check (predicted_energy_level between 1 and 5),
  created_at timestamptz not null default now(),

  -- Null until the forecasted day's real check-in exists and this row is
  -- scored. gap = actual - predicted (signed), so a positive gap means
  -- energy came in higher than predicted.
  actual_energy_level smallint check (actual_energy_level between 1 and 5),
  gap smallint,
  scored_at timestamptz,

  unique (member_id, forecast_date)
);

create index energy_forecasts_member_idx on energy_forecasts (member_id, forecast_date);

alter table energy_forecasts enable row level security;

create policy member_select_own_energy_forecasts on energy_forecasts
  for select
  using (member_id = auth.uid());

create policy member_insert_own_energy_forecasts on energy_forecasts
  for insert
  with check (member_id = auth.uid());

-- Update is allowed by RLS (needed for the one-time scoring write below)
-- but the trigger is the real enforcement: it refuses any change to the
-- prediction fields, and refuses any update at all once scored_at is
-- already set.
create policy member_update_own_energy_forecasts on energy_forecasts
  for update
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

-- Deliberately no delete policy for members — "never edited, overwritten,
-- or deleted" is enforced at the RLS layer for deletes (there is no path
-- at all), same discipline migration 110 used for driver_probe_questions.

create policy coach_read_assigned_energy_forecasts on energy_forecasts
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_energy_forecasts on energy_forecasts
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

create or replace function enforce_energy_forecast_immutability()
returns trigger
language plpgsql
as $$
begin
  if new.member_id <> old.member_id
     or new.forecast_date <> old.forecast_date
     or new.made_from_local_date <> old.made_from_local_date
     or new.predicted_energy_level <> old.predicted_energy_level
     or new.created_at <> old.created_at then
    raise exception 'energy_forecasts: the forecast itself is a permanent record and cannot be edited once made';
  end if;

  if old.scored_at is not null then
    raise exception 'energy_forecasts: this forecast has already been scored and cannot be changed again';
  end if;

  return new;
end;
$$;

create trigger energy_forecasts_immutability
before update on energy_forecasts
for each row execute function enforce_energy_forecast_immutability();

comment on table energy_forecasts is
  'Her permanent, once-only prediction of tomorrow''s energy, made at the end of
   Evening Reflection. Never shown on the morning check-in form before she
   submits — see lib/energy-forecast/. Scored exactly once, after the
   forecasted day''s real check-in exists.';

-- ---------------------------------------------------------------------
-- Root's own forecast — same shape, same discipline, written
-- independently of whether she made her own forecast that evening.
-- ---------------------------------------------------------------------

create table root_energy_forecasts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  forecast_date date not null,
  predicted_energy_level smallint not null check (predicted_energy_level between 1 and 5),
  -- What produced this number and how much real history backed it —
  -- always a real, queryable count, never asserted. See
  -- lib/energy-forecast/rootForecast.ts.
  method text not null default 'recent_average',
  basis_observation_count smallint not null check (basis_observation_count >= 0),
  created_at timestamptz not null default now(),

  actual_energy_level smallint check (actual_energy_level between 1 and 5),
  gap smallint,
  scored_at timestamptz,

  unique (member_id, forecast_date)
);

create index root_energy_forecasts_member_idx on root_energy_forecasts (member_id, forecast_date);

alter table root_energy_forecasts enable row level security;

create policy member_select_own_root_energy_forecasts on root_energy_forecasts
  for select
  using (member_id = auth.uid());

-- Root's forecast is written by the same request flow as her own
-- (Evening Reflection submission, under her own session) — never a
-- service-role write — so insert/update policies mirror energy_forecasts
-- exactly, member-scoped.
create policy member_insert_own_root_energy_forecasts on root_energy_forecasts
  for insert
  with check (member_id = auth.uid());

create policy member_update_own_root_energy_forecasts on root_energy_forecasts
  for update
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

create policy coach_read_assigned_root_energy_forecasts on root_energy_forecasts
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_root_energy_forecasts on root_energy_forecasts
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

create or replace function enforce_root_energy_forecast_immutability()
returns trigger
language plpgsql
as $$
begin
  if new.member_id <> old.member_id
     or new.forecast_date <> old.forecast_date
     or new.predicted_energy_level <> old.predicted_energy_level
     or new.method <> old.method
     or new.basis_observation_count <> old.basis_observation_count
     or new.created_at <> old.created_at then
    raise exception 'root_energy_forecasts: Root''s forecast is a permanent record and cannot be edited once made';
  end if;

  if old.scored_at is not null then
    raise exception 'root_energy_forecasts: this forecast has already been scored and cannot be changed again';
  end if;

  return new;
end;
$$;

create trigger root_energy_forecasts_immutability
before update on root_energy_forecasts
for each row execute function enforce_root_energy_forecast_immutability();

comment on table root_energy_forecasts is
  'Root''s own once-only prediction of a member''s next-day energy, written only
   once basis_observation_count clears ROOT_FORECAST_MIN_HISTORY_DAYS
   (lib/energy-forecast/constants.ts). Absence of a row for a date is the
   honest "not enough history yet" signal, never a fabricated forecast.';
