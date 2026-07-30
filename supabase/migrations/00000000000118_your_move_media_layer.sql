-- Your Move video layer for the Exercise Library.
--
-- ExerciseAPI.dev (migration 80) stays the catalog source for every
-- exercise's name/instructions/muscles/etc. This migration only adds the
-- media layer that sits on top of it, same non-owning relationship
-- mef_exercise_metadata already has to the vendor: no foreign key into a
-- local exercise table, natural key is (provider, external_id).
--
--   your_move_exercise_links   One row per exercise where Your Move's
--                                catalog has a confident match (dominance
--                                rule: Your Move's video wins over
--                                ExerciseAPI.dev's whenever both exist).
--                                Stores ONLY the Your Move exercise id —
--                                never a video URL long-term, per Your
--                                Move's 48h pre-signed-URL terms. video_url/
--                                video_url_expires_at are a short-lived
--                                fetch-at-play-time cache (~10min), not
--                                storage of the vendor's content; a row
--                                whose cache has expired is treated as
--                                empty and re-fetched from Your Move at
--                                next play.
--                                This table IS the purge manifest for the
--                                mapping itself: deleting every row removes
--                                the our-id -> Your Move-id link entirely.
--                                Extracted posters are tracked separately
--                                (exercise_extracted_posters below) since
--                                current-API videos get frame-extracted
--                                too, and only the your_move-sourced ones
--                                need to be part of the purge.
--
--   exercise_extracted_posters   A mid-movement frame WE extracted from a
--                                video and store in our own Supabase
--                                storage — for BOTH sources, since neither
--                                vendor gives a stable, permanent thumbnail
--                                (Your Move's own thumbnailUrl expires on
--                                the same 48h cycle as its video;
--                                ExerciseAPI.dev's images field is a dead
--                                link, see normalize.ts). source records
--                                which video it came from, so the purge
--                                script can remove only the your_move rows
--                                (+ their storage objects) and leave
--                                exercise_api_dev-derived posters alone.
--
--   exercise_open_license_images   Phase 3 fallback images sourced from
--                                free open-license providers (Wikimedia
--                                Commons, Pexels, Unsplash, etc.) for
--                                exercises neither content source has
--                                video for. Doubles as the license
--                                manifest — source_url + license_type +
--                                attribution recorded per image, since
--                                commercial-use license terms must be
--                                provable per asset, not asserted in bulk.
--
-- RLS follows the same pattern as mef_exercise_metadata (migration 80):
-- shared reference tables, readable by every signed-in member (they power
-- the library everyone browses), writable only by coach/platform_admin.
-- Nothing here is member-owned, so there is no member_id column or
-- member-scoped policy.

-- ============================================================================
-- your_move_exercise_links
-- ============================================================================
create table your_move_exercise_links (
  id uuid primary key default gen_random_uuid(),

  -- The MEF-side exercise this row attaches media to. Always
  -- 'exercise_api_dev' today (the only current-catalog provider) — a
  -- column rather than a hardcoded assumption so a future catalog source
  -- doesn't require a schema change here.
  provider text not null default 'exercise_api_dev',
  external_id text not null,

  your_move_exercise_id text not null,

  match_confidence text not null default 'confident' check (
    match_confidence in ('confident')
  ),
  match_reasoning text,

  -- Short-lived fetch-at-play-time cache, well under Your Move's 48h
  -- pre-signed URL expiry — this is a dedupe optimization against
  -- double-billing rapid replays, never long-term storage of the URL
  -- itself. A null/expired value means "fetch fresh from Your Move on
  -- next play", the normal, expected state.
  video_url text,
  video_url_expires_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (provider, external_id)
);

create index your_move_exercise_links_your_move_id_idx
  on your_move_exercise_links (your_move_exercise_id);

alter table your_move_exercise_links enable row level security;

create policy authenticated_read_your_move_exercise_links on your_move_exercise_links
  for select
  using (auth.role() = 'authenticated');

create policy coach_insert_your_move_exercise_links on your_move_exercise_links
  for insert
  with check (public.has_active_role(auth.uid(), 'coach'));

create policy coach_update_your_move_exercise_links on your_move_exercise_links
  for update
  using (public.has_active_role(auth.uid(), 'coach'));

create policy coach_delete_your_move_exercise_links on your_move_exercise_links
  for delete
  using (public.has_active_role(auth.uid(), 'coach'));

create policy platform_admin_all_your_move_exercise_links on your_move_exercise_links
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================================
-- exercise_extracted_posters
-- ============================================================================
create table exercise_extracted_posters (
  id uuid primary key default gen_random_uuid(),

  provider text not null default 'exercise_api_dev',
  external_id text not null,

  -- Which video this frame was extracted from — determines whether this
  -- row belongs in the Your Move purge manifest (source = 'your_move') or
  -- not (source = 'exercise_api_dev', that vendor's video is unaffected by
  -- a Your Move cancellation).
  source text not null check (source in ('your_move', 'exercise_api_dev')),

  storage_path text not null,

  created_at timestamptz not null default now(),

  unique (provider, external_id)
);

create index exercise_extracted_posters_source_idx on exercise_extracted_posters (source);

alter table exercise_extracted_posters enable row level security;

create policy authenticated_read_exercise_extracted_posters on exercise_extracted_posters
  for select
  using (auth.role() = 'authenticated');

create policy coach_insert_exercise_extracted_posters on exercise_extracted_posters
  for insert
  with check (public.has_active_role(auth.uid(), 'coach'));

create policy coach_update_exercise_extracted_posters on exercise_extracted_posters
  for update
  using (public.has_active_role(auth.uid(), 'coach'));

create policy coach_delete_exercise_extracted_posters on exercise_extracted_posters
  for delete
  using (public.has_active_role(auth.uid(), 'coach'));

create policy platform_admin_all_exercise_extracted_posters on exercise_extracted_posters
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================================
-- exercise_open_license_images
-- ============================================================================
create table exercise_open_license_images (
  id uuid primary key default gen_random_uuid(),

  provider text not null default 'exercise_api_dev',
  external_id text not null,

  -- Our own storage path — images are downloaded and re-hosted, never
  -- hotlinked, per the Phase 3 requirement.
  storage_path text not null,

  source_url text not null,
  source_provider text not null check (
    source_provider in ('wikimedia_commons', 'pexels', 'unsplash', 'other_open_license')
  ),
  license_type text not null,
  attribution text,

  created_at timestamptz not null default now(),

  unique (provider, external_id)
);

alter table exercise_open_license_images enable row level security;

create policy authenticated_read_exercise_open_license_images on exercise_open_license_images
  for select
  using (auth.role() = 'authenticated');

create policy coach_insert_exercise_open_license_images on exercise_open_license_images
  for insert
  with check (public.has_active_role(auth.uid(), 'coach'));

create policy coach_update_exercise_open_license_images on exercise_open_license_images
  for update
  using (public.has_active_role(auth.uid(), 'coach'));

create policy coach_delete_exercise_open_license_images on exercise_open_license_images
  for delete
  using (public.has_active_role(auth.uid(), 'coach'));

create policy platform_admin_all_exercise_open_license_images on exercise_open_license_images
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================================
-- Storage bucket — public (unlike food-lens-media/body-assessment-media,
-- this is shared reference content every member views, not member-owned
-- private media), so cards/detail can render a plain public URL exactly
-- like they already do for ExerciseAPI.dev's own CDN images, no signed-URL
-- fetch required. Writes (populating extracted frames / sourced images)
-- happen via the offline build scripts using the service role key, which
-- bypasses these policies anyway; the coach/platform_admin policies below
-- exist for parity with every other table in this migration, not as the
-- primary write path.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('exercise-media', 'exercise-media', true);

create policy coach_manage_exercise_media on storage.objects
  for all using (
    bucket_id = 'exercise-media'
    and public.has_active_role(auth.uid(), 'coach')
  );
create policy platform_admin_all_exercise_media on storage.objects
  for all using (
    bucket_id = 'exercise-media'
    and public.has_active_role(auth.uid(), 'platform_administrator')
  );
