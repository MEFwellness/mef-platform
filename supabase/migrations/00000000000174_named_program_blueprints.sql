-- Named programs: blueprints and slots.
--
-- A corrective program is GENERATED for one member from her own findings.
-- A named program is AUTHORED once by MEF and given to many members. Both
-- have to arrive at the same place: coach_program_templates, then
-- coach_program_assignments, then the frozen coach_assigned_workouts a
-- member actually opens. This migration builds the authored side of that,
-- and nothing else. It does not build a picker, a program collection, a
-- swap, an explanation or a readiness variant, and it changes nothing a
-- member can see.
--
-- ============================================================================
-- WHY movement_programs / movement_program_versions ARE ACTIVATED, NOT
-- REPLACED.
-- ============================================================================
-- Migration 80 created that pair empty and reserved it, in its own header,
-- for exactly this concept: "future Program versioning (e.g. 'Low Back
-- Recovery v1', 'Low Back Recovery v2')". Migration 82 then read that
-- reservation and deliberately declined to take the tables for the
-- coach-per-client template concept, adding coach_program_templates
-- instead. Two migrations have therefore already agreed on what this pair
-- is for, and this is that thing: a named, versioned, MEF-authored program.
--
-- Creating a third pair of tables here would leave the reserved one empty
-- forever and make the schema say the reservation was wrong. Both tables
-- are empty (asserted below, so this is a checked fact and not a hope), so
-- activating them costs no migration of existing rows and breaks no reader:
-- nothing in application code selects from either one today.
--
-- What activation means concretely:
--   * movement_programs keeps its identity role. One row per named program,
--     keyed by a stable text key, never versioned, never edited by content.
--   * movement_program_versions becomes the blueprint itself. Every field a
--     coach or a member would read about the program lives on the VERSION,
--     because editing an approved blueprint has to produce a new version
--     rather than mutate the one somebody was already assigned from.
--   * its status vocabulary changes from draft/published/archived to
--     draft/approved/archived. 'approved' is the honest word here: a
--     blueprint is not published to anybody, it becomes assignable. The
--     tables are empty so no row is reinterpreted by the change.
--
-- ============================================================================
-- OWNERSHIP. MEF owns blueprints, not coaches, and not members.
-- ============================================================================
-- Migration 80 gave both tables `authenticated_read`, which would have let
-- every signed-in member read the coach-facing purpose, the intended
-- population and the cautions text the moment content existed. That is the
-- same leak migration 170 closed on exercise_catalog and
-- mef_exercise_metadata, and it is closed here the same way and before
-- there is anything to leak: staff read, admin write, and NO member policy
-- on any blueprint or slot table.
--
-- A member's access to a named program is identical to her access to a
-- corrective one: she reads the frozen coach_assigned_workouts rows an
-- assignment materialized for her, and nothing upstream of them. The
-- prescription_* tables (migration 83) have the same posture and for the
-- same reason.
--
-- ============================================================================
-- THE SLOT TABLE.
-- ============================================================================
-- program_blueprint_slots follows movement_session_template_slots
-- (migration 153) rather than inventing a shape: a parent row plus ordered
-- child slots, each keyed to an exercise by the natural (provider,
-- external_id) pair every exercise-referencing table in this schema uses,
-- never by the catalog's surrogate id. It carries more per slot than
-- migration 153 does, because a named program has to survive a member
-- swapping an exercise out and a shortened session being cut from it, and
-- both of those need to know what the slot was FOR.
--
-- Two rules are worth stating plainly:
--
--   Every filled slot points at a client-assignable exercise. That is
--   migration 170's one rule, unchanged: a member may only be given an
--   exercise she can be shown how to do. Asserted at the bottom of this
--   migration in migration 153's style, and asserted again by a test so a
--   slot added later cannot break it quietly.
--
--   Every slot carries a priority rank from day one, unique within its
--   session and contiguous from 1. Readiness variants are a later prompt,
--   but "give her the top five slots today" has to be answerable from the
--   data the moment the data exists, or the ranks get invented later and
--   are arbitrary.
--
-- ============================================================================
-- PER-WEEK PROGRESSION.
-- ============================================================================
-- The corrective engine repeats one weekly session identically for four
-- weeks. An authored program usually does not: week 3 adds a set. Three
-- additive columns carry that from the blueprint to the member's frozen
-- snapshot:
--
--   program_blueprint_slots.week_overrides         what changes, and when
--   coach_program_template_exercises.week_overrides  the same plan, on the
--                                                    template the
--                                                    materializer writes
--   coach_assigned_workouts.program_week           which week an occurrence
--                                                    belongs to
--
-- The override is RESOLVED at assignment time, not at read time: week 3's
-- frozen exercise row says sets = 4, it does not say "sets = 3, see the
-- override". A frozen snapshot that needs a second table consulted to know
-- what it prescribed is not frozen. Corrective programs write an empty
-- object here and behave exactly as they do today.

