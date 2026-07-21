-- Exercise Library foundation.
--
-- This is the permanent Exercise Library backing exercise search, browse,
-- detail, and favoriting (ExerciseAPI.dev as the content source) — plus the
-- database foundation for future Programs, coach prescriptions, member
-- exercise history, Root recommendations, and movement progression. It does
-- NOT build workout tables, a Program Builder, or wire this library into
-- daily Movement session generation — those stay explicitly out of scope
-- for this milestone, same restraint migration 71 (program_enrollment)
-- exercised for program content.
--
-- Reuses the existing single-source-of-truth Program Section taxonomy
-- rather than inventing a rival one: movement_session_exercises.section
-- (migration 58) already IS the system-wide Breathing/Mobility/Activation/
-- Strength/Conditioning/Recovery block taxonomy this task calls for — it
-- only lacked a 'stability' bucket. That's added here, additively (same
-- convention as every other check-constraint widening in this schema —
-- see migration 58's own header for ai_events.event_type), so
-- 'preparation' (general warm-up, already used by the placeholder catalog)
-- is kept rather than replaced, and 'stability' becomes available for any
-- exercise — from ExerciseAPI or a future source — that genuinely belongs
-- there. mef_exercise_metadata.program_section reads from this exact same
-- widened constraint, so there is exactly one program-section taxonomy in
-- the system, not two.
--
--   mef_exercise_metadata       The MEF metadata layer that sits on top of
--                                ExerciseAPI.dev (or any future exercise
--                                content provider). Never modifies
--                                ExerciseAPI's own data — this only stores
--                                MEF's own curation for exercises that
--                                become part of the MEF system. Not every
--                                ExerciseAPI exercise needs a row; the
--                                library works from the API directly for
--                                anything uncurated, exactly like
--                                food_products.raw_source_data backs
--                                un-curated products alongside mef_verified
--                                ones (migration 60).
--
--   member_exercise_favorites   One row per exercise a member has favorited.
--                                Same shape as member_food_favorites
--                                (migration 60, Part 4): provider + external
--                                id rather than a foreign key, since the
--                                exercise itself lives in ExerciseAPI.dev,
--                                not this database.
--
--   movement_programs /
--   movement_program_versions   Foundation only for future Program
--                                versioning (e.g. "Low Back Recovery v1",
--                                "Low Back Recovery v2"). Deliberately NOT
--                                the same `programs` table migration 71
--                                created — that table is the membership/
--                                enrollment program concept ('holistic_reset'
--                                phases a member is enrolled in) and already
--                                has program_enrollments/program_phases
--                                depending on its exact shape; conflating it
--                                with a future workout-program-template
--                                concept would corrupt an existing FK
--                                relationship. This is a separate, empty
--                                foundation — no Program Builder, no
--                                content, no seed rows invented.
--
-- RLS follows the exact established pattern (migration 15 helpers,
-- migrations 27-37/58/60 precedent): member-owned tables get
-- member_read_own / member_insert_own / member_delete_own +
-- platform_admin_all; shared reference tables get authenticated_read +
-- platform_admin_all, with mef_exercise_metadata additionally writable by
-- an active coach (the "coach_notes", "corrective_focus" etc. fields are
-- coach/clinical curation, not member-authored).

-- ============================================================================
-- Program Section taxonomy — widen additively to add 'stability'.
-- ============================================================================
alter table movement_session_exercises drop constraint movement_session_exercises_section_check;
alter table movement_session_exercises add constraint movement_session_exercises_section_check
  check (section in (
    'preparation', 'breathing', 'mobility', 'activation', 'stability',
    'strength', 'conditioning', 'recovery'
  ));

