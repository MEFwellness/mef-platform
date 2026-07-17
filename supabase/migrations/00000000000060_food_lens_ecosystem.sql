-- MEF Food Lens Ecosystem — nutrition label scanning, meal-photo portion/
-- cooking-method detail, unified search & product memory, smart swaps
-- support data, pantry intelligence, restaurant intelligence, and weekly
-- nutrition reports. Extends Food Lens (55/56/57) and the MEF Food
-- Intelligence Engine (59) rather than replacing anything — every new
-- table here is additive, and every alter is a new nullable column or an
-- additively-widened check constraint. No existing table is altered
-- destructively, no existing data is touched.
--
-- Conventions match migration 59's header exactly: snake_case
-- feature-prefixed table names, `id uuid primary key default
-- gen_random_uuid()`, `created_at timestamptz not null default now()`,
-- enum-like fields as `text not null check (x in (...))`, deny-by-default
-- RLS with explicit policies, confidence as a first-class numeric column.
--
-- Design decisions worth calling out:
-- 1. Label-scanned products are NOT a separate shape from barcode
--    products. Once a member confirms a label scan
--    (food_lens_label_scans), the confirmed values are written into
--    food_products (data_source='mef_verified') + product_nutrients/
--    product_ingredients/product_allergens — the exact same rows a
--    barcode lookup writes — so the existing MEF Nutrition Rules Engine,
--    food_analysis_results, registry adapter, and food log all work on a
--    label-scanned product with zero new code paths. food_products.barcode
--    is widened to nullable for this reason (a scanned label may have no
--    visible/decodable barcode).
-- 2. No new "member_nutrition_patterns" cache table. History/weekly-report
--    pattern computation reads member_food_log + food_analysis_results +
--    food_lens_meal_quality_ratings directly and is cheap at this scale —
--    adding a snapshot cache table now would be an abstraction with no
--    present need (a weekly_nutrition_reports row already persists the
--    *result* of that computation once generated).
-- 3. Smart food swaps and daily coaching are pure, on-demand functions over
--    existing data — no new table. Nothing about "what should I swap this
--    for" or "how am I doing today" is itself a fact that needs storing.