-- ============================================================================
-- 0) The reservation is still empty. Assert it before taking it.
-- ============================================================================
do $$
declare
  v_programs integer;
  v_versions integer;
begin
  select count(*) into v_programs from movement_programs;
  select count(*) into v_versions from movement_program_versions;
  if v_programs > 0 or v_versions > 0 then
    raise exception
      'movement_programs/_versions are not empty (% and % rows). Migration 80 reserved them as an empty foundation and this migration activates that reservation; content already there means somebody used them for something else and this migration must be rewritten rather than run.',
      v_programs, v_versions;
  end if;
end
$$;

-- ============================================================================
-- 1) movement_programs — identity only.
-- ============================================================================
alter table movement_programs
  add column internal_name text,
  add column created_by uuid references auth.users(id),
  add column updated_at timestamptz not null default now();

-- display_name has been the identity label since migration 80 and stays
-- one. internal_name is the coach-facing shelf label where they differ.
comment on table movement_programs is
  'One named, MEF-authored program. Identity only: the key never changes and the content lives on movement_program_versions, so editing a program never edits what somebody was already assigned.';
comment on column movement_programs.key is
  'Stable identity, e.g. home_dumbbell_foundation. Never versioned, never renamed.';

-- ============================================================================
-- 2) movement_program_versions — the blueprint.
-- ============================================================================
alter table movement_program_versions
  -- What a member reads. Authored, never mapped from anything internal.
  add column member_title text,
  add column member_description text,
  -- What a coach reads. Never rendered to a member by any code path.
  add column coach_purpose text,
  add column intended_population text,
  add column cautions text,
  -- The shape of the program.
  add column duration_weeks int,
  add column sessions_per_week int,
  add column equipment_mode text,
  add column created_by uuid references auth.users(id),
  add column updated_by uuid references auth.users(id),
  add column approved_at timestamptz,
  add column approved_by uuid references auth.users(id),
  add column archived_at timestamptz;

alter table movement_program_versions
  add constraint movement_program_versions_duration_weeks_check
    check (duration_weeks is null or duration_weeks between 1 and 52);

alter table movement_program_versions
  add constraint movement_program_versions_sessions_per_week_check
    check (sessions_per_week is null or sessions_per_week between 1 and 7);

alter table movement_program_versions
  add constraint movement_program_versions_equipment_mode_check
    check (equipment_mode is null or equipment_mode in ('home', 'gym', 'mixed'));

alter table movement_program_versions
  add constraint movement_program_versions_version_number_check
    check (version_number >= 1);

-- draft -> approved -> archived. 'published' is dropped rather than kept
-- as a synonym: a blueprint is never published to anybody, and two words
-- for one state is how a status vocabulary rots. Safe because the table is
-- empty (asserted in section 0).
alter table movement_program_versions
  drop constraint movement_program_versions_status_check;

alter table movement_program_versions
  add constraint movement_program_versions_status_check
    check (status in ('draft', 'approved', 'archived'));

