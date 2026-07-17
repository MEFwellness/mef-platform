-- Fixes the misleading "Sprite: Protein Low, Fat Low" result and adds the
-- Meal Quality indicator (green/yellow/red). Both additive on top of
-- migration 55 — no existing column is renamed or narrowed, and existing
-- food_lens_macro_estimates rows (all currently 'low'/'moderate'/'high')
-- remain valid under the widened constraint below.
--
-- Root cause of the misleading result: food_lens_macro_estimates.*_level
-- only ever allowed 'low'/'moderate'/'high' — a meal reading that is
-- genuinely absent (a soda has no meaningful protein or fat) had nowhere
-- to go but 'low', which reads to a member as "a small amount," not
-- "essentially none." This migration widens the level columns to also
-- allow 'none'; the actual classification fix (the vision prompt/schema
-- and the deterministic recompute-from-items logic) lives in
-- lib/food-lens/providers/anthropicVision.ts and
-- lib/food-lens/comparison.ts, not in the database.

alter table food_lens_macro_estimates drop constraint food_lens_macro_estimates_protein_level_check;
alter table food_lens_macro_estimates add constraint food_lens_macro_estimates_protein_level_check
  check (protein_level in ('none', 'low', 'moderate', 'high'));

alter table food_lens_macro_estimates drop constraint food_lens_macro_estimates_carb_level_check;
alter table food_lens_macro_estimates add constraint food_lens_macro_estimates_carb_level_check
  check (carb_level in ('none', 'low', 'moderate', 'high'));

alter table food_lens_macro_estimates drop constraint food_lens_macro_estimates_fat_level_check;
alter table food_lens_macro_estimates add constraint food_lens_macro_estimates_fat_level_check
  check (fat_level in ('none', 'low', 'moderate', 'high'));


-- ============================================================================
-- food_lens_meal_quality_ratings
-- The deterministic green/yellow/red Meal Quality rating for one scan, plus
-- the structured quality signals (from the vision model) that produced it —
-- see lib/food-lens/mealQuality.ts. A dedicated table, not new columns on
-- food_lens_pattern_comparisons, because a rating is computable — and
-- useful — even for a member with no Primal Pattern target set yet (same
-- "still useful on its own" discipline doc 5 §5.5 applies to the macro
-- estimate). Versioned like food_lens_macro_estimates: a recompute after a
-- correction inserts a new row rather than mutating.
-- ============================================================================
create table food_lens_meal_quality_ratings (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references food_lens_scans(id) on delete cascade,
  macro_estimate_id uuid not null references food_lens_macro_estimates(id),

  rating text not null check (rating in ('green', 'yellow', 'red')),
  -- One short, reviewed explanation sentence — selected from a small
  -- reviewed set by lib/food-lens/mealQuality.ts, never generated per-call
  -- by an LLM (same discipline the original blueprint's template library
  -- applied to the pattern-comparison narrative, before that specific
  -- narrative became Root-generated).
  explanation text not null,

  nutrient_density text not null check (nutrient_density in ('low', 'moderate', 'high')),
  added_sugar_level text not null check (added_sugar_level in ('none', 'some', 'high')),
  processing_level text not null
    check (processing_level in ('whole_or_minimally_processed', 'processed', 'ultra_processed')),
  has_meaningful_protein boolean not null default false,
  has_meaningful_fiber boolean not null default false,
  has_healthy_fat boolean not null default false,

  -- Confidence in these quality-signal judgments specifically — distinct
  -- from food_lens_detected_items.confidence (identification) and
  -- food_lens_macro_estimates.*_confidence (macro composition).
  confidence numeric not null check (confidence >= 0 and confidence <= 1),

  created_at timestamptz not null default now()
);

create index food_lens_meal_quality_ratings_scan_idx
  on food_lens_meal_quality_ratings(scan_id, created_at desc);

alter table food_lens_meal_quality_ratings enable row level security;

create policy member_read_own_food_lens_meal_quality_ratings on food_lens_meal_quality_ratings
  for select using (
    exists (select 1 from food_lens_scans s
            where s.id = scan_id and s.member_id = auth.uid())
  );
create policy member_insert_own_food_lens_meal_quality_ratings on food_lens_meal_quality_ratings
  for insert with check (
    exists (select 1 from food_lens_scans s
            where s.id = scan_id and s.member_id = auth.uid())
  );
create policy platform_admin_all_food_lens_meal_quality_ratings on food_lens_meal_quality_ratings
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