-- ============================================================================
-- food_lens_scans: a nullable direct product link, used only when a scan is
-- opened from search/favorites/pantry/manual-entry for an ALREADY-cached (or
-- just-created) product rather than a fresh barcode/label capture (Part 3's
-- manual entry, Part 4's "repeat logging" and favorites). getProductScanAction
-- checks this as a third fallback after food_lens_barcode_scans.product_id
-- and food_lens_label_scans.confirmed_product_id, so every product —
-- however it was first found — renders through the one unified result page
-- (Part 15). scan_type widens to add 'manual_entry' (Part 3's fifth entry
-- option — a product created from scratch by the member, then run through
-- the identical rules-engine/coaching/food-log path any other product uses).
-- ============================================================================
alter table food_lens_scans add column linked_product_id uuid references food_products(id);

alter table food_lens_scans drop constraint food_lens_scans_scan_type_check;
alter table food_lens_scans add constraint food_lens_scans_scan_type_check
  check (scan_type in ('meal_photo', 'barcode', 'nutrition_label', 'manual_entry'));


-- ============================================================================
-- food_lens_captures: which label photo this is (nutrition facts vs.
-- ingredients vs. allergens vs. front label) — lets Part 1's multi-photo
-- capture flow route each image to the right OCR extraction step. Null for
-- every existing capture_type ('photo', 'barcode_image') since the
-- distinction only matters for label_image captures.
-- ============================================================================
alter table food_lens_captures add column label_photo_role text
  check (label_photo_role in ('nutrition_facts', 'ingredients', 'allergens', 'front_label'));


-- ============================================================================
-- food_lens_detected_items: Meal Photo Intelligence 2.0 — portion,
-- cooking-method, and condiment/sauce detail per item. All nullable/
-- defaulted so every existing row (and every existing read path) is
-- unaffected. portion_description is deliberately a short phrase ("about
-- half a cup"), never a bare number — see product requirement §2's "never
-- display false precision."
-- ============================================================================
alter table food_lens_detected_items add column portion_description text;
alter table food_lens_detected_items add column portion_confidence numeric check (portion_confidence >= 0 and portion_confidence <= 1);
alter table food_lens_detected_items add column quantity numeric;
alter table food_lens_detected_items add column unit text check (unit in ('grams', 'ounces', 'cups', 'tablespoons', 'teaspoons', 'pieces', 'servings'));
alter table food_lens_detected_items add column cooking_method text
  check (cooking_method in ('grilled', 'fried', 'baked', 'roasted', 'steamed', 'boiled', 'raw', 'sauteed', 'unknown'));
alter table food_lens_detected_items add column is_condiment boolean not null default false;

alter table food_lens_corrections drop constraint food_lens_corrections_correction_type_check;
alter table food_lens_corrections add constraint food_lens_corrections_correction_type_check
  check (correction_type in (
    'label_fixed', 'category_fixed', 'item_removed', 'item_added',
    'portion_adjusted', 'cooking_method_set'
  ));


-- ============================================================================
-- food_products: widen barcode to nullable so a confirmed Nutrition Facts
-- label scan (no decodable barcode) can still materialize into the shared
-- product cache as a 'mef_verified' record (see this file's header, point 1)
-- rather than needing a second, parallel product shape. The old unique
-- index disallowed multiple nulls under some Postgres unique-index
-- semantics for composite indexes with a text column, so it's rebuilt as a
-- partial index that only applies where a barcode actually exists.
-- ============================================================================
alter table food_products alter column barcode drop not null;

-- Deliberately NOT rebuilt as a partial (`where barcode is not null`) index:
-- Postgres unique indexes already treat NULL as distinct from every other
-- NULL for uniqueness purposes, so the existing plain index already allows
-- unlimited barcode-null rows (one per confirmed label scan) without
-- modification. A partial index here would have broken
-- upsertFoodProductFromProvider's `onConflict: 'barcode,data_source'`
-- inference for the (non-null) barcode case, since Supabase's upsert
-- can't target a partial index through a bare column-list onConflict.

-- Full-text search over name + brand — Part 4's product search. Plain
-- Postgres `to_tsvector`, no extension required.
alter table food_products add column search_vector tsvector
  generated always as (
    to_tsvector('english', coalesce(name, '') || ' ' || coalesce(brand, ''))
  ) stored;
create index food_products_search_vector_idx on food_products using gin(search_vector);


-- ============================================================================
-- food_lens_label_scans
-- One row per nutrition-label scan (food_lens_scans.scan_type =
-- 'nutrition_label') — the raw OCR/vision extraction with a per-field
-- confidence, held here for member review/edit BEFORE anything is written
-- to the shared food_products cache. Never mutated after member
-- confirmation; confirmed_product_id points at the food_products row this
-- scan materialized once confirmed (Part 1's "member confirmation before
-- saving").
-- ============================================================================
create table food_lens_label_scans (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references food_lens_scans(id) on delete cascade,

  product_name text,
  brand text,
  serving_size_text text,
  servings_per_container numeric,

  calories numeric,
  protein_g numeric,
  total_carbohydrate_g numeric,
  fiber_g numeric,
  total_sugar_g numeric,
  added_sugar_g numeric,
  total_fat_g numeric,
  saturated_fat_g numeric,
  trans_fat_g numeric,
  monounsaturated_fat_g numeric,
  polyunsaturated_fat_g numeric,
  cholesterol_mg numeric,
  sodium_mg numeric,
  potassium_mg numeric,
  -- { "vitamin_d_mcg": 2, "calcium_mg": 260, ... } — an open bag rather than
  -- a fixed column per nutrient, since which vitamins/minerals a label
  -- discloses varies by product.
  vitamins_minerals jsonb not null default '{}'::jsonb,

  ingredients_text text,
  allergens_text text,

  -- { "calories": 0.92, "protein_g": 0.4, ... } — one confidence per
  -- extracted field (product requirement §1's "confidence score for every
  -- extracted field"). A field absent from this map was not read at all,
  -- distinct from a field read with low confidence.
  field_confidence jsonb not null default '{}'::jsonb,

  status text not null default 'pending'
    check (status in ('pending', 'extracted', 'member_confirmed')),
  confirmed_product_id uuid references food_products(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index food_lens_label_scans_scan_idx on food_lens_label_scans(scan_id);

alter table food_lens_label_scans enable row level security;

create policy member_read_own_food_lens_label_scans on food_lens_label_scans
  for select using (
    exists (select 1 from food_lens_scans s where s.id = scan_id and s.member_id = auth.uid())
  );
create policy member_insert_own_food_lens_label_scans on food_lens_label_scans
  for insert with check (
    exists (select 1 from food_lens_scans s where s.id = scan_id and s.member_id = auth.uid())
  );
create policy member_update_own_food_lens_label_scans on food_lens_label_scans
  for update using (
    exists (select 1 from food_lens_scans s where s.id = scan_id and s.member_id = auth.uid())
  );
create policy platform_admin_all_food_lens_label_scans on food_lens_label_scans
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));


-- ============================================================================
-- food_lens_label_field_corrections
-- Append-only audit of member edits to an OCR-extracted field — same
-- purpose as food_lens_corrections, kept separate because it corrects a
-- differently-shaped record (a label field, not a detected meal item).
-- ============================================================================
create table food_lens_label_field_corrections (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  label_scan_id uuid not null references food_lens_label_scans(id) on delete cascade,

  field_name text not null,
  original_value jsonb,
  corrected_value jsonb,

  created_at timestamptz not null default now()
);

create index food_lens_label_field_corrections_scan_idx on food_lens_label_field_corrections(label_scan_id);

alter table food_lens_label_field_corrections enable row level security;

create policy member_read_own_label_field_corrections on food_lens_label_field_corrections
  for select using (member_id = auth.uid());
create policy member_insert_own_label_field_corrections on food_lens_label_field_corrections
  for insert with check (member_id = auth.uid());
create policy platform_admin_all_label_field_corrections on food_lens_label_field_corrections
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));


-- ============================================================================
-- saved_meals / saved_meal_items
-- Part 4's "favorite a meal, repeat-log with adjustable portions." A saved
-- meal is a member-owned template — a named bundle of items (each
-- optionally pointing at a cached food_products row) that can be logged as
-- one action. Distinct from member_food_log (which records what was
-- actually eaten, when) the same way a recipe is distinct from a meal
-- diary entry.
-- ============================================================================
create table saved_meals (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  name text not null,
  source_scan_id uuid references food_lens_scans(id),

  created_at timestamptz not null default now()
);

create index saved_meals_member_idx on saved_meals(member_id, created_at desc);

alter table saved_meals enable row level security;

create policy member_read_own_saved_meals on saved_meals
  for select using (member_id = auth.uid());
create policy member_insert_own_saved_meals on saved_meals
  for insert with check (member_id = auth.uid());
create policy member_update_own_saved_meals on saved_meals
  for update using (member_id = auth.uid());
create policy member_delete_own_saved_meals on saved_meals
  for delete using (member_id = auth.uid());
create policy platform_admin_all_saved_meals on saved_meals
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

create table saved_meal_items (
  id uuid primary key default gen_random_uuid(),
  saved_meal_id uuid not null references saved_meals(id) on delete cascade,

  product_id uuid references food_products(id),
  label text not null,
  category text check (category in ('protein', 'carb', 'fat', 'vegetable', 'mixed', 'unknown')),
  servings numeric not null default 1 check (servings > 0),

  created_at timestamptz not null default now()
);

create index saved_meal_items_meal_idx on saved_meal_items(saved_meal_id);

alter table saved_meal_items enable row level security;

create policy member_read_own_saved_meal_items on saved_meal_items
  for select using (
    exists (select 1 from saved_meals m where m.id = saved_meal_id and m.member_id = auth.uid())
  );
create policy member_insert_own_saved_meal_items on saved_meal_items
  for insert with check (
    exists (select 1 from saved_meals m where m.id = saved_meal_id and m.member_id = auth.uid())
  );
create policy member_delete_own_saved_meal_items on saved_meal_items
  for delete using (
    exists (select 1 from saved_meals m where m.id = saved_meal_id and m.member_id = auth.uid())
  );
create policy platform_admin_all_saved_meal_items on saved_meal_items
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));


-- ============================================================================
-- member_food_favorites
-- A favorited product OR a favorited saved meal — exactly one of
-- product_id/saved_meal_id is set, enforced by a check constraint rather
-- than two separate tables, since "favorite" is one concept with two
-- possible targets and the read path (Part 4's search/recent/frequent UI)
-- wants one query surface.
-- ============================================================================
create table member_food_favorites (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  favorite_type text not null check (favorite_type in ('product', 'saved_meal')),
  product_id uuid references food_products(id),
  saved_meal_id uuid references saved_meals(id) on delete cascade,

  created_at timestamptz not null default now(),

  constraint member_food_favorites_target_check check (
    (favorite_type = 'product' and product_id is not null and saved_meal_id is null) or
    (favorite_type = 'saved_meal' and saved_meal_id is not null and product_id is null)
  )
);

create unique index member_food_favorites_product_idx on member_food_favorites(member_id, product_id) where product_id is not null;
create unique index member_food_favorites_saved_meal_idx on member_food_favorites(member_id, saved_meal_id) where saved_meal_id is not null;

alter table member_food_favorites enable row level security;

create policy member_read_own_food_favorites on member_food_favorites
  for select using (member_id = auth.uid());
create policy member_insert_own_food_favorites on member_food_favorites
  for insert with check (member_id = auth.uid());
create policy member_delete_own_food_favorites on member_food_favorites
  for delete using (member_id = auth.uid());
create policy platform_admin_all_food_favorites on member_food_favorites
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));


