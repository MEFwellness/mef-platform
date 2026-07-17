-- MEF Food Lens — meal-photo capture, AI food/macro-level identification,
-- and Primal Pattern comparison. Mirrors every convention body_assessment
-- (migration 37) established: snake_case feature-prefixed tables,
-- append-only/supersede-not-mutate for anything a correction can change,
-- confidence as a first-class column paired with a plain-language field,
-- deny-by-default RLS, a private per-member storage bucket. See
-- docs/food-lens/03-database-schema.md for the full design rationale this
-- migration implements.
--
-- One deliberate departure from that design doc, per the product decision
-- to use a hybrid approach: food_lens_pattern_comparisons.narrative is no
-- longer template-selected copy. It is generated dynamically by Root's
-- coaching brain from this scan's deterministic signals plus the member's
-- real history (lib/food-lens/coachingNarrative.ts) — the schema shape is
-- unchanged, only what populates `narrative` differs from the original doc.
--
-- primal_pattern_profiles also departs from doc 3.6's "no member write"
-- stance: doc 6 phase 1 explicitly calls for a member-facing manual-entry
-- placeholder (no Primal Pattern questionnaire exists in this codebase yet
-- — see docs/food-lens/05-primal-pattern-integration.md), so this migration
-- grants a narrow member insert/update policy. When the real questionnaire
-- scoring engine ships, it can keep writing through the same policy (it
-- runs under the member's own session same as any other member-authored
-- feature) or move to a service-role write — either is a policy change
-- here, not a schema change.

-- ============================================================================
-- primal_pattern_profiles
-- The target-consumption contract Food Lens needs from the (separate,
-- proprietary) Primal Pattern Diet engine. See docs/food-lens/05-primal-
-- pattern-integration.md.
-- ============================================================================
create table primal_pattern_profiles (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  pattern_label text not null,
  protein_emphasis text not null check (protein_emphasis in ('low', 'moderate', 'high')),
  carb_emphasis    text not null check (carb_emphasis    in ('low', 'moderate', 'high')),
  fat_emphasis     text not null check (fat_emphasis     in ('low', 'moderate', 'high')),

  source text not null default 'manual_entry_v1',
  is_active boolean not null default true,
  supersedes_id uuid references primal_pattern_profiles(id),

  created_at timestamptz not null default now()
);

create unique index primal_pattern_profiles_one_active_per_member
  on primal_pattern_profiles(member_id) where is_active;

alter table primal_pattern_profiles enable row level security;

create policy member_read_own_primal_pattern_profiles on primal_pattern_profiles
  for select using (member_id = auth.uid());
-- Phase 1 manual-entry placeholder (doc 6 phase 1) — narrow, member-authored
-- write of their own three ordinal emphasis levels only.
create policy member_insert_own_primal_pattern_profiles on primal_pattern_profiles
  for insert with check (member_id = auth.uid());
create policy member_update_own_primal_pattern_profiles on primal_pattern_profiles
  for update using (member_id = auth.uid());
create policy platform_admin_all_primal_pattern_profiles on primal_pattern_profiles
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));


-- ============================================================================
-- food_lens_scans
-- One row per capture session. Mirrors body_assessments' lifecycle/
-- provider-status columns.
-- ============================================================================
create table food_lens_scans (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  scan_type text not null default 'meal_photo'
    check (scan_type in ('meal_photo', 'barcode', 'nutrition_label')),

  status text not null default 'pending'
    check (status in (
      'pending', 'analyzing', 'analyzed', 'not_configured', 'failed', 'member_reviewed'
    )),

  provider_name text,
  provider_status text,
  provider_error text,

  -- Snapshot of which Primal Pattern target was active when this scan ran,
  -- so a later change to the member's target doesn't retroactively change
  -- what an old scan's comparison meant.
  primal_pattern_profile_id uuid references primal_pattern_profiles(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index food_lens_scans_member_idx on food_lens_scans(member_id, created_at desc);

alter table food_lens_scans enable row level security;

create policy member_read_own_food_lens_scans on food_lens_scans
  for select using (member_id = auth.uid());
create policy member_insert_own_food_lens_scans on food_lens_scans
  for insert with check (member_id = auth.uid());
create policy member_update_own_food_lens_scans on food_lens_scans
  for update using (member_id = auth.uid());
create policy platform_admin_all_food_lens_scans on food_lens_scans
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));


