-- Your Move becomes the sole Exercise Library catalog source. Removes
-- ExerciseAPI.dev entirely (migration 80's original content-provider role)
-- and promotes migration 118's video-only layer into the full catalog:
-- name, instructions, muscles, equipment, category, difficulty all now
-- come from Your Move (exercise-api.ymove.app), stored locally rather than
-- fetched live per request (Your Move's monthly exercise quota makes a
-- live-fetch-per-browse architecture unworkable; browse mode itself is
-- quota-free, so the catalog is fetched once via scripts/exercise-media/
-- fetch-your-move-catalog.ts and re-fetched only to refresh).
--
--   exercise_catalog   The new, sole exercise catalog. One row per Your
--                       Move exercise (provider is always 'your_move' —
--                       kept as a column, not collapsed away, so every
--                       other exercise-referencing table's existing
--                       (provider, external_id) natural-key convention
--                       needs no shape change, only a new literal value).
--                       video_url/video_url_expires_at are the same
--                       short-lived (~10min) fetch-at-play-time cache
--                       your_move_exercise_links used to hold — folded in
--                       here since the mapping table it used to require is
--                       gone (the catalog row already IS the Your Move
--                       exercise, no separate our-id -> their-id link
--                       needed).
--
-- Dropped entirely:
--   your_move_exercise_links      superseded by exercise_catalog itself.
--   exercise_open_license_images  Phase 3 (Wikimedia fallback) is removed
--                                  — Your Move supplies video for 856/857
--                                  catalog exercises, and generated cues
--                                  (mef_exercise_metadata.coaching_cues)
--                                  cover the remainder plus any tap-to-play
--                                  failure, so the open-license-image
--                                  fallback tier has no remaining exercise
--                                  it would ever serve.
--
-- mef_exercise_metadata keeps its role (MEF curation layer + generated
-- coaching_cues) but its provider default moves to 'your_move'; every
-- existing row keyed to a since-removed 'exercise_api_dev' exercise is
-- either remapped (confident Your Move match, see docs/exercise-media/
-- match-report.json) or deleted by the data migration script — never a
-- schema-level concern, since this table holds no member data.
--
-- Every table that DOES hold member data (favorites, completions, recent
-- views, coach program templates/assignments, prescription blocks) keeps
-- every existing row untouched at the schema level. Two additions:
--   - `is_legacy boolean default false` — true means this row's exercise
--     reference has no confident Your Move match and is not resolvable in
--     the live catalog anymore; the row itself, and its exercise_name,
--     are never deleted (per "never delete member history").
--   - member_exercise_favorites gets `legacy_exercise_name text` too,
--     since it's the one member-data table with no exercise_name column at
--     all today (favorited exercises are normally re-hydrated live from
--     the catalog) — a legacy-flagged favorite has nothing left to
--     re-hydrate from, so its name is captured once, at migration time.
-- Data population for all of this happens in
-- scripts/exercise-media/migrate-legacy-exercise-references.ts, not here.

-- ============================================================================
-- exercise_catalog — the sole Exercise Library catalog (Your Move).
-- ============================================================================
create table exercise_catalog (
  id uuid primary key default gen_random_uuid(),

  provider text not null default 'your_move' check (provider = 'your_move'),
  external_id text not null,

  name text not null,
  slug text,
  description text,
  instructions text[] not null default '{}',
  exercise_tips text[] not null default '{}',

  primary_muscle text,
  secondary_muscles text[] not null default '{}',
  equipment text,
  category text,
  difficulty text check (difficulty in ('beginner', 'intermediate', 'advanced')),
  exercise_type text[] not null default '{}',

  has_video boolean not null default false,
  has_video_white boolean not null default false,
  has_video_gym boolean not null default false,

  -- Short-lived fetch-at-play-time cache (~10min), well under Your Move's
  -- 48h pre-signed-URL expiry — never long-term storage of the URL itself.
  -- A null/expired value means "fetch fresh from Your Move on next play."
  video_url text,
  video_url_expires_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (provider, external_id)
);

create index exercise_catalog_name_idx on exercise_catalog using gin (to_tsvector('english', name));
create index exercise_catalog_category_idx on exercise_catalog (category);
create index exercise_catalog_difficulty_idx on exercise_catalog (difficulty);
create index exercise_catalog_equipment_idx on exercise_catalog (equipment);
create index exercise_catalog_primary_muscle_idx on exercise_catalog (primary_muscle);
create index exercise_catalog_secondary_muscles_idx on exercise_catalog using gin (secondary_muscles);
create index exercise_catalog_has_video_idx on exercise_catalog (has_video);

alter table exercise_catalog enable row level security;

create policy authenticated_read_exercise_catalog on exercise_catalog
  for select
  using (auth.role() = 'authenticated');

create policy coach_insert_exercise_catalog on exercise_catalog
  for insert
  with check (public.has_active_role(auth.uid(), 'coach'));

create policy coach_update_exercise_catalog on exercise_catalog
  for update
  using (public.has_active_role(auth.uid(), 'coach'));

create policy coach_delete_exercise_catalog on exercise_catalog
  for delete
  using (public.has_active_role(auth.uid(), 'coach'));

create policy platform_admin_all_exercise_catalog on exercise_catalog
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================================
-- Drop the ExerciseAPI.dev-era Your Move mapping + Phase 3 image tables.
-- Their rows are pure media-build state, not member data (see header) —
-- the data migration script deletes/remaps referencing rows and the
-- exercise-media storage objects before this migration drops the tables.
-- ============================================================================
drop table if exists your_move_exercise_links;
drop table if exists exercise_open_license_images;

-- ============================================================================
-- mef_exercise_metadata / exercise_extracted_posters — same tables, new
-- default provider going forward (exercise_extracted_posters' own
-- `source` column already tracks your_move vs. exercise_api_dev
-- separately; provider here is just the natural-key convention, same as
-- everywhere else).
-- ============================================================================
alter table mef_exercise_metadata alter column provider set default 'your_move';
alter table exercise_extracted_posters alter column provider set default 'your_move';

-- ============================================================================
-- Member-data tables — add is_legacy (+ legacy_exercise_name where there is
-- no exercise_name column at all), change default provider going forward.
-- No existing row is touched here; the data migration script populates
-- these new columns.
-- ============================================================================
alter table member_exercise_favorites
  add column is_legacy boolean not null default false,
  add column legacy_exercise_name text,
  alter column provider set default 'your_move';

alter table member_exercise_completions
  add column is_legacy boolean not null default false,
  alter column provider set default 'your_move';

alter table member_exercise_recent_views
  add column is_legacy boolean not null default false,
  alter column provider set default 'your_move';

alter table coach_program_template_exercises
  add column is_legacy boolean not null default false,
  alter column provider set default 'your_move';

alter table coach_assigned_workout_exercises
  add column is_legacy boolean not null default false,
  alter column provider set default 'your_move';

alter table prescription_block_exercises
  add column is_legacy boolean not null default false,
  alter column provider set default 'your_move';