-- Only an approved version may ever be assigned, and approval has to be
-- attributable: who approved it and when are not optional once it is.
alter table movement_program_versions
  add constraint movement_program_versions_approval_check
    check (
      status <> 'approved'
      or (approved_at is not null and approved_by is not null)
    );

create index movement_program_versions_status_idx
  on movement_program_versions (status);

comment on table movement_program_versions is
  'One version of a named program: everything a coach or a member reads about it. Editing an approved version creates the next version rather than changing this one, so an assignment can always point at exactly the content it was made from.';
comment on column movement_program_versions.member_title is
  'The title a member reads. Authored here, never derived from a finding or a pattern name.';
comment on column movement_program_versions.member_description is
  'The description a member reads. Authored here. Plain language, no clinical vocabulary, no em dashes.';
comment on column movement_program_versions.coach_purpose is
  'Why this program exists, for a coach. Never rendered to a member by any code path.';
comment on column movement_program_versions.cautions is
  'Contraindications and cautions, for a coach. Never rendered to a member by any code path.';

-- ============================================================================
-- 3) Ownership: staff read, admin write. No member policy anywhere.
-- ============================================================================
drop policy authenticated_read_movement_programs on movement_programs;
drop policy authenticated_read_movement_program_versions on movement_program_versions;

create policy staff_read_movement_programs on movement_programs
  for select
  using (
    (select public.has_active_role(auth.uid(), 'coach'))
    or (select public.has_active_role(auth.uid(), 'platform_administrator'))
  );

create policy staff_read_movement_program_versions on movement_program_versions
  for select
  using (
    (select public.has_active_role(auth.uid(), 'coach'))
    or (select public.has_active_role(auth.uid(), 'platform_administrator'))
  );

-- Writes stay with platform_admin_all_* (migration 80), which is the only
-- write policy on either table. A coach reads blueprints and assigns from
-- them; a coach does not author them.

-- ============================================================================
-- 4) program_blueprint_slots.
-- ============================================================================
create table program_blueprint_slots (
  id uuid primary key default gen_random_uuid(),

  program_version_id uuid not null
    references movement_program_versions(id) on delete cascade,

  -- Which weekly session this slot belongs to. A single capital letter,
  -- the same A/B/C the corrective engine labels its weekly sessions with.
  session_designation text not null check (session_designation ~ '^[A-Z]$'),

  -- 1-based, contiguous, unique within a session. The MEF sequence lives
  -- in this ordering, which is why it is explicit data (migration 153).
  slot_order int not null check (slot_order > 0),

  -- The MEF session vocabulary the corrective engine already uses
  -- (lib/corrective-engine/types.ts SessionBlockType), so one program
  -- sequence exists in this system rather than two. The member-facing
  -- section labels these map to (Preparation, Mobility, Activation,
  -- Strength, Core) live in the materializer, next to the section_type
  -- mapping that has always lived in app code.
  block text not null check (block in ('release', 'mobility', 'stability', 'strength', 'core')),

  movement_pattern text,
  -- Coach-facing. Deliberately NOT written into selection_reasoning, which
  -- is member-visible once a workout is published (migration 82).
  purpose text,

  -- 1 = most important. Unique within a session and contiguous from 1, so
  -- "the top N slots" is always a well defined, sensible short session.
  priority_rank int not null check (priority_rank > 0),
  is_required boolean not null default true,

  equipment_requirement text[] not null default '{}',
  difficulty_tier text check (difficulty_tier in ('beginner', 'intermediate', 'advanced')),

  -- Reserved shape for readiness and eligibility work in a later prompt.
  -- Empty today on every slot, and nothing reads it yet.
  eligibility_rules jsonb not null default '{}'::jsonb,

  -- Whether a member may swap this slot. Locked slots are the ones that
  -- make the program the program. Swaps themselves are a later prompt.
  is_locked boolean not null default false,
  replacement_criteria jsonb not null default '{}'::jsonb,

  -- The prescription. Null means "no opinion, let the dosing defaults
  -- fill it", which is exactly how the corrective path treats a field it
  -- has no opinion about.
  sets int check (sets is null or sets > 0),
  reps int check (reps is null or reps > 0),
  hold_duration_seconds int check (hold_duration_seconds is null or hold_duration_seconds > 0),
  tempo text,
  rest_seconds int check (rest_seconds is null or rest_seconds >= 0),

  -- {"3": {"sets": 4}} — what changes in which scheduled week. Resolved
  -- into the frozen snapshot at assignment time; see this file's header.
  week_overrides jsonb not null default '{}'::jsonb
    check (jsonb_typeof(week_overrides) = 'object'),

  -- The filled exercise. Null while a slot is authored but not yet filled;
  -- a filled slot must carry all three and must be client-assignable.
  provider text check (provider is null or provider = 'your_move'),
  external_id text,
  exercise_name text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (program_version_id, session_designation, slot_order),
  unique (program_version_id, session_designation, priority_rank),

  constraint program_blueprint_slots_fill_check check (
    (provider is null and external_id is null and exercise_name is null)
    or (provider is not null and external_id is not null and exercise_name is not null)
  )
);

