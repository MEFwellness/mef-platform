-- Coach Program Builder and Workout Prescription System.
--
-- Builds the coach-authored counterpart to the member-driven Exercise
-- Library (migrations 80-81): reusable workout Program Templates a coach
-- builds once and assigns to clients, plus the frozen, per-client
-- Assigned Workouts those assignments produce. Deliberately does NOT
-- reuse movement_programs/movement_program_versions (migration 80) — that
-- pair's own header comment explicitly reserves it for a future curated-
-- content concept ("Low Back Recovery v1/v2") and warns against
-- conflating it with a coach-per-client template concept; this migration
-- honors that and adds its own tables instead. Does NOT touch
-- movement_sessions/movement_session_exercises (migration 58, the
-- decision-engine-generated daily session) or the Exercise Library tables
-- (migrations 80-81) — those stay exactly as they work today.
--
-- The core invariant this schema exists to enforce: the workout itself is
-- not the source of truth, the prescription is. A Program Template can
-- keep evolving after it's been assigned; every already-assigned workout
-- is a frozen copy that a later template edit can never reach.
--
--   coach_program_templates            One row per reusable template a
--                                        coach has built. Coach-owned —
--                                        only its own coach (and platform
--                                        admins) can read or write it, same
--                                        "coach's private content" posture
--                                        as coach_notes (migration 23).
--
--   coach_program_template_sections     Unlimited ordered sections per
--                                        template (Warm Up, Strength,
--                                        Cooldown, a custom name, ...).
--
--   coach_program_template_exercises    One prescribed exercise within a
--                                        section. Not a foreign key to any
--                                        exercise catalog table — a text
--                                        provider+external_id pair into
--                                        whichever content source (today,
--                                        ExerciseAPI.dev), same convention
--                                        as movement_session_exercises.
--                                        exercise_id and mef_exercise_
--                                        metadata (migration 80/58).
--
--   coach_program_assignments           One row per "assign this template
--                                        to this member" action. Holds the
--                                        schedule (single/weekly/multiple
--                                        weeks/specific dates/repeating),
--                                        draft/published visibility, and a
--                                        soft (on delete set null) lineage
--                                        pointer back to the template it
--                                        came from — for display/analytics
--                                        only, never read to render a
--                                        workout. "Assign to multiple
--                                        members/groups (future ready)" is
--                                        satisfied by the app layer
--                                        creating one row per member; no
--                                        group table is invented here,
--                                        same "foundation only, no more
--                                        than asked for" restraint as
--                                        movement_programs' own header.
--
--   coach_assigned_workouts             One row per concrete scheduled
--                                        workout occurrence a member will
--                                        see — the actual frozen snapshot.
--                                        Every display field a template
--                                        exercise has (name, description,
--                                        goal, difficulty, tags, ...) is
--                                        copied here at creation time, not
--                                        referenced, so a later template
--                                        edit — or even a template delete
--                                        — can never alter or break an
--                                        already-assigned workout. Also
--                                        the "Coach Notes" home (coach_
--                                        notes = member-visible,
--                                        internal_notes = coach-only),
--                                        each with automatic timestamps
--                                        (updated_at) and author tracking
--                                        (coach_id) already on the row —
--                                        no separate notes table needed.
--
--   coach_assigned_workout_sections     Frozen copy of the template's
--                                        sections for this one occurrence.
--
--   coach_assigned_workout_exercises    Frozen copy of the template's
--                                        exercise prescriptions for this
--                                        one occurrence, plus the mutable
--                                        member-facing completion state
--                                        (status/timestamps/notes/ratings)
--                                        — the one part of this row that
--                                        is expected to change after
--                                        creation, same "immutable content,
--                                        mutable status" split as
--                                        movement_session_exercises'
--                                        completed/completed_at/
--                                        member_notes columns.
--
-- Visibility: coach_assigned_workouts.published_at is set (once, on all of
-- an assignment's rows in a single batched update) when a coach publishes
-- a draft assignment. A member can only ever SELECT rows with
-- published_at set; a coach sees everything regardless, via the existing
-- has_active_role + is_active_coach_for pattern (migration 15). Denormalized
-- onto coach_assigned_workouts directly (not computed via a join to
-- coach_program_assignments on every read) for the same reason movement_
-- session_exercises denormalizes member_id from movement_sessions —
-- cheap, indexable, no per-row join needed to decide visibility.
--
-- RLS follows the exact established pattern used throughout this schema
-- (migration 15 helpers; migrations 27-41/58/77/80/81 precedent):
-- coach_read_assigned / coach_insert_assigned / coach_update_assigned via
-- is_active_coach_for, member_read_own restricted to published rows,
-- member_update_own restricted to the mutable completion-state columns
-- (trusting the app layer to only ever send those, same convention as
-- movement_session_exercises' own member_update_own policy), and
-- platform_admin_all. Prescription content on coach_assigned_workout_
-- exercises has no coach UPDATE policy at all once inserted — "frozen
-- forever" is enforced by Postgres, not just app-layer discipline.

-- ============================================================================
-- health_timeline_events.event_type — widen additively, same convention
-- migrations 58/81 already used on this exact table.
-- ============================================================================
alter table health_timeline_events drop constraint health_timeline_events_event_type_check;
alter table health_timeline_events add constraint health_timeline_events_event_type_check
  check (event_type in (
    'onboarding_completed', 'reassessment_completed', 'checkin_submitted',
    'assessment_published', 'wearable_synced',
    'streak_milestone', 'trend_improving', 'trend_declining', 'wearable_connected',
    'movement_session_completed', 'evening_reflection_submitted',
    'exercise_completed', 'exercise_favorited', 'exercise_unfavorited',
    'exercise_skipped', 'movement_coach_review', 'movement_capability_milestone',
    'movement_program_completed',
    'coach_workout_assigned', 'coach_workout_completed', 'coach_workout_skipped'
  ));

-- ============================================================================
-- coach_program_templates
-- ============================================================================
create table coach_program_templates (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,

  name text not null,
  description text,
  goal text,
  difficulty text check (difficulty in ('beginner', 'intermediate', 'advanced')),
  estimated_duration_minutes int,

  equipment text[] not null default '{}',
  program_tags text[] not null default '{}',
  corrective_tags text[] not null default '{}',
  movement_tags text[] not null default '{}',
  target_muscles text[] not null default '{}',

  -- Member-visible instructions/guidance vs. coach-only authoring notes —
  -- same visible/private split every other coach-authored field in this
  -- schema uses (e.g. member_movement_profiles' coach_observations vs.
  -- assessment_assignments.reason).
  coach_notes text,
  internal_notes text,
  member_instructions text,

  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  is_favorited boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index coach_program_templates_coach_idx on coach_program_templates (coach_id, status);
create index coach_program_templates_program_tags_idx on coach_program_templates using gin (program_tags);
create index coach_program_templates_corrective_tags_idx on coach_program_templates using gin (corrective_tags);

alter table coach_program_templates enable row level security;

create policy coach_all_own_program_templates on coach_program_templates
  for all
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

create policy platform_admin_all_program_templates on coach_program_templates
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================================
-- coach_program_template_sections
-- ============================================================================
create table coach_program_template_sections (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references coach_program_templates(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,

  name text not null,
  section_type text not null default 'custom' check (section_type in (
    'warm_up', 'mobility', 'activation', 'corrective', 'strength',
    'conditioning', 'cardio', 'core', 'cooldown', 'recovery', 'custom'
  )),
  sequence_index int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index coach_program_template_sections_template_idx
  on coach_program_template_sections (template_id, sequence_index);

alter table coach_program_template_sections enable row level security;

create policy coach_all_own_program_template_sections on coach_program_template_sections
  for all
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

create policy platform_admin_all_program_template_sections on coach_program_template_sections
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================================
-- coach_program_template_exercises
-- ============================================================================
create table coach_program_template_exercises (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references coach_program_template_sections(id) on delete cascade,
  template_id uuid not null references coach_program_templates(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,

  provider text not null default 'exercise_api_dev',
  external_id text not null,
  exercise_name text not null,

  sequence_index int not null default 0,

  sets int,
  reps text,
  rep_range_low int,
  rep_range_high int,
  time_seconds int,
  distance_meters numeric,
  rest_seconds int,
  tempo text,
  rpe numeric(3, 1),
  load text,
  load_unit text check (load_unit in ('lbs', 'kg', 'bodyweight', 'band', 'other')),
  resistance text,
  band_color text,
  side text check (side in ('left', 'right', 'both', 'alternating')),
  unilateral boolean not null default false,
  hold_duration_seconds int,
  frequency text,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  is_required boolean not null default true,

  notes text,
  coaching_cues text,
  pain_modification_notes text,
  -- {regression: {provider, externalId, name}, progression: {...}, replacement: {...}}
  -- — each entry optional. A jsonb bag rather than nine separate columns
  -- for three optional exercise references, same "structured jsonb bag
  -- with a documented shape" convention as movement_sessions.selection_reasons.
  alternate_exercises jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index coach_program_template_exercises_section_idx
  on coach_program_template_exercises (section_id, sequence_index);
create index coach_program_template_exercises_template_idx
  on coach_program_template_exercises (template_id);

alter table coach_program_template_exercises enable row level security;

create policy coach_all_own_program_template_exercises on coach_program_template_exercises
  for all
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

create policy platform_admin_all_program_template_exercises on coach_program_template_exercises
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================================
-- coach_program_assignments
-- ============================================================================
create table coach_program_assignments (
  id uuid primary key default gen_random_uuid(),

  member_id uuid not null references auth.users(id) on delete cascade,
  coach_id uuid not null references auth.users(id),
  -- Lineage only, never read to render a workout — see this migration's
  -- header. on delete set null so deleting the source template never
  -- cascades into an assignment's history.
  template_id uuid references coach_program_templates(id) on delete set null,
  template_name_snapshot text not null,

  schedule_type text not null check (schedule_type in (
    'single', 'weekly', 'multiple_weeks', 'specific_dates', 'repeating'
  )),
  -- Shape depends on schedule_type: {date} for single;
  -- {daysOfWeek[], startDate, weeks} for weekly/multiple_weeks;
  -- {dates[]} for specific_dates; {startDate, endDate, everyNDays} for
  -- repeating. Documented in lib/coach-program-builder/scheduling.ts,
  -- same "flexible jsonb config, documented in app code" convention as
  -- member_movement_profiles.capability_summary.
  schedule_config jsonb not null default '{}'::jsonb,

  visibility text not null default 'draft' check (visibility in ('draft', 'published')),
  published_at timestamptz,

  assignment_notes text,
  internal_notes text,

  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id)
);

create index coach_program_assignments_member_idx
  on coach_program_assignments (member_id, status);
create index coach_program_assignments_coach_idx
  on coach_program_assignments (coach_id, status);

alter table coach_program_assignments enable row level security;

-- No member SELECT policy — a member never reads the assignment container
-- itself (it holds internal_notes, coach-only). They read published
-- occurrences through coach_assigned_workouts instead.
create policy coach_read_assigned_program_assignments on coach_program_assignments
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_insert_assigned_program_assignments on coach_program_assignments
  for insert
  with check (
    coach_id = auth.uid()
    and public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_update_assigned_program_assignments on coach_program_assignments
  for update
  using (
    coach_id = auth.uid()
    and public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_program_assignments on coach_program_assignments
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================================
-- coach_assigned_workouts
-- ============================================================================
create table coach_assigned_workouts (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references coach_program_assignments(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  coach_id uuid not null references auth.users(id),

  scheduled_date date not null,
  occurrence_label text,

  -- Frozen template-level content — copied at creation, never re-read
  -- from coach_program_templates after this row exists.
  template_name text not null,
  description text,
  goal text,
  difficulty text,
  estimated_duration_minutes int,
  equipment text[] not null default '{}',
  program_tags text[] not null default '{}',
  corrective_tags text[] not null default '{}',
  movement_tags text[] not null default '{}',
  target_muscles text[] not null default '{}',
  member_instructions text,

  -- Coach Notes — member-visible vs. coach-only, both timestamped
  -- (updated_at) and author-tracked (coach_id), see this migration's header.
  coach_notes text,
  internal_notes text,

  status text not null default 'not_started' check (status in (
    'not_started', 'in_progress', 'completed', 'skipped', 'partially_completed'
  )),
  started_at timestamptz,
  completed_at timestamptz,
  skipped_at timestamptz,
  member_feedback text,

  -- Set (once) when the parent assignment is published; null while the
  -- assignment is still a draft. This, not a join, is what member_read_own
  -- below actually gates on.
  published_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index coach_assigned_workouts_member_idx
  on coach_assigned_workouts (member_id, scheduled_date desc);
create index coach_assigned_workouts_assignment_idx
  on coach_assigned_workouts (assignment_id);
create index coach_assigned_workouts_coach_idx
  on coach_assigned_workouts (coach_id, scheduled_date desc);

alter table coach_assigned_workouts enable row level security;

create policy member_read_own_assigned_workouts on coach_assigned_workouts
  for select
  using (member_id = auth.uid() and published_at is not null);

create policy coach_read_assigned_assigned_workouts on coach_assigned_workouts
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_insert_assigned_assigned_workouts on coach_assigned_workouts
  for insert
  with check (
    coach_id = auth.uid()
    and public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

-- Covers both the member marking their own progress (status/timestamps/
-- feedback) and the coach editing coach_notes/internal_notes or
-- publishing (published_at) — RLS can't split columns between the two
-- trust levels on one UPDATE policy pair, so both are trusted to only
-- send their own fields, same convention as movement_session_exercises'
-- member_update_own policy.
create policy member_update_own_assigned_workouts on coach_assigned_workouts
  for update
  using (member_id = auth.uid() and published_at is not null);

create policy coach_update_assigned_assigned_workouts on coach_assigned_workouts
  for update
  using (
    coach_id = auth.uid()
    and public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_assigned_workouts on coach_assigned_workouts
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================================
-- coach_assigned_workout_sections
-- ============================================================================
create table coach_assigned_workout_sections (
  id uuid primary key default gen_random_uuid(),
  assigned_workout_id uuid not null references coach_assigned_workouts(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  coach_id uuid not null references auth.users(id),

  name text not null,
  section_type text not null default 'custom',
  sequence_index int not null default 0,

  created_at timestamptz not null default now()
);

create index coach_assigned_workout_sections_workout_idx
  on coach_assigned_workout_sections (assigned_workout_id, sequence_index);

alter table coach_assigned_workout_sections enable row level security;

create policy member_read_own_assigned_workout_sections on coach_assigned_workout_sections
  for select
  using (
    member_id = auth.uid()
    and exists (
      select 1 from coach_assigned_workouts w
      where w.id = assigned_workout_id and w.published_at is not null
    )
  );

create policy coach_read_assigned_assigned_workout_sections on coach_assigned_workout_sections
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_insert_assigned_assigned_workout_sections on coach_assigned_workout_sections
  for insert
  with check (
    coach_id = auth.uid()
    and public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_assigned_workout_sections on coach_assigned_workout_sections
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================================
-- coach_assigned_workout_exercises
-- ============================================================================
create table coach_assigned_workout_exercises (
  id uuid primary key default gen_random_uuid(),
  assigned_workout_id uuid not null references coach_assigned_workouts(id) on delete cascade,
  section_id uuid not null references coach_assigned_workout_sections(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  coach_id uuid not null references auth.users(id),

  provider text not null default 'exercise_api_dev',
  external_id text not null,
  exercise_name text not null,
  sequence_index int not null default 0,

  -- Frozen prescription — identical field set to
  -- coach_program_template_exercises, copied at creation, never updated
  -- by anyone after this row exists (no coach UPDATE policy below).
  sets int,
  reps text,
  rep_range_low int,
  rep_range_high int,
  time_seconds int,
  distance_meters numeric,
  rest_seconds int,
  tempo text,
  rpe numeric(3, 1),
  load text,
  load_unit text,
  resistance text,
  band_color text,
  side text,
  unilateral boolean not null default false,
  hold_duration_seconds int,
  frequency text,
  priority text not null default 'medium',
  is_required boolean not null default true,
  notes text,
  coaching_cues text,
  pain_modification_notes text,
  alternate_exercises jsonb not null default '{}'::jsonb,

  -- Mutable member-facing completion state — the one part of this row
  -- that changes after creation.
  status text not null default 'not_started' check (status in (
    'not_started', 'in_progress', 'completed', 'skipped', 'partially_completed'
  )),
  completed_at timestamptz,
  member_notes text,
  difficulty_rating text check (difficulty_rating in (
    'very_easy', 'easy', 'appropriate', 'difficult', 'very_difficult'
  )),
  comfort_rating text check (comfort_rating in (
    'comfortable', 'slight_discomfort', 'moderate_discomfort', 'pain'
  )),

  created_at timestamptz not null default now()
);

create index coach_assigned_workout_exercises_workout_idx
  on coach_assigned_workout_exercises (assigned_workout_id, sequence_index);
create index coach_assigned_workout_exercises_section_idx
  on coach_assigned_workout_exercises (section_id, sequence_index);
create index coach_assigned_workout_exercises_member_idx
  on coach_assigned_workout_exercises (member_id);

alter table coach_assigned_workout_exercises enable row level security;

create policy member_read_own_assigned_workout_exercises on coach_assigned_workout_exercises
  for select
  using (
    member_id = auth.uid()
    and exists (
      select 1 from coach_assigned_workouts w
      where w.id = assigned_workout_id and w.published_at is not null
    )
  );

create policy coach_read_assigned_assigned_workout_exercises on coach_assigned_workout_exercises
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_insert_assigned_assigned_workout_exercises on coach_assigned_workout_exercises
  for insert
  with check (
    coach_id = auth.uid()
    and public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

-- Member-only update, and only the completion-state columns are ever sent
-- by the app layer — no coach UPDATE policy exists on this table at all,
-- so a prescription can never be altered post-assignment by anyone short
-- of platform_administrator.
create policy member_update_own_assigned_workout_exercises on coach_assigned_workout_exercises
  for update
  using (
    member_id = auth.uid()
    and exists (
      select 1 from coach_assigned_workouts w
      where w.id = assigned_workout_id and w.published_at is not null
    )
  );

create policy platform_admin_all_assigned_workout_exercises on coach_assigned_workout_exercises
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
