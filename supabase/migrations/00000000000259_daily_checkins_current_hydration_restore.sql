-- Restores hydration_tracked on daily_checkins_current.
--
-- WHAT WENT WRONG. Migration 163 (the hydration focus) rebuilt this view to
-- carry one extra column, hydration_tracked, read from
-- public.member_hydration_tracked(user_id). Migration 257 had to recreate
-- the view so the two new check-in note columns would show through, and
-- recreated it from the older plain `select *` form, which silently dropped
-- that column. Since then:
--
--   a read that names hydration_tracked (the weekly food report's water
--     line, the coaching insights check-in source) fails with 42703 and
--     returns nothing;
--   every other read gets no flag, which lib/hydration/gate.ts reads as
--     "tracked", so a member who turned water tracking off sees and is
--     scored on water again.
--
-- THE FIX IS MIGRATION 163'S OWN DEFINITION, UNCHANGED. The daily_checkins
-- columns come through `d.*` in the same order as before, so 257's two note
-- columns stay, and hydration_tracked is appended after them. Appending a
-- column is exactly what `create or replace view` allows, so the view is
-- never dropped and there is no moment in which it does not exist.
--
-- It was found by running the real-database test
-- tests/hydration-focus.test.ts against a local database brought up to
-- date, which the suite had not been doing. The static guard in
-- tests/daily-checkins-view-hydration-guard.test.ts now reads the LAST
-- migration that defines this view, so a future recreation that forgets
-- the column fails in the ordinary test run.

create or replace view daily_checkins_current
  with (security_invoker = true) as
  select distinct on (d.user_id, d.local_date)
    d.*,
    public.member_hydration_tracked(d.user_id) as hydration_tracked
  from daily_checkins d
  order by d.user_id, d.local_date, d.checkin_version desc;