-- ============================================================================
-- member_food_log: edit/annotate support for Part 16 (notes, an optional
-- member-taken photo distinct from a Food Lens scan capture, and a
-- "corrected by member" flag so a manually-adjusted log entry is
-- distinguishable from an untouched one without inspecting history).
-- ============================================================================
alter table member_food_log add column notes text;
alter table member_food_log add column photo_storage_path text;
alter table member_food_log add column member_adjusted boolean not null default false;
-- Set only when this entry has neither product_id nor a product-bearing
-- scan behind it — e.g. repeat-logging a saved meal's item that came from
-- a meal-photo detection ("grilled chicken breast") rather than a cached
-- product. product_id stays the source of truth for anything that has one;
-- this is purely a fallback display label, never a fact used by any rules
-- engine.
alter table member_food_log add column manual_label text;


-- ============================================================================
-- pantry_items
-- Part 9, first version — deliberately simple (product requirement §9:
-- "not warehouse-level stock control"). name is a required plain-text
-- fallback so a manual entry never depends on a food_products row ex,
-- product_id is populated when the item came from a barcode/label scan or
-- search so pantry-aware coaching can reuse the same nutrient/ingredient
-- data.
-- ============================================================================
create table pantry_items (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  product_id uuid references food_products(id),
  name text not null,
  quantity_text text,
  category text,
  expiration_date date,
  is_favorite boolean not null default false,
  status text not null default 'active' check (status in ('active', 'used', 'removed')),

  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pantry_items_member_idx on pantry_items(member_id, status, added_at desc);

alter table pantry_items enable row level security;

create policy member_read_own_pantry_items on pantry_items
  for select using (member_id = auth.uid());
create policy member_insert_own_pantry_items on pantry_items
  for insert with check (member_id = auth.uid());
create policy member_update_own_pantry_items on pantry_items
  for update using (member_id = auth.uid());
create policy member_delete_own_pantry_items on pantry_items
  for delete using (member_id = auth.uid());
create policy platform_admin_all_pantry_items on pantry_items
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));


