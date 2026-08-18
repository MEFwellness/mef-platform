-- ============================================================================
-- 176. What a member is TOLD about the program she was given.
-- ============================================================================
-- Until now a member read a composed, interim sentence ("A 4 week program
-- from your coach, 3 sessions a week.") and nothing at all under "Why this
-- exercise", because every stored reason on this path was written in coach
-- vocabulary and lib/programs/memberPresentation.ts correctly refuses to
-- show her that. This migration gives both a place to live.
--
-- TWO NEW TEXT COLUMNS, NOT ONE REWRITTEN ONE. The coach's reasoning and
-- the member's explanation are two different texts for two different
-- readers, and the coach screens keep reading exactly what they read today.
-- Nothing here overwrites, migrates or reinterprets a single existing
-- string: every column added is null on every row that already exists, and
-- null is the state that means "this program was assigned before there was
-- an explanation to give", which the screens render exactly as they render
-- it now.
--
--   coach_program_assignments.member_explanation
--       "Why this program", per assigned program. Composed at assignment
--       time from what is truthfully known, edited by the coach before she
--       presses Approve and after, and read by the member on her program
--       screen. It lives on the assignment container rather than on the
--       frozen workout rows because a coach may edit it AFTER assigning:
--       one row per weekly session to update, not one per occurrence.
--
--   coach_program_template_exercises.member_reasoning
--   coach_assigned_workout_exercises.member_reasoning
--       "Why this exercise", in her language. Rule-composed from the
--       slot's own block, movement pattern and role. It freezes into the
--       snapshot exactly like the prescription does, because it describes
--       what she was asked to do on the day she was asked to do it.
--
-- The member's read surface for the assignment container is the
-- member_program_lifecycle view (migration 172), which exists precisely
-- because coach_program_assignments has no member SELECT policy and a row
-- policy cannot withhold a column. The view is recreated below with the new
-- column added to its select list, and with nothing else added: assignment_
-- notes and internal_notes remain absent, so there is still no policy to
-- get wrong.
--
-- Also here, because the coach who reviewed the v2 blueprint asked for it:
-- a catalog rename. See section 4.
-- ============================================================================

-- ============================================================================
-- 1) The program-level explanation.
-- ============================================================================
alter table public.coach_program_assignments
  add column if not exists member_explanation text;

comment on column public.coach_program_assignments.member_explanation is
  'Why this program, in the member''s own language. Composed by rule from real data at assignment time, edited by the coach before and after assigning, read by the member through member_program_lifecycle. Null on every program assigned before this existed, and null renders as the interim composed blurb exactly as it does today.';

-- ============================================================================
-- 2) The per-exercise explanation, on the template and on the snapshot.
-- ============================================================================
alter table public.coach_program_template_exercises
  add column if not exists member_reasoning text;

alter table public.coach_assigned_workout_exercises
  add column if not exists member_reasoning text;

comment on column public.coach_program_template_exercises.member_reasoning is
  'Why this exercise, written for the member. Distinct from selection_reasoning, which is the coach''s own vocabulary and stays exactly as it is on every coach screen.';

comment on column public.coach_assigned_workout_exercises.member_reasoning is
  'Frozen copy of the template exercise''s member_reasoning at assignment time. Never re-read from the template afterwards, same rule as every other column on this table.';

-- ============================================================================
-- 3) The member's lifecycle view, with the explanation in it.
-- ============================================================================
-- Recreated rather than altered: a view's select list cannot be extended in
-- place. Column for column identical to migration 172's, plus
-- member_explanation. Still member's own rows only, still published only,
-- still no assignment_notes and no internal_notes.
drop view if exists public.member_program_lifecycle;

create view public.member_program_lifecycle as
  select
    a.id,
    a.member_id,
    a.template_name_snapshot,
    a.program_group_key,
    a.status,
    a.start_date,
    a.end_date,
    a.duration_weeks,
    a.current_week,
    a.paused_days,
    a.started_at,
    a.completed_at,
    a.paused_at,
    a.resumed_at,
    a.replaced_at,
    a.replaced_by_assignment_id,
    a.schedule_type,
    a.schedule_config,
    a.published_at,
    a.member_explanation,
    a.created_at,
    a.updated_at
  from coach_program_assignments a
  where a.member_id = auth.uid()
    and a.visibility = 'published';

comment on view public.member_program_lifecycle is
  'One member''s own published programs, lifecycle columns plus the explanation written for her. Never assignment_notes, never internal_notes: they are not in the select list, so there is no policy to get wrong.';

revoke all on public.member_program_lifecycle from public;
grant select on public.member_program_lifecycle to authenticated;

