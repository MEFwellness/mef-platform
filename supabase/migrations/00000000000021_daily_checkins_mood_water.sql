-- Fixes a schema-drift bug: apps/consumer-web-app/app/actions/checkin.ts and
-- app/dashboard/page.tsx already reference mood_level and water_cups on
-- daily_checkins, but neither column was ever added to the table or to
-- submit_daily_checkin() (migration 19). Adding them for real rather than
-- removing the app-layer fields, since day-to-day mood and hydration are
-- core metrics for this product. Same 1-5 scale convention as sleep_quality/
-- energy_level/stress_level for mood_level; water_cups is a plain
-- non-negative count (cups logged today), matching the dashboard's "X of 8
-- cups" tracker.
alter table daily_checkins
  add column mood_level int check (mood_level between 1 and 5),
  add column water_cups int check (water_cups >= 0);

-- daily_checkins_current (migration 13) is a `select *` view — Postgres
-- freezes a select-* view's column list at creation time, so the ALTER
-- above does not propagate to it on its own. Recreate it so the new
-- columns are actually visible through the view the app reads from.
drop view daily_checkins_current;

create view daily_checkins_current
  with (security_invoker = true) as
  select distinct on (user_id, local_date) *
  from daily_checkins
  order by user_id, local_date, checkin_version desc;