-- ============================================================================
-- food_lens_captures
-- Storage path only, never image bytes. Mirrors body_assessment_captures.
-- ============================================================================
create table food_lens_captures (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references food_lens_scans(id) on delete cascade,

  storage_path text not null,
  capture_type text not null default 'photo'
    check (capture_type in ('photo', 'barcode_image', 'label_image')),

  device_info jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index food_lens_captures_scan_idx on food_lens_captures(scan_id);

alter table food_lens_captures enable row level security;

create policy member_read_own_food_lens_captures on food_lens_captures
  for select using (
    exists (select 1 from food_lens_scans s
            where s.id = scan_id and s.member_id = auth.uid())
  );
create policy member_insert_own_food_lens_captures on food_lens_captures
  for insert with check (
    exists (select 1 from food_lens_scans s
            where s.id = scan_id and s.member_id = auth.uid())
  );
create policy platform_admin_all_food_lens_captures on food_lens_captures
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));


-- ============================================================================
-- food_lens_detected_items
-- AI-identified (or member-added) foods on the plate. Append-only,
-- supersede-not-mutate on correction — mirrors body_assessment_findings.
-- ============================================================================
create table food_lens_detected_items (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references food_lens_scans(id) on delete cascade,

  label text not null,
  category text not null default 'unknown'
    check (category in ('protein', 'carb', 'fat', 'vegetable', 'mixed', 'unknown')),
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),

  source text not null
    check (source in ('ai_detected', 'member_added', 'member_corrected')),
  status text not null default 'pending_confirmation'
    check (status in ('pending_confirmation', 'confirmed', 'rejected', 'superseded')),

  supersedes_id uuid references food_lens_detected_items(id),

  created_at timestamptz not null default now()
);

create index food_lens_detected_items_scan_idx on food_lens_detected_items(scan_id);

alter table food_lens_detected_items enable row level security;

create policy member_read_own_food_lens_detected_items on food_lens_detected_items
  for select using (
    exists (select 1 from food_lens_scans s
            where s.id = scan_id and s.member_id = auth.uid())
  );
create policy member_write_own_food_lens_detected_items on food_lens_detected_items
  for insert with check (
    exists (select 1 from food_lens_scans s
            where s.id = scan_id and s.member_id = auth.uid())
  );
create policy member_update_own_food_lens_detected_items on food_lens_detected_items
  for update using (
    exists (select 1 from food_lens_scans s
            where s.id = scan_id and s.member_id = auth.uid())
  );
create policy platform_admin_all_food_lens_detected_items on food_lens_detected_items
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));


-- ============================================================================
-- food_lens_macro_estimates
-- Plate-level protein/carb/fat *levels* (never grams/percentages framed as
-- fact) for one scan. Versioned: a recompute after a correction inserts a
-- new row rather than mutating, so scan history stays auditable.
-- ============================================================================
create table food_lens_macro_estimates (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references food_lens_scans(id) on delete cascade,

  protein_level text not null check (protein_level in ('low', 'moderate', 'high')),
  carb_level    text not null check (carb_level    in ('low', 'moderate', 'high')),
  fat_level     text not null check (fat_level     in ('low', 'moderate', 'high')),

  protein_confidence numeric not null check (protein_confidence >= 0 and protein_confidence <= 1),
  carb_confidence    numeric not null check (carb_confidence    >= 0 and carb_confidence    <= 1),
  fat_confidence     numeric not null check (fat_confidence     >= 0 and fat_confidence     <= 1),

  -- Never higher than the lowest of the three dimension confidences —
  -- enforced in application code (lib/food-lens/comparison.ts), not by a DB
  -- constraint, since the rule spans multiple columns computed together.
  overall_confidence numeric not null check (overall_confidence >= 0 and overall_confidence <= 1),

  basis text not null default 'ai_estimated'
    check (basis in ('ai_estimated', 'member_adjusted')),

  created_at timestamptz not null default now()
);

create index food_lens_macro_estimates_scan_idx on food_lens_macro_estimates(scan_id, created_at desc);

alter table food_lens_macro_estimates enable row level security;

create policy member_read_own_food_lens_macro_estimates on food_lens_macro_estimates
  for select using (
    exists (select 1 from food_lens_scans s
            where s.id = scan_id and s.member_id = auth.uid())
  );
create policy member_insert_own_food_lens_macro_estimates on food_lens_macro_estimates
  for insert with check (
    exists (select 1 from food_lens_scans s
            where s.id = scan_id and s.member_id = auth.uid())
  );
create policy platform_admin_all_food_lens_macro_estimates on food_lens_macro_estimates
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));