create index program_blueprint_slots_version_idx
  on program_blueprint_slots (program_version_id, session_designation, slot_order);

create index program_blueprint_slots_priority_idx
  on program_blueprint_slots (program_version_id, session_designation, priority_rank);

create index program_blueprint_slots_exercise_idx
  on program_blueprint_slots (provider, external_id);

alter table program_blueprint_slots enable row level security;

create policy staff_read_program_blueprint_slots on program_blueprint_slots
  for select
  using (
    (select public.has_active_role(auth.uid(), 'coach'))
    or (select public.has_active_role(auth.uid(), 'platform_administrator'))
  );

create policy platform_admin_all_program_blueprint_slots on program_blueprint_slots
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

comment on table program_blueprint_slots is
  'The ordered slots of one blueprint version, one row per exercise per weekly session. Same parent-plus-ordered-slots shape and same natural (provider, external_id) exercise key as movement_session_template_slots. No member policy: a member reads what an assignment materialized for her, never the blueprint it came from.';
comment on column program_blueprint_slots.priority_rank is
  '1 = most important. Unique and contiguous within a session, so the highest ranked N slots are always a sensible shortened session.';
comment on column program_blueprint_slots.week_overrides is
  'Per scheduled week prescription changes, e.g. {"3": {"sets": 4}}. Resolved into the frozen snapshot at assignment time, never consulted at read time.';

-- ============================================================================
-- 5) Where an assignment records the blueprint version it came from.
-- ============================================================================
-- Lineage only, same posture as template_id and
-- source_prescription_snapshot_id: on delete set null, never read to
-- render a workout.
alter table coach_program_assignments
  add column source_blueprint_version_id uuid
    references movement_program_versions(id) on delete set null;

create index coach_program_assignments_blueprint_idx
  on coach_program_assignments (source_blueprint_version_id);

comment on column coach_program_assignments.source_blueprint_version_id is
  'Which blueprint version this program was materialized from. Lineage only: never read to render a workout, and losing the blueprint never erases the assignment.';

-- ============================================================================
-- 6) The per-week plan on the template, and the week on the occurrence.
-- ============================================================================
alter table coach_program_template_exercises
  add column week_overrides jsonb not null default '{}'::jsonb
    check (jsonb_typeof(week_overrides) = 'object');

comment on column coach_program_template_exercises.week_overrides is
  'Per scheduled week prescription changes carried from a blueprint slot, e.g. {"3": {"sets": 4}}. Empty for everything the corrective engine and the builder UI write, which is why their behaviour is unchanged.';

alter table coach_assigned_workouts
  add column program_week int check (program_week is null or program_week >= 1);

