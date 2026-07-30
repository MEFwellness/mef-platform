-- Coach-side workout/program generation via Your Move's /workouts/generate
-- and /programs/generate endpoints (exercise-api.ymove.app). This migration
-- adds only an audit log — generation itself never touches its own table;
-- a saved draft becomes ordinary coach_program_templates/coach_program_
-- template_sections/coach_program_template_exercises rows (migration 82),
-- through the exact same createTemplate/replaceTemplateContent functions a
-- hand-built program uses. No new columns on those tables and no member-
-- visible schema change at all — an assigned generated program looks
-- identical to a hand-built one everywhere a member can see it.
--
--   your_move_generation_log   One row per generate call a coach makes
--                                (workout or program), success or failure.
--                                `saved_template_ids` starts empty and is
--                                appended to only if/when the coach saves
--                                the resulting draft to the Program
--                                Library — a generated-but-discarded draft
--                                leaves a log row with an empty array,
--                                never a phantom template.
--
-- Coach-owned, same "coach's private content" RLS posture as
-- coach_program_templates (migration 82): a coach reads/inserts only their
-- own rows, platform_administrator reads all (support/audit).

create table your_move_generation_log (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,

  kind text not null check (kind in ('workout', 'program')),
  -- The coach-facing request params (muscle groups/equipment/difficulty,
  -- or goal/weeks/difficulty) — documented in
  -- lib/your-move/generation.ts, same "flexible jsonb, documented in app
  -- code" convention as coach_program_assignments.schedule_config.
  request_params jsonb not null default '{}'::jsonb,

  status text not null check (status in ('success', 'error')),
  error_code text,
  error_message text,

  -- Populated on success only: name/exerciseCount/estimatedMinutes for a
  -- workout, or name/goal/daysPerWeek/split for a program — never the full
  -- generated content (that lives transiently in the coach's own browser
  -- session as an editable draft until explicitly saved).
  result_summary jsonb not null default '{}'::jsonb,

  -- Empty until the coach saves the draft; one id for a saved workout,
  -- one id per day-template for a saved multi-day program.
  saved_template_ids uuid[] not null default '{}',

  created_at timestamptz not null default now()
);

create index your_move_generation_log_coach_idx
  on your_move_generation_log (coach_id, created_at desc);

alter table your_move_generation_log enable row level security;

create policy coach_read_own_your_move_generation_log on your_move_generation_log
  for select
  using (coach_id = auth.uid());

create policy coach_insert_own_your_move_generation_log on your_move_generation_log
  for insert
  with check (coach_id = auth.uid());

create policy coach_update_own_your_move_generation_log on your_move_generation_log
  for update
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

create policy platform_admin_all_your_move_generation_log on your_move_generation_log
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