-- ============================================================================
-- food_lens_pattern_comparisons
-- The coaching verdict: this scan's macro estimate vs. the member's active
-- Primal Pattern target. `signals` is deterministic (plain TypeScript,
-- lib/food-lens/comparison.ts); `narrative` is generated by Root's coaching
-- brain from those signals plus real member context — see this file's
-- header and lib/food-lens/coachingNarrative.ts.
-- ============================================================================
create table food_lens_pattern_comparisons (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references food_lens_scans(id) on delete cascade,
  macro_estimate_id uuid not null references food_lens_macro_estimates(id),
  primal_pattern_profile_id uuid not null references primal_pattern_profiles(id),

  signals jsonb not null default '[]'::jsonb,
  narrative text not null,
  confidence numeric not null check (confidence >= 0 and confidence <= 1),

  created_at timestamptz not null default now()
);

create index food_lens_pattern_comparisons_scan_idx on food_lens_pattern_comparisons(scan_id, created_at desc);

alter table food_lens_pattern_comparisons enable row level security;

create policy member_read_own_food_lens_pattern_comparisons on food_lens_pattern_comparisons
  for select using (
    exists (select 1 from food_lens_scans s
            where s.id = scan_id and s.member_id = auth.uid())
  );
create policy member_insert_own_food_lens_pattern_comparisons on food_lens_pattern_comparisons
  for insert with check (
    exists (select 1 from food_lens_scans s
            where s.id = scan_id and s.member_id = auth.uid())
  );
create policy platform_admin_all_food_lens_pattern_comparisons on food_lens_pattern_comparisons
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));


-- ============================================================================
-- food_lens_corrections
-- Append-only log of every member correction. Source of truth for the
-- "learn from corrections" loop (doc 6 phase 2).
-- ============================================================================
create table food_lens_corrections (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  detected_item_id uuid not null references food_lens_detected_items(id),

  correction_type text not null
    check (correction_type in ('label_fixed', 'category_fixed', 'item_removed', 'item_added')),

  original_value jsonb not null,
  corrected_value jsonb not null,

  created_at timestamptz not null default now()
);

create index food_lens_corrections_member_idx on food_lens_corrections(member_id, created_at desc);

alter table food_lens_corrections enable row level security;

create policy member_read_own_food_lens_corrections on food_lens_corrections
  for select using (member_id = auth.uid());
create policy member_insert_own_food_lens_corrections on food_lens_corrections
  for insert with check (member_id = auth.uid());
create policy platform_admin_all_food_lens_corrections on food_lens_corrections
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));


-- ============================================================================
-- Storage bucket — private, per-member-folder RLS, same pattern as
-- body-assessment-media.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('food-lens-media', 'food-lens-media', false);

create policy member_manage_own_food_lens_media on storage.objects
  for all using (
    bucket_id = 'food-lens-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ============================================================================
-- Universal Registry adapter seam (doc 3.5 / doc 8) — extend the existing
-- source_feature check constraint additively, and grant a narrow member
-- insert/update policy scoped to domain='nutrition', mirroring exactly how
-- migration 48 opened the same seam for wearable_daily_metric. Food Lens
-- comparisons have no coach-review gate (doc 3.2), so — like wearable sync
-- — the member's own session is the writer, not a service role.
-- ============================================================================
alter table registry_entries drop constraint registry_entries_source_feature_check;
alter table registry_entries add constraint registry_entries_source_feature_check
  check (source_feature in (
    'body_assessment_finding', 'assessment_ai_observation', 'wearable_daily_metric',
    'food_lens_pattern_comparison'
  ));

create policy member_insert_own_food_lens_registry_entries on registry_entries
  for insert
  with check (
    member_id = auth.uid()
    and domain = 'nutrition'
    and source_feature = 'food_lens_pattern_comparison'
  );

create policy member_update_own_food_lens_registry_entries on registry_entries
  for update
  using (member_id = auth.uid() and domain = 'nutrition')
  with check (member_id = auth.uid() and domain = 'nutrition');


-- ============================================================================
-- Conversation Coach — add 'food_lens' as a valid entry point (doc 8.2),
-- same additive drop/re-add pattern migration 37 used to add
-- 'body_assessment'.
-- ============================================================================
alter table conversation_sessions drop constraint conversation_sessions_entry_point_check;
alter table conversation_sessions add constraint conversation_sessions_entry_point_check
  check (entry_point in (
    'nav',
    'today_focus',
    'today_easier_option',
    'today_why',
    'today_completed',
    'progress_pattern',
    'progress_improved',
    'progress_focus',
    'checkin_explain',
    'checkin_feeling',
    'dashboard',
    'profile',
    'assessment',
    'body_assessment',
    'food_lens'
  ));