comment on column coach_assigned_workouts.program_week is
  'Which week of the program this occurrence belongs to, counted from the assignment start date. Written once at assignment time, alongside the resolved per-week prescription, so a frozen snapshot never has to be re-derived to be read.';

-- ============================================================================
-- 7) Seed: Home Dumbbell Foundation, version 1, DRAFT.
--
-- A draft on purpose. Nothing may be assigned from it until a human
-- approves it in the coach tooling, which is a later prompt. It exists here
-- to prove the pipeline end to end with real, video-backed, client-
-- assignable exercises rather than with fixtures.
--
-- Slots are joined to exercise_catalog BY NAME rather than by pasting
-- external ids into this file, and the join is asserted to have matched
-- every row. A missing or renamed exercise therefore fails the migration
-- loudly in whichever environment it is missing from, instead of seeding a
-- blueprint with a hole in it.
-- ============================================================================
insert into movement_programs (key, display_name, internal_name)
values (
  'home_dumbbell_foundation',
  'Home Dumbbell Foundation',
  'Home Dumbbell Foundation (general strength base, dumbbells only)'
);

insert into movement_program_versions (
  program_id, version_number, display_name, status, notes,
  member_title, member_description,
  coach_purpose, intended_population, cautions,
  duration_weeks, sessions_per_week, equipment_mode
)
select
  p.id,
  1,
  'Home Dumbbell Foundation v1',
  'draft',
  'Proof of concept blueprint for the named program pipeline. Authored as a draft for coach review.',
  'Home Dumbbell Foundation',
  'A four week strength program you can do at home with a pair of dumbbells. Three sessions a week, each one starts with a short warm up and finishes with core work. In week 3 the main lift of each session gains one set.',
  'A general strength base for a member training at home with dumbbells, built on the MEF session sequence. Session A is squat led, Session B is upper body push and pull, Session C is posterior chain, carry and single side work.',
  'General beginner to intermediate adults, no acute pain, no current corrective priority. Where a posture finding is driving the plan, the corrective program comes first and this is not a substitute for it.',
  'Reduce or skip anything that causes pain. Review before assigning to anyone with current low back, knee or shoulder pain. Several slots are floor based, so the member needs to be able to get down to and up from the floor unaided. Loads are not prescribed: the coach sets them at the first session.',
  4, 3, 'home'
from movement_programs p
where p.key = 'home_dumbbell_foundation';