-- ============================================================================
-- mef_exercise_metadata
-- ============================================================================
create table mef_exercise_metadata (
  id uuid primary key default gen_random_uuid(),

  -- Which content source this metadata describes an exercise from, and that
  -- source's own id for it — never a foreign key, since the exercise itself
  -- lives in that external system, not this database (same reasoning as
  -- movement_session_exercises.exercise_id, migration 58).
  provider text not null default 'exercise_api_dev',
  external_id text not null,

  program_section text check (program_section in (
    'preparation', 'breathing', 'mobility', 'activation', 'stability',
    'strength', 'conditioning', 'recovery'
  )),
  movement_category text,
  body_region text[] not null default '{}',
  equipment text[] not null default '{}',
  difficulty text check (difficulty in ('beginner', 'intermediate', 'advanced')),

  corrective_focus text[] not null default '{}',
  mobility_focus text[] not null default '{}',
  strength_focus text[] not null default '{}',
  stability_focus text[] not null default '{}',

  contraindications text[] not null default '{}',
  coaching_cues text[] not null default '{}',

  -- Names/ids of easier and harder variations of this exercise, as
  -- surfaced by the provider (ExerciseAPI.dev's own "variations" list is
  -- free-text exercise names, not ids — see the trial evaluation) or
  -- curated by MEF directly.
  regressions text[] not null default '{}',
  progressions text[] not null default '{}',

  goal_tags text[] not null default '{}',
  limitation_tags text[] not null default '{}',
  coach_notes text,

  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (provider, external_id)
);

create index mef_exercise_metadata_program_section_idx on mef_exercise_metadata (program_section);
create index mef_exercise_metadata_movement_category_idx on mef_exercise_metadata (movement_category);
create index mef_exercise_metadata_body_region_idx on mef_exercise_metadata using gin (body_region);
create index mef_exercise_metadata_equipment_idx on mef_exercise_metadata using gin (equipment);
create index mef_exercise_metadata_goal_tags_idx on mef_exercise_metadata using gin (goal_tags);

alter table mef_exercise_metadata enable row level security;

-- Every signed-in member can read MEF metadata — it powers search/filter
-- for everyone browsing the library, not just coaches.
create policy authenticated_read_mef_exercise_metadata on mef_exercise_metadata
  for select
  using (auth.role() = 'authenticated');

create policy coach_insert_mef_exercise_metadata on mef_exercise_metadata
  for insert
  with check (public.has_active_role(auth.uid(), 'coach'));

create policy coach_update_mef_exercise_metadata on mef_exercise_metadata
  for update
  using (public.has_active_role(auth.uid(), 'coach'));

create policy coach_delete_mef_exercise_metadata on mef_exercise_metadata
  for delete
  using (public.has_active_role(auth.uid(), 'coach'));

create policy platform_admin_all_mef_exercise_metadata on mef_exercise_metadata
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================================
-- member_exercise_favorites
-- ============================================================================
create table member_exercise_favorites (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  provider text not null default 'exercise_api_dev',
  external_id text not null,

  created_at timestamptz not null default now(),

  unique (member_id, provider, external_id)
);

create index member_exercise_favorites_member_idx on member_exercise_favorites (member_id);

alter table member_exercise_favorites enable row level security;

create policy member_read_own_exercise_favorites on member_exercise_favorites
  for select using (member_id = auth.uid());
create policy member_insert_own_exercise_favorites on member_exercise_favorites
  for insert with check (member_id = auth.uid());
create policy member_delete_own_exercise_favorites on member_exercise_favorites
  for delete using (member_id = auth.uid());
create policy platform_admin_all_exercise_favorites on member_exercise_favorites
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================================
-- Program Version Foundation — movement_programs / movement_program_versions
-- Foundation only. Empty; no Program Builder, no content authored here.
-- ============================================================================
create table movement_programs (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table movement_programs enable row level security;

create policy authenticated_read_movement_programs on movement_programs
  for select using (auth.role() = 'authenticated');
create policy platform_admin_all_movement_programs on movement_programs
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

create table movement_program_versions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references movement_programs(id) on delete cascade,

  version_number int not null,
  display_name text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,

  unique (program_id, version_number)
);

create index movement_program_versions_program_idx on movement_program_versions (program_id);

alter table movement_program_versions enable row level security;

create policy authenticated_read_movement_program_versions on movement_program_versions
  for select using (auth.role() = 'authenticated');
create policy platform_admin_all_movement_program_versions on movement_program_versions
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
