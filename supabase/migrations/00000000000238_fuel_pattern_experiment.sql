-- Rooted Reset Fuel Pattern Assessment, Build 4 of 4: the 7 Day Fuel
-- Experiment.
--
-- WHAT THIS TURNS THE ASSESSMENT INTO. Builds 1 to 3 end with a reading,
-- a starting range, a plate and four meals: a hypothesis about how she
-- runs best. This is the loop that tests it. She starts a run, logs a ten
-- second check after a meal, and the app looks for a pattern in what she
-- noticed. Nothing here changes her reading, her range, her plate or her
-- meal cards. Refining the pattern itself stays a coach conversation and
-- a retake.
--
-- TWO TABLES AND NOTHING ELSE. The insight library is code, in
-- apps/consumer-web-app/lib/fuel-pattern/experiment/insights.ts, for the
-- same reason the seventy two meals are code (migration 237): every word
-- of it is copy a member reads, and the guards that keep an em dash or a
-- prescriptive phrase off her screen walk source files with the
-- TypeScript compiler and cannot see inside a database.
--
-- THE STANDING INSIGHT IS NOT STORED EITHER, AND THAT IS DELIBERATE. It
-- is replayed from her checks in the order she logged them, by a pure
-- function, so the screen she reads and the coach's history can never
-- drift apart and there is no second place for the same fact to live.
-- The rows below are what she actually did; everything said about them
-- is derived from these rows and only from these rows.
--
-- NOTHING HERE IS WRITTEN BY A RENDER. Every write is behind an explicit
-- tap, through app/api/fuel-pattern/experiment/route.ts, for the reason
-- migration 237 gives: the result page holds a reveal that a re-render of
-- its own route would replace. The single exception is the archive that
-- happens when she FINISHES a retake, which is a Server Action behind the
-- last button of a sitting, in the same request that writes the new
-- result row.

-- ---------------------------------------------------------------------
-- 1) One run of the experiment.
--
--    started_on IS A CALENDAR DAY IN HER OWN TIMEZONE, not an instant.
--    Day 1 is the day she pressed START MY EXPERIMENT where she was
--    standing, and the run completes once the seventh of those days has
--    passed. A timestamptz here would put a member in Los Angeles on day
--    2 at five in the afternoon.
--
--    STATUS IS DERIVED, NOT STORED, except for the two things only a
--    person can decide: archived_at (she restarted, or a retake ended
--    this run) and acknowledged_at (she pressed DONE on the completion
--    screen). Whether a run is active or complete is a question about
--    today's date, and storing the answer would mean a row that is wrong
--    every morning until something happens to correct it.
-- ---------------------------------------------------------------------
create table fuel_experiments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  -- The sitting she started this run from. It is what lets a FINISHED
  -- retake archive the run belonging to the previous sitting without
  -- guessing, and it is idempotent: completing the same sitting twice
  -- finds nothing left to archive.
  session_id uuid references unified_assessment_sessions(id) on delete set null,

  -- The reading she held when she started. Stored rather than looked up
  -- so an archived run still says which hypothesis it was testing, even
  -- after a retake changed her reading.
  pattern text not null check (pattern in (
    'protein_supportive', 'balanced_fuel', 'carb_supportive', 'flexible_fuel'
  )),

  started_on date not null,

  -- She pressed DONE on the completion screen.
  acknowledged_at timestamptz,

  -- The run is over and put away. Data is never deleted: the coach still
  -- sees every archived run and every check inside it.
  archived_at timestamptz,
  archived_reason text check (archived_reason in ('restarted', 'retake')),

  created_at timestamptz not null default now()
);

-- ONE LIVE RUN PER MEMBER, ENFORCED BY THE DATABASE. Starting or
-- restarting is a read then insert from a route handler, and a member
-- tapping twice on a slow connection is a race rather than a mistake.
-- A restart archives the previous run in the same request, so the
-- partial index is exactly the rule the feature has.
create unique index fuel_experiments_one_live_per_member
  on fuel_experiments (member_id) where archived_at is null;

create index fuel_experiments_member_idx
  on fuel_experiments (member_id, started_on desc);

alter table fuel_experiments enable row level security;

create policy member_read_own_fuel_experiments on fuel_experiments
  for select using (member_id = auth.uid());
create policy member_insert_own_fuel_experiments on fuel_experiments
  for insert with check (member_id = auth.uid());
create policy member_update_own_fuel_experiments on fuel_experiments
  for update using (member_id = auth.uid());
create policy coach_read_assigned_fuel_experiments on fuel_experiments
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );
create policy platform_admin_all_fuel_experiments on fuel_experiments
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ---------------------------------------------------------------------
-- 2) One quick check. Three answers, one optional meal tag.
--
--    THERE IS NO SCORE COLUMN AND NO STREAK COLUMN. Nothing about this
--    is graded. Multiple checks in one day are ordinary, missed days are
--    ordinary, and the run completes on day 7 however many rows are
--    here, so there is nothing for a count to be measured against.
--
--    meal_id IS TEXT, LIKE EVERY OTHER MEAL REFERENCE IN THIS FEATURE.
--    The library is code, so there is no meals table for a foreign key
--    to point at, and an id whose meal a later content edit removed
--    resolves to null rather than throwing (migration 237).
-- ---------------------------------------------------------------------
create table fuel_experiment_checks (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references fuel_experiments(id) on delete cascade,

  -- Carried on the row as well as reachable through the run, so every
  -- policy on this table is a column comparison rather than a subquery.
  member_id uuid not null references auth.users(id) on delete cascade,

  -- The calendar day she logged it on, in her own timezone, for the same
  -- reason started_on is a date.
  logged_on date not null,

  energy text not null check (energy in ('low', 'steady', 'great')),
  hunger text not null check (hunger in ('hungry', 'comfortable', 'still_very_full')),
  clarity text not null check (clarity in ('foggy', 'normal', 'clear')),

  -- Both optional, and independent: she can name the part of the day
  -- without naming a meal. A meal tag always carries its own meal type.
  meal_type text check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  meal_id text,

  created_at timestamptz not null default now()
);

create index fuel_experiment_checks_run_idx
  on fuel_experiment_checks (experiment_id, created_at);
create index fuel_experiment_checks_member_idx
  on fuel_experiment_checks (member_id, created_at desc);

alter table fuel_experiment_checks enable row level security;

create policy member_read_own_fuel_experiment_checks on fuel_experiment_checks
  for select using (member_id = auth.uid());
create policy member_insert_own_fuel_experiment_checks on fuel_experiment_checks
  for insert with check (member_id = auth.uid());
create policy member_delete_own_fuel_experiment_checks on fuel_experiment_checks
  for delete using (member_id = auth.uid());
create policy coach_read_assigned_fuel_experiment_checks on fuel_experiment_checks
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );
create policy platform_admin_all_fuel_experiment_checks on fuel_experiment_checks
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