-- The slots. One VALUES row per slot, joined to the catalog by exercise
-- name. Columns, in order:
--   session, slot_order, block, exercise name, movement pattern, purpose,
--   priority rank, required, equipment, difficulty, locked,
--   sets, reps, hold seconds, tempo, rest seconds, week overrides
with version as (
  select v.id
  from movement_program_versions v
  join movement_programs p on p.id = v.program_id
  where p.key = 'home_dumbbell_foundation' and v.version_number = 1
),
slot_spec (
  session_designation, slot_order, block, exercise_name, movement_pattern, purpose,
  priority_rank, is_required, equipment_requirement, difficulty_tier, is_locked,
  sets, reps, hold_duration_seconds, tempo, rest_seconds, week_overrides
) as (
  values
  -- ---------------------------------------------------------------- A
  ('A', 1, 'release',   'Cat cow pose',              'spinal',     'Wake the spine up before loading it. General preparation, low effort on purpose.',
      6, false, '{}'::text[],           'beginner',     false, 1, null, 60, null, 15, '{}'::jsonb),
  ('A', 2, 'mobility',  'Hip flexor stretch',        'hip_flexion','Length at the front of the hip so the squat and the lunge can reach depth without the low back taking it.',
      5, true,  '{}'::text[],           'beginner',     false, 2, null, 30, null, 15, '{}'::jsonb),
  ('A', 3, 'mobility',  'Standing forward bend',     'hip_hinge',  'Posterior chain length before the squat pattern.',
      8, false, '{}'::text[],           'beginner',     false, 2, null, 30, null, 15, '{}'::jsonb),
  ('A', 4, 'stability', 'Glute Bridge (Bodyweight)', 'hip_hinge',  'Glute activation before the main lift, so the squat is not driven by the quads alone.',
      2, true,  '{}'::text[],           'beginner',     false, 2, 12,   null, '3-1-3', 30, '{}'::jsonb),
  ('A', 5, 'stability', 'Fire Hydrant Circles',      'hip_rotation','Hip abduction and rotation control. Cheap to do, and it sets the knee tracking for the lunge.',
      7, false, '{}'::text[],           'beginner',     false, 2, 10,   null, '2-0-2', 30, '{}'::jsonb),
  ('A', 6, 'strength',  'Dumbbell Goblet Squat',     'squat',      'The main lift of Session A. Front loaded so the torso stays upright, which is the point at this level.',
      1, true,  '{dumbbell}'::text[],   'beginner',     true,  3, 10,   null, '2-0-2', 75, '{"3": {"sets": 4}}'::jsonb),
  ('A', 7, 'strength',  'Dumbbell Rear Lunge',       'lunge',      'Single side strength. Rear stepping rather than forward, which is easier on the knee for most people starting out.',
      3, true,  '{dumbbell}'::text[],   'intermediate', true,  2, 8,    null, '2-0-2', 60, '{}'::jsonb),
  ('A', 8, 'core',      'Plank',                     'anti_extension','Hold the trunk still under fatigue. Timed, never a crunch.',
      4, true,  '{}'::text[],           'beginner',     false, 2, null, 30, null, 30, '{"3": {"hold_duration_seconds": 40}}'::jsonb),

  -- ---------------------------------------------------------------- B
  ('B', 1, 'release',   'Arm swings',                'shoulder',   'Get blood into the shoulders before they are loaded. General preparation.',
      8, false, '{}'::text[],           'beginner',     false, 1, null, 60, null, 15, '{}'::jsonb),
  ('B', 2, 'mobility',  'Straight arm circles',      'shoulder',   'Shoulder range through a full circle before pressing.',
      7, false, '{}'::text[],           'beginner',     false, 2, null, 30, null, 15, '{}'::jsonb),
  ('B', 3, 'mobility',  'Puppy pose',                'thoracic',   'Upper back and lat length so the press does not come from the low back.',
      9, false, '{}'::text[],           'beginner',     false, 2, null, 30, null, 15, '{}'::jsonb),
  ('B', 4, 'stability', 'Prone W to lifts',          'scapular',   'Mid back activation before the pull, so the row is not all biceps.',
      3, true,  '{}'::text[],           'beginner',     false, 2, 10,   null, '3-1-3', 30, '{}'::jsonb),
  ('B', 5, 'strength',  'Dumbbell floor chest press','horizontal_push','The main lift of Session B. Floor press rather than bench: no bench needed, and the floor limits the range for a beginner shoulder.',
      1, true,  '{dumbbell}'::text[],   'intermediate', true,  3, 10,   null, '2-0-2', 75, '{"3": {"sets": 4}}'::jsonb),
  ('B', 6, 'strength',  'Single Arm Dumbbell Row',   'horizontal_pull','Pull volume to match the press. One side at a time so the stronger side cannot carry the weaker.',
      2, true,  '{dumbbell}'::text[],   'beginner',     true,  3, 10,   null, '2-0-2', 60, '{}'::jsonb),
  ('B', 7, 'strength',  'Dumbbell Shoulder Press',   'vertical_push','Overhead strength, kept to two sets because it is the most demanding position on the list.',
      4, true,  '{dumbbell}'::text[],   'beginner',     false, 2, 10,   null, '2-0-2', 60, '{}'::jsonb),
  ('B', 8, 'core',      'Dead Bug',                  'anti_extension','Trunk control with the arms and legs moving. Slow on purpose.',
      5, true,  '{}'::text[],           'beginner',     false, 2, 8,    null, '3-1-3', 30, '{}'::jsonb),
  ('B', 9, 'core',      'Side Plank',                'anti_lateral_flexion','Side of the trunk under load. Short holds, both sides.',
      6, false, '{}'::text[],           'intermediate', false, 2, null, 20, null, 30, '{"3": {"hold_duration_seconds": 30}}'::jsonb),

  -- ---------------------------------------------------------------- C
  ('C', 1, 'release',   'Cat cow pose',              'spinal',     'Same opener as Session A. Familiar on purpose.',
      8, false, '{}'::text[],           'beginner',     false, 1, null, 60, null, 15, '{}'::jsonb),
  ('C', 2, 'mobility',  'Standing forward bend',     'hip_hinge',  'Hamstring length before the hinge.',
      7, false, '{}'::text[],           'beginner',     false, 2, null, 30, null, 15, '{}'::jsonb),
  ('C', 3, 'mobility',  'Child''s pose',             'thoracic',   'Settle the hips and the upper back before the working sets.',
      9, false, '{}'::text[],           'beginner',     false, 2, null, 30, null, 15, '{}'::jsonb),
  ('C', 4, 'stability', 'Bird Dog',                  'anti_rotation','Trunk still while opposite limbs move. The rehearsal for holding position under the hinge.',
      2, true,  '{}'::text[],           'beginner',     false, 2, 10,   null, '3-1-3', 30, '{}'::jsonb),
  ('C', 5, 'stability', 'Glute Bridge (Bodyweight)', 'hip_hinge',  'Glute activation before the hinge, same reason as Session A.',
      6, false, '{}'::text[],           'beginner',     false, 2, 12,   null, '3-1-3', 30, '{}'::jsonb),
  ('C', 6, 'strength',  'Dumbbell Romanian Deadlift','hip_hinge',  'The main lift of Session C. Hinge with a soft knee, held short of the point where the back rounds.',
      1, true,  '{dumbbell}'::text[],   'intermediate', true,  3, 8,    null, '2-0-2', 75, '{"3": {"sets": 4}}'::jsonb),
  ('C', 7, 'strength',  'Single Arm Dumbbell Row',   'horizontal_pull','Second pull session of the week. Deliberately the same movement as Session B so it gets practised twice.',
      3, true,  '{dumbbell}'::text[],   'beginner',     true,  3, 10,   null, '2-0-2', 60, '{}'::jsonb),
  ('C', 8, 'strength',  'Farmers walk',              'carry',      'Loaded carry. Grip, trunk and posture all at once, and almost impossible to do badly.',
      4, true,  '{dumbbell}'::text[],   'intermediate', false, 3, null, 30, null, 60, '{}'::jsonb),
  ('C', 9, 'core',      'Reverse Plank',             'anti_flexion','Back of the body under a hold, to balance the front loaded core work in Sessions A and B.',
      5, true,  '{}'::text[],           'beginner',     false, 2, null, 20, null, 30, '{"3": {"hold_duration_seconds": 30}}'::jsonb)
)
insert into program_blueprint_slots (
  program_version_id, session_designation, slot_order, block,
  movement_pattern, purpose, priority_rank, is_required,
  equipment_requirement, difficulty_tier, is_locked,
  sets, reps, hold_duration_seconds, tempo, rest_seconds, week_overrides,
  provider, external_id, exercise_name
)
select
  (select id from version),
  s.session_designation, s.slot_order, s.block,
  s.movement_pattern, s.purpose, s.priority_rank, s.is_required,
  s.equipment_requirement, s.difficulty_tier, s.is_locked,
  s.sets, s.reps, s.hold_duration_seconds, s.tempo, s.rest_seconds, s.week_overrides,
  c.provider, c.external_id, c.name
