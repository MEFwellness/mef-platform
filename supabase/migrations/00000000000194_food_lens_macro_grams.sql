-- Food Lens Phase 2 — gram estimates for a meal photo.
--
-- Until now a meal photo produced only a relative Low/Moderate/High macro
-- read (migration 55, food_lens_macro_estimates) and never a number, so a
-- photographed meal contributed exactly zero to the daily protein ledger
-- while barcode, label, search and manual entries all contributed real
-- grams. This migration adds the missing gram layer, under one hard rule:
-- a photo number is an ESTIMATE and it never counts until the member
-- confirms it.
--
-- Three parts:
--   1. food_lens_item_macro_estimates — the vision model's per-item
--      protein/carb/fat gram estimate, one row per detected item, append
--      only and versioned the same way every other Food Lens estimate is.
--   2. food_lens_macro_estimates.protein_g / carb_g / fat_g — the meal
--      total for that estimate version. Always the sum of the item rows
--      above, computed in one place (lib/food-lens/macroGrams.ts), so the
--      total and the breakdown can never disagree.
--   3. member_food_log.entry_source + estimated_protein_g / carb_g /
--      fat_g — what makes a confirmed photo entry countable. The three
--      gram columns are PER SERVING, exactly like product_nutrients, so
--      an entry's contribution is always grams x servings whichever lane
--      it came from and editing servings later rescales all three
--      together with no special case.
--
-- No calories anywhere. Carbohydrate and fat grams are stored and shown
-- as information only: this migration adds no carb or fat target, and
-- nothing reads these two columns as progress toward anything.

-- ============================================================================
-- 1. Per-item gram estimates
-- ============================================================================
create table food_lens_item_macro_estimates (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references food_lens_scans(id) on delete cascade,
  detected_item_id uuid not null references food_lens_detected_items(id) on delete cascade,

  -- Nullable on purpose. A model that cannot honestly size an item leaves
  -- these null, and null stays null: a missing estimate is never written
  -- as 0g, which would read to a member as "this food has no protein."
  protein_g numeric check (protein_g >= 0),
  carb_g    numeric check (carb_g    >= 0),
  fat_g     numeric check (fat_g     >= 0),

  -- The portion these grams describe, in the model's own plain words
  -- ("about 6 ounces"), so the number on screen always says what amount
  -- of food it is the estimate for.
  portion_description text,

  basis text not null default 'ai_estimated'
    check (basis in ('ai_estimated', 'member_adjusted')),

  created_at timestamptz not null default now()
);

create index food_lens_item_macro_estimates_item_idx
  on food_lens_item_macro_estimates(detected_item_id, created_at desc);
create index food_lens_item_macro_estimates_scan_idx
  on food_lens_item_macro_estimates(scan_id);

alter table food_lens_item_macro_estimates enable row level security;

create policy member_read_own_food_lens_item_macro_estimates on food_lens_item_macro_estimates
  for select using (
    exists (select 1 from food_lens_scans s
            where s.id = scan_id and s.member_id = auth.uid())
  );
create policy member_insert_own_food_lens_item_macro_estimates on food_lens_item_macro_estimates
  for insert with check (
    exists (select 1 from food_lens_scans s
            where s.id = scan_id and s.member_id = auth.uid())
  );
create policy platform_admin_all_food_lens_item_macro_estimates on food_lens_item_macro_estimates
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));


-- ============================================================================
-- 2. Meal totals on the existing estimate row
-- ============================================================================
alter table food_lens_macro_estimates add column protein_g numeric check (protein_g >= 0);
alter table food_lens_macro_estimates add column carb_g    numeric check (carb_g    >= 0);
alter table food_lens_macro_estimates add column fat_g     numeric check (fat_g     >= 0);

comment on column food_lens_macro_estimates.protein_g is
  'Estimated grams of protein for the whole meal, always the sum of this version''s food_lens_item_macro_estimates rows. Null for a scan analyzed before gram estimates existed, and null is never displayed as zero.';


-- ============================================================================
-- 3. Countable, confirmed photo entries in the food log
-- ============================================================================

-- Which lane wrote this row. Nullable: every row written before this
-- migration keeps its lane inferred from the row's own shape
-- (lib/protein/ledger.ts, resolveEntrySource), and this column is the
-- explicit answer where a writer sets it. 'photo_estimated' is the only
-- value that means "these grams came from a photo, and the member
-- confirmed them."
alter table member_food_log add column entry_source text
  check (entry_source in (
    'barcode', 'nutrition_label', 'search', 'manual', 'quick_add',
    'photo_estimated', 'saved_meal', 'duplicate'
  ));

-- PER SERVING, like product_nutrients.protein_g. The row's contribution
-- is always this value times member_food_log.servings.
alter table member_food_log add column estimated_protein_g numeric check (estimated_protein_g >= 0);
alter table member_food_log add column estimated_carb_g    numeric check (estimated_carb_g    >= 0);
alter table member_food_log add column estimated_fat_g     numeric check (estimated_fat_g     >= 0);

comment on column member_food_log.estimated_protein_g is
  'Estimated grams of protein per serving for a photo-sourced entry the member confirmed. Per serving, exactly like product_nutrients.protein_g, so servings x this value is the contribution and editing servings rescales protein, carbohydrate and fat together.';

create index member_food_log_entry_source_idx on member_food_log(member_id, entry_source);
