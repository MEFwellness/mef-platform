-- MEF Food Intelligence Engine — barcode scanning, packaged-food product
-- cache, the deterministic MEF Nutrition Rules Engine's output, and food
-- logging. Extends Food Lens (migration 55/56/57) rather than replacing
-- anything: food_lens_scans.scan_type already reserves 'barcode' and
-- food_lens_captures.capture_type already reserves 'barcode_image', so a
-- barcode scan reuses the exact same scan lifecycle, storage bucket, and
-- Root/registry integration points meal photos already use. No existing
-- Food Lens table is altered destructively.
--
-- Conventions followed (matching migration 55's header): snake_case
-- feature-prefixed table names, `id uuid primary key default
-- gen_random_uuid()`, `created_at timestamptz not null default now()`,
-- enum-like fields as `text not null check (x in (...))`, deny-by-default
-- RLS with explicit policies, confidence as a first-class numeric column.
--
-- One deliberate departure: food_products / product_nutrients /
-- product_ingredients / product_allergens are a SHARED reference cache, not
-- member-owned data (a barcode's nutrition facts don't belong to whoever
-- scanned it first). Per lib/supabase/server.ts's standing rule — "no
-- service-role client in the request path" — these tables grant
-- insert/select/update to any authenticated member rather than routing
-- writes through a service role, mirroring how migration 48 opened a
-- narrow member-write seam on registry_entries for exactly this reason
-- (a passive, non-sensitive, member-session-triggered write with nothing
-- to gate).

-- ============================================================================
-- food_products
-- Shared packaged-food product cache, keyed by barcode + data source.
-- Modular by design: data_source is an open enum so a future USDA FoodData
-- Central or MEF-verified fallback provider can populate rows through the
-- exact same table without a schema change (see lib/food-products/providers/).
-- ============================================================================
create table food_products (
  id uuid primary key default gen_random_uuid(),

  barcode text not null,
  barcode_type text not null default 'unknown'
    check (barcode_type in ('upc_a', 'upc_e', 'ean_8', 'ean_13', 'unknown')),

  name text,
  brand text,
  image_url text,

  serving_size_text text,
  serving_size_grams numeric,

  data_source text not null default 'open_food_facts'
    check (data_source in ('open_food_facts', 'usda_fdc', 'mef_verified')),
  source_product_id text,
  nutrition_grade text,

  -- How much of the fields the MEF Nutrition Rules Engine actually needs
  -- were present in the source response — never inferred, computed once at
  -- normalize time (lib/food-products/providers/openFoodFacts.ts) from
  -- which fields came back non-null. Drives the "some information is
  -- missing" member-facing disclosure (product requirement §4).
  data_completeness text not null default 'minimal'
    check (data_completeness in ('complete', 'partial', 'minimal')),

  -- The untouched provider response, kept for debugging/reprocessing and so
  -- normalization logic can improve later without a re-fetch. Never read
  -- directly by the rules engine or the AI — only the normalized columns
  -- and the child tables below are.
  raw_source_data jsonb not null default '{}'::jsonb,

  last_fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index food_products_barcode_source_idx on food_products(barcode, data_source);
create index food_products_barcode_idx on food_products(barcode);

alter table food_products enable row level security;

create policy authenticated_read_food_products on food_products
  for select using (auth.uid() is not null);
create policy authenticated_insert_food_products on food_products
  for insert with check (auth.uid() is not null);
create policy authenticated_update_food_products on food_products
  for update using (auth.uid() is not null);
create policy platform_admin_all_food_products on food_products
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));