from slot_spec s
join exercise_catalog c on c.name = s.exercise_name;

-- ============================================================================
-- 8) Assertions (style: migration 153).
-- ============================================================================
do $$
declare
  v_version_id     uuid;
  v_slots          integer;
  v_unfilled       integer;
  v_unassignable   integer;
  v_bad_ranks      integer;
  v_bad_weeks      integer;
  v_sessions       integer;
  v_row            record;
begin
  select v.id into v_version_id
  from movement_program_versions v
  join movement_programs p on p.id = v.program_id
  where p.key = 'home_dumbbell_foundation' and v.version_number = 1;

  if v_version_id is null then
    raise exception 'seed blueprint: Home Dumbbell Foundation v1 was not created';
  end if;

  -- Every slot in the spec matched a catalog exercise by name.
  select count(*) into v_slots
  from program_blueprint_slots where program_version_id = v_version_id;
  if v_slots <> 26 then
    raise exception
      'seed blueprint: expected 26 slots, found %. An exercise name in the seed did not match exercise_catalog, so the join silently dropped it.',
      v_slots;
  end if;

  select count(distinct session_designation) into v_sessions
  from program_blueprint_slots where program_version_id = v_version_id;
  if v_sessions <> 3 then
    raise exception 'seed blueprint: expected 3 weekly sessions, found %', v_sessions;
  end if;

  -- THE ONE RULE (migration 170): a filled slot points at an exercise a
  -- member can be shown how to do. Applied to every blueprint slot in the
  -- table, not only the seed's, so this migration also stands as the first
  -- proof for anything seeded after it.
  select count(*) into v_unfilled
  from program_blueprint_slots where external_id is null;
  if v_unfilled > 0 then
    raise notice 'blueprint slots: % slot(s) are authored but not yet filled', v_unfilled;
  end if;

  select count(*) into v_unassignable
  from program_blueprint_slots s
  left join exercise_catalog c
    on c.provider = s.provider and c.external_id = s.external_id
  where s.external_id is not null
    and (c.id is null or c.is_client_assignable = false);

  if v_unassignable > 0 then
    for v_row in
      select s.session_designation, s.slot_order, s.exercise_name, s.external_id,
             case when c.id is null then 'not in catalog' else 'no video' end as reason
      from program_blueprint_slots s
      left join exercise_catalog c
        on c.provider = s.provider and c.external_id = s.external_id
      where s.external_id is not null
        and (c.id is null or c.is_client_assignable = false)
    loop
      raise notice '  session % slot % | % (%) | %',
        v_row.session_designation, v_row.slot_order, v_row.exercise_name,
        v_row.external_id, v_row.reason;
    end loop;
    raise exception
      'blueprint slots: % filled slot(s) point at a non client-assignable exercise. A member may only be given an exercise she can be shown how to do (migration 170).',
      v_unassignable;
  end if;

  -- Priority ranks are contiguous from 1 within each session, which is
  -- what makes "the top N slots" a sensible shortened session rather than
  -- an arbitrary subset.
  select count(*) into v_bad_ranks
  from (
    select session_designation
    from program_blueprint_slots
    where program_version_id = v_version_id
    group by session_designation
    having max(priority_rank) <> count(*) or min(priority_rank) <> 1
  ) bad;
  if v_bad_ranks > 0 then
    raise exception
      'seed blueprint: % session(s) have priority ranks that are not contiguous from 1', v_bad_ranks;
  end if;

  -- Every per-week override key is a week that exists in this program.
  select count(*) into v_bad_weeks
  from program_blueprint_slots s
  join movement_program_versions v on v.id = s.program_version_id
  cross join lateral jsonb_object_keys(s.week_overrides) as k(week)
  where k.week !~ '^[0-9]+$'
     or k.week::int < 1
     or k.week::int > coalesce(v.duration_weeks, 0);
  if v_bad_weeks > 0 then
    raise exception
      'blueprint slots: % per-week override(s) name a week outside the program''s own duration', v_bad_weeks;
  end if;

  raise notice 'seed blueprint: Home Dumbbell Foundation v1 seeded as DRAFT with % slots across % sessions, every filled slot client-assignable',
    v_slots, v_sessions;
end
$$;