-- ============================================================================
-- restaurant_meal_entries
-- Part 8, first useful version. estimate_basis is the load-bearing column
-- for product requirement §8's "clearly distinguish published nutrition
-- facts / visual estimates / ingredient-based estimates / member-entered
-- information" — every read of `analysis` must be rendered alongside this
-- field, never presented as if it were lab-verified data.
-- ============================================================================
create table restaurant_meal_entries (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  restaurant_name text not null,
  menu_item_name text,
  source text not null check (source in ('search', 'manual_entry', 'menu_photo', 'menu_text', 'meal_photo')),
  scan_id uuid references food_lens_scans(id),
  raw_menu_text text,

  estimate_basis text not null default 'member_entered'
    check (estimate_basis in ('published_nutrition', 'visual_estimate', 'ingredient_estimate', 'member_entered')),
  analysis jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index restaurant_meal_entries_member_idx on restaurant_meal_entries(member_id, created_at desc);

alter table restaurant_meal_entries enable row level security;

create policy member_read_own_restaurant_meal_entries on restaurant_meal_entries
  for select using (member_id = auth.uid());
create policy member_insert_own_restaurant_meal_entries on restaurant_meal_entries
  for insert with check (member_id = auth.uid());
create policy member_update_own_restaurant_meal_entries on restaurant_meal_entries
  for update using (member_id = auth.uid());
create policy member_delete_own_restaurant_meal_entries on restaurant_meal_entries
  for delete using (member_id = auth.uid());
create policy platform_admin_all_restaurant_meal_entries on restaurant_meal_entries
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));


-- ============================================================================
-- weekly_nutrition_reports
-- Part 11. One row per member per ISO-week-ish window (week_start is a
-- member-local Monday date, matching the check-in system's convention
-- elsewhere in this app). status='insufficient_data' rows still get stored
-- (with an empty/minimal report body) so the UI can distinguish "we checked
-- and there wasn't enough" from "we haven't generated this week yet"
-- without recomputing.
-- ============================================================================
create table weekly_nutrition_reports (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  week_start date not null,
  week_end date not null,
  status text not null check (status in ('generated', 'insufficient_data')),
  report jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create unique index weekly_nutrition_reports_member_week_idx on weekly_nutrition_reports(member_id, week_start);

alter table weekly_nutrition_reports enable row level security;

create policy member_read_own_weekly_nutrition_reports on weekly_nutrition_reports
  for select using (member_id = auth.uid());
create policy member_insert_own_weekly_nutrition_reports on weekly_nutrition_reports
  for insert with check (member_id = auth.uid());
create policy platform_admin_all_weekly_nutrition_reports on weekly_nutrition_reports
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