-- ============================================================================
-- product_nutrients
-- Normalized per-serving (preferred) or per-100g nutrient facts. One
-- current row per product — refreshed wholesale on re-fetch via upsert on
-- product_id, not append-only, since this is external factual data with no
-- member-correction history to preserve (unlike food_lens_detected_items).
-- ============================================================================
create table product_nutrients (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references food_products(id) on delete cascade,

  basis text not null default 'per_serving' check (basis in ('per_serving', 'per_100g')),

  calories numeric,
  protein_g numeric,
  total_carbohydrate_g numeric,
  fiber_g numeric,
  total_sugar_g numeric,
  added_sugar_g numeric,
  total_fat_g numeric,
  saturated_fat_g numeric,
  monounsaturated_fat_g numeric,
  polyunsaturated_fat_g numeric,
  trans_fat_g numeric,
  sodium_mg numeric,
  potassium_mg numeric,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index product_nutrients_product_idx on product_nutrients(product_id);

alter table product_nutrients enable row level security;

create policy authenticated_read_product_nutrients on product_nutrients
  for select using (auth.uid() is not null);
create policy authenticated_insert_product_nutrients on product_nutrients
  for insert with check (auth.uid() is not null);
create policy authenticated_update_product_nutrients on product_nutrients
  for update using (auth.uid() is not null);
create policy platform_admin_all_product_nutrients on product_nutrients
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));


-- ============================================================================
-- product_ingredients
-- ============================================================================
create table product_ingredients (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references food_products(id) on delete cascade,

  ingredients_text text,
  ingredients_list jsonb not null default '[]'::jsonb,
  additives jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index product_ingredients_product_idx on product_ingredients(product_id);

alter table product_ingredients enable row level security;

create policy authenticated_read_product_ingredients on product_ingredients
  for select using (auth.uid() is not null);
create policy authenticated_insert_product_ingredients on product_ingredients
  for insert with check (auth.uid() is not null);
create policy authenticated_update_product_ingredients on product_ingredients
  for update using (auth.uid() is not null);
create policy platform_admin_all_product_ingredients on product_ingredients
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));


-- ============================================================================
-- product_allergens
-- ============================================================================
create table product_allergens (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references food_products(id) on delete cascade,

  allergen text not null,
  kind text not null default 'contains' check (kind in ('contains', 'may_contain')),

  created_at timestamptz not null default now()
);

create unique index product_allergens_unique_idx on product_allergens(product_id, allergen, kind);

alter table product_allergens enable row level security;

create policy authenticated_read_product_allergens on product_allergens
  for select using (auth.uid() is not null);
create policy authenticated_insert_product_allergens on product_allergens
  for insert with check (auth.uid() is not null);
create policy authenticated_delete_product_allergens on product_allergens
  for delete using (auth.uid() is not null);
create policy platform_admin_all_product_allergens on product_allergens
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));


-- ============================================================================
-- food_lens_barcode_scans
-- Links a food_lens_scans row (scan_type = 'barcode') to the product a
-- decoded barcode resolved to — mirrors how food_lens_macro_estimates
-- attaches structured results to a scan_id. lookup_status keeps the
-- "product not found" / "lookup failed" states first-class rather than
-- inferring them from a null product_id.
-- ============================================================================
create table food_lens_barcode_scans (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references food_lens_scans(id) on delete cascade,

  barcode text not null,
  barcode_type text not null default 'unknown'
    check (barcode_type in ('upc_a', 'upc_e', 'ean_8', 'ean_13', 'unknown')),

  product_id uuid references food_products(id),
  lookup_status text not null default 'pending'
    check (lookup_status in ('pending', 'found', 'not_found', 'error')),
  lookup_error text,

  created_at timestamptz not null default now()
);

create index food_lens_barcode_scans_scan_idx on food_lens_barcode_scans(scan_id);

alter table food_lens_barcode_scans enable row level security;

create policy member_read_own_food_lens_barcode_scans on food_lens_barcode_scans
  for select using (
    exists (select 1 from food_lens_scans s
            where s.id = scan_id and s.member_id = auth.uid())
  );
create policy member_insert_own_food_lens_barcode_scans on food_lens_barcode_scans
  for insert with check (
    exists (select 1 from food_lens_scans s
            where s.id = scan_id and s.member_id = auth.uid())
  );
-- Needed so lookupBarcodeAction can record the resolved product_id/
-- lookup_status after the initial 'pending' insert (lib/food-products/data.ts's
-- updateFoodLensBarcodeScan) — missing this policy makes that update a
-- silent no-op under RLS (0 rows matched, no error), never actually
-- persisting the lookup result.
create policy member_update_own_food_lens_barcode_scans on food_lens_barcode_scans
  for update using (
    exists (select 1 from food_lens_scans s
            where s.id = scan_id and s.member_id = auth.uid())
  );