-- ============================================================================
-- 4) Catalog rename: "Split squat (R)" becomes "Split Squat".
-- ============================================================================
-- Migration 175 put this exercise on the v2 blueprint and left its name
-- visibly wrong on purpose, saying in its own header that the fix was a
-- catalog rename and not a blueprint change. This is that rename.
--
-- The "(R)" was never a coaching instruction. The catalog stores left and
-- right as separate rows and only the right one is dumbbell-loaded, so the
-- suffix is vendor plumbing that leaked into a name a member would read.
-- The slot is marked per side, which is where "do both legs" is actually
-- said, and the exercise's own instructions already say to finish one leg
-- before switching.
--
-- WHAT IS AND IS NOT UPDATED. exercise_catalog is the live record and it is
-- renamed. program_blueprint_slots carries a denormalized exercise_name for
-- an AUTHORED blueprint, which is not a snapshot of anything, so it follows
-- the catalog. coach_program_template_exercises, coach_assigned_workout_
-- exercises, member_exercise_completions and member_exercise_recent_views
-- are all records of what was prescribed or done at a moment in time, and
-- they are deliberately left alone: renaming inside a frozen snapshot would
-- change what a coach approved after she approved it.
update public.exercise_catalog
set name = 'Split Squat', updated_at = now()
where provider = 'your_move'
  and name = 'Split squat (R)';

update public.program_blueprint_slots
set exercise_name = 'Split Squat', updated_at = now()
where exercise_name = 'Split squat (R)';

-- The slot's coach-facing purpose explained the "(R)" as a catalog defect.
-- The defect is fixed, so the sentence explaining it is not true any more.
update public.program_blueprint_slots
set purpose =
      'Single side strength, stationary. Feet set in a split stance and left there: no stepping in or out, and every rep on one leg before switching. The slot is marked per side, so the member does both.',
    updated_at = now()
where exercise_name = 'Split Squat'
  and purpose like '%Catalog name carries (R)%';

-- ============================================================================
-- 5) Assertions (style: migrations 153, 174 and 175).
-- ============================================================================
do $$
declare
  v_renamed int;
  v_old_name int;
  v_slots int;
  v_view_cols int;
begin
  -- The rename landed on exactly one catalog row, and no row anywhere in
  -- the catalog still carries the old name.
  select count(*) into v_renamed
  from exercise_catalog where name = 'Split Squat';
  if v_renamed <> 1 then
    raise exception 'Expected exactly 1 catalog row named "Split Squat", found %', v_renamed;
  end if;

  select count(*) into v_old_name
  from exercise_catalog where name = 'Split squat (R)';
  if v_old_name <> 0 then
    raise exception 'Catalog still carries "Split squat (R)" on % row(s)', v_old_name;
  end if;

  -- Every blueprint slot that pointed at it reads the new name, and it
  -- still points at the same catalog row: the join is by (provider,
  -- external_id) and nothing about the id changed.
  select count(*) into v_slots
  from program_blueprint_slots s
  join exercise_catalog c
    on c.provider = s.provider and c.external_id = s.external_id
  where s.exercise_name = 'Split Squat' and c.name = 'Split Squat';
  if v_slots < 1 then
    raise exception 'No blueprint slot resolves to the renamed exercise';
  end if;

  if exists (
    select 1 from program_blueprint_slots where exercise_name = 'Split squat (R)'
  ) then
    raise exception 'A blueprint slot still carries the old catalog name';
  end if;

  -- Every slot's denormalized name still agrees with the catalog row it
  -- points at. The rename is the kind of change that silently breaks this,
  -- so it is checked over the whole table rather than over the one row.
  if exists (
    select 1
    from program_blueprint_slots s
    join exercise_catalog c
      on c.provider = s.provider and c.external_id = s.external_id
    where s.exercise_name is distinct from c.name
  ) then
    raise exception 'A blueprint slot name disagrees with its catalog row';
  end if;

  -- The member's view gained exactly one column and lost none.
  select count(*) into v_view_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'member_program_lifecycle';
  if v_view_cols <> 22 then
    raise exception 'member_program_lifecycle should expose 22 columns, exposes %', v_view_cols;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'member_program_lifecycle'
      and column_name = 'member_explanation'
  ) then
    raise exception 'member_program_lifecycle is missing member_explanation';
  end if;

  -- And it still cannot serve the two coach-only columns.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'member_program_lifecycle'
      and column_name in ('assignment_notes', 'internal_notes')
  ) then
    raise exception 'member_program_lifecycle exposes a coach-only column';
  end if;

  -- Nothing existing was given an explanation by this migration. Every
  -- program already assigned keeps reading exactly as it reads today.
  if exists (select 1 from coach_program_assignments where member_explanation is not null) then
    raise exception 'This migration wrote a member_explanation onto an existing assignment';
  end if;
  if exists (select 1 from coach_assigned_workout_exercises where member_reasoning is not null) then
    raise exception 'This migration wrote a member_reasoning onto an existing frozen exercise';
  end if;
end $$;