create policy platform_admin_all_food_lens_barcode_scans on food_lens_barcode_scans
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));


-- ============================================================================
-- food_analysis_results
-- The MEF Nutrition Rules Engine's deterministic output for one barcode
-- scan, plus Root's coaching layer output generated from it. Same "facts
-- vs. interpretation" split as food_lens_macro_estimates (deterministic) /
-- food_lens_pattern_comparisons.narrative (Root-generated): rules_result is
-- pure TypeScript output (lib/food-products/rulesEngine/*.ts, re-derivable
-- from product_nutrients/product_ingredients at will), coaching_result is
-- the only part an LLM ever touches, and only from rules_result — never
-- from raw nutrient numbers directly.
-- ============================================================================
create table food_analysis_results (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references food_lens_scans(id) on delete cascade,
  product_id uuid not null references food_products(id),

  data_completeness text not null check (data_completeness in ('complete', 'partial', 'minimal')),
  overall_confidence numeric not null check (overall_confidence >= 0 and overall_confidence <= 1),

  rules_result jsonb not null default '{}'::jsonb,

  coaching_result jsonb not null default '{}'::jsonb,
  coaching_prompt_version text,

  member_allergen_matches jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now()
);

create index food_analysis_results_scan_idx on food_analysis_results(scan_id, created_at desc);

alter table food_analysis_results enable row level security;

create policy member_read_own_food_analysis_results on food_analysis_results
  for select using (
    exists (select 1 from food_lens_scans s
            where s.id = scan_id and s.member_id = auth.uid())
  );
create policy member_insert_own_food_analysis_results on food_analysis_results
  for insert with check (
    exists (select 1 from food_lens_scans s
            where s.id = scan_id and s.member_id = auth.uid())
  );
create policy platform_admin_all_food_analysis_results on food_analysis_results
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));


-- ============================================================================
-- nutrition_rule_thresholds
-- The configurable numeric cutoffs the MEF Nutrition Rules Engine reads
-- (lib/food-products/rulesEngine/thresholds.ts) — e.g. what "high sodium"
-- means in mg. Readable by any member (not sensitive), writable only by a
-- platform administrator, so thresholds can be tuned without a redeploy.
-- The rules engine itself stays plain, reviewable TypeScript (matching
-- lib/food-lens/mealQuality.ts's precedent) — only the numeric cutoffs are
-- externalized here, not the judgment logic.
-- ============================================================================
create table nutrition_rule_thresholds (
  key text primary key,
  value numeric not null,
  description text not null,
  updated_at timestamptz not null default now()
);

alter table nutrition_rule_thresholds enable row level security;

create policy authenticated_read_nutrition_rule_thresholds on nutrition_rule_thresholds
  for select using (auth.uid() is not null);
create policy platform_admin_all_nutrition_rule_thresholds on nutrition_rule_thresholds
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

insert into nutrition_rule_thresholds (key, value, description) values
  ('high_saturated_fat_g', 5, 'Grams of saturated fat per serving at/above which a serving is flagged "high" for combination checks.'),
  ('high_total_fat_g', 15, 'Grams of total fat per serving at/above which a serving is flagged "high fat" for combination checks.'),
  ('high_added_sugar_g', 10, 'Grams of added sugar per serving at/above which a serving is flagged "high".'),
  ('high_sodium_mg', 600, 'Milligrams of sodium per serving at/above which a serving is flagged "high" (roughly a quarter of the general daily sodium guideline).'),
  ('low_fiber_g', 2, 'Grams of fiber per serving at/below which a serving is flagged "low fiber".'),
  ('meaningful_fiber_g', 3, 'Grams of fiber per serving at/above which fiber is considered a meaningful contribution.'),
  ('meaningful_protein_g', 5, 'Grams of protein per serving at/above which protein is considered a meaningful contribution.'),
  ('high_protein_marketing_g', 10, 'Grams of protein per serving at/above which a "high protein" marketing claim is considered nutritionally substantiated.'),
  ('low_calorie_density_kcal', 100, 'Calories per serving at/below which a serving is considered low calorie-density for combination checks.'),
  ('high_calorie_density_kcal', 350, 'Calories per serving at/above which a serving is considered high calorie-density for combination checks.'),
  ('long_ingredient_list_count', 12, 'Number of ingredients at/above which a list is considered long (informational, not automatically negative).'),
  ('high_carb_g', 30, 'Grams of total carbohydrate per serving at/above which a serving is flagged "high carbohydrate".');


-- ============================================================================
-- member_food_log
-- The member's own log of packaged foods (and, later, other scan types)
-- they've added to a given day. Serving quantity/meal category/time are
-- freely editable; product_nutrients (the source-of-truth per-serving
-- values) is never overwritten by a logged adjustment — `servings` is the
-- only multiplier stored here, so the original database facts stay intact.
-- ============================================================================
create table member_food_log (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  product_id uuid references food_products(id),
  scan_id uuid references food_lens_scans(id),

  meal_category text not null default 'snack'
    check (meal_category in ('breakfast', 'lunch', 'dinner', 'snack')),
  servings numeric not null default 1 check (servings > 0),

  consumed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index member_food_log_member_idx on member_food_log(member_id, consumed_at desc);

alter table member_food_log enable row level security;

create policy member_read_own_food_log on member_food_log
  for select using (member_id = auth.uid());
create policy member_insert_own_food_log on member_food_log
  for insert with check (member_id = auth.uid());
create policy member_update_own_food_log on member_food_log
  for update using (member_id = auth.uid());
create policy member_delete_own_food_log on member_food_log
  for delete using (member_id = auth.uid());
create policy platform_admin_all_food_log on member_food_log
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));


-- ============================================================================
-- member_food_preferences
-- Phase-1 manual-entry placeholder for allergies/intolerances/dietary
-- pattern — same discipline as primal_pattern_profiles (migration 56):
-- nothing in this schema captures allergy or dietary-restriction data
-- anywhere else yet (no onboarding question, no narrative_item category),
-- so packaged-food allergen matching and dietary-pattern personalization
-- need a real, member-provided source rather than inventing one. One row
-- per member, upserted (not append-only) — a member's allergy list is a
-- current-state fact to correct in place, not a history to version.
-- ============================================================================
create table member_food_preferences (
  member_id uuid primary key references auth.users(id) on delete cascade,

  allergies text[] not null default '{}',
  intolerances text[] not null default '{}',
  avoid_ingredients text[] not null default '{}',
  dietary_pattern text,

  updated_at timestamptz not null default now()
);

alter table member_food_preferences enable row level security;

create policy member_read_own_food_preferences on member_food_preferences
  for select using (member_id = auth.uid());
create policy member_insert_own_food_preferences on member_food_preferences
  for insert with check (member_id = auth.uid());
create policy member_update_own_food_preferences on member_food_preferences
  for update using (member_id = auth.uid());
create policy coach_read_assigned_food_preferences on member_food_preferences
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );
create policy platform_admin_all_food_preferences on member_food_preferences
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));


-- ============================================================================
-- Universal Registry adapter seam — extend registry_entries' source_feature
-- check constraint additively (same pattern migration 55 used to add
-- 'food_lens_pattern_comparison') so packaged-food analyses can also flow
-- to the Intelligence Engine and Root with zero changes to those systems.
-- ============================================================================
alter table registry_entries drop constraint registry_entries_source_feature_check;
alter table registry_entries add constraint registry_entries_source_feature_check
  check (source_feature in (
    'body_assessment_finding', 'assessment_ai_observation', 'wearable_daily_metric',
    'food_lens_pattern_comparison', 'movement_session_completed', 'food_analysis_result'
  ));

create policy member_insert_own_food_analysis_registry_entries on registry_entries
  for insert
  with check (
    member_id = auth.uid()
    and domain = 'nutrition'
    and source_feature = 'food_analysis_result'
  );

create policy member_update_own_food_analysis_registry_entries on registry_entries
  for update
  using (member_id = auth.uid() and domain = 'nutrition' and source_feature = 'food_analysis_result')
  with check (member_id = auth.uid() and domain = 'nutrition' and source_feature = 'food_analysis_result');
