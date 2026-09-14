-- Rooted Reset Fuel Pattern Assessment, Build 3 of 4: the meal system.
--
-- WHAT IS NOT HERE, AND THAT IS THE FIRST THING TO SAY. The seventy two
-- meals themselves are not in this migration and never will be. They live
-- in apps/consumer-web-app/lib/fuel-pattern/meals/library.ts as a typed
-- constant, because every word of them is copy a member reads, and the
-- guards that keep an em dash, a prescriptive phrase or a stray digit off
-- her screen walk source files with the TypeScript compiler and cannot see
-- inside a database. Stored coaching content has already been the one
-- place a banned character survived a sweep. The same reasoning put the
-- Health and Lifestyle Intake's questions in a constant.
--
-- So what this migration adds is only what is genuinely per member: what
-- she has said she does not eat, what she has saved, and which meal each
-- of her four slots is currently showing.
--
-- MEAL IDS ARE TEXT, NOT FOREIGN KEYS. The library is code, so there is no
-- meals table for a reference to point at. Every read resolves an id
-- through fpaMealById, which returns null rather than throwing, so an id
-- stored before a content edit removed a meal degrades to "that card is
-- gone" instead of to an error.
--
-- NOTHING HERE IS WRITTEN BY A RENDER. Every one of these tables is
-- written from a route handler behind an explicit tap (a save, a
-- rejection, a swap), never from a page render and never from a Server
-- Action, because the Fuel Pattern result page holds a reveal that a
-- re-render of its own route would replace.

-- ---------------------------------------------------------------------
-- 1) Standing exclusions. A whole class of food, off every card from the
--    moment she records it, through a retake and through a change of
--    pattern.
--
--    is_allergy is the only thing that separates the two kinds, and it
--    separates them for the coach's benefit rather than the engine's:
--    both exclude exactly as hard. Nothing in this system diagnoses,
--    warns or advises about an allergy. It decides which cards to draw.
-- ---------------------------------------------------------------------
create table fuel_meal_exclusions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  -- The vocabulary is closed and it is the same list as
  -- lib/fuel-pattern/meals/preferences.ts FPA_EXCLUSION_KEYS.
  exclusion_key text not null check (exclusion_key in (
    'vegetarian', 'no_dairy', 'no_fish', 'no_eggs', 'no_pork',
    'allergen_nuts', 'allergen_dairy', 'allergen_eggs', 'allergen_fish',
    'allergen_shellfish', 'allergen_gluten', 'allergen_soy'
  )),

  is_allergy boolean not null default false,

  -- The meal she was looking at when she told us. Coach context only.
  source_meal_id text,

  created_at timestamptz not null default now()
);

-- ONE ROW PER EXCLUSION PER MEMBER, ENFORCED BY THE DATABASE. Recording
-- an exclusion is a read then insert from a route handler, and a member
-- tapping twice on a slow connection is a race rather than a mistake.
create unique index fuel_meal_exclusions_one_per_member_key
  on fuel_meal_exclusions (member_id, exclusion_key);

alter table fuel_meal_exclusions enable row level security;

create policy member_read_own_fuel_meal_exclusions on fuel_meal_exclusions
  for select using (member_id = auth.uid());
create policy member_insert_own_fuel_meal_exclusions on fuel_meal_exclusions
  for insert with check (member_id = auth.uid());
create policy member_update_own_fuel_meal_exclusions on fuel_meal_exclusions
  for update using (member_id = auth.uid());
create policy member_delete_own_fuel_meal_exclusions on fuel_meal_exclusions
  for delete using (member_id = auth.uid());
create policy coach_read_assigned_fuel_meal_exclusions on fuel_meal_exclusions
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );
create policy platform_admin_all_fuel_meal_exclusions on fuel_meal_exclusions
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ---------------------------------------------------------------------
-- 2) One meal she does not eat. Permanent, whatever reason she gave and
--    whether or not she gave one: reason is nullable because skipping the
--    sheet is a real answer, not a missing one.
-- ---------------------------------------------------------------------
create table fuel_meal_rejections (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  meal_id text not null,

  reason text check (reason in (
    'dislike', 'vegetarian', 'no_dairy', 'no_fish', 'no_eggs', 'no_pork',
    'allergy', 'other'
  )),
  -- The optional single line under "Other dietary preference". Never required.
  note text,

  created_at timestamptz not null default now()
);

create unique index fuel_meal_rejections_one_per_member_meal
  on fuel_meal_rejections (member_id, meal_id);

alter table fuel_meal_rejections enable row level security;

create policy member_read_own_fuel_meal_rejections on fuel_meal_rejections
  for select using (member_id = auth.uid());
create policy member_insert_own_fuel_meal_rejections on fuel_meal_rejections
  for insert with check (member_id = auth.uid());
create policy member_update_own_fuel_meal_rejections on fuel_meal_rejections
  for update using (member_id = auth.uid());
create policy member_delete_own_fuel_meal_rejections on fuel_meal_rejections
  for delete using (member_id = auth.uid());
create policy coach_read_assigned_fuel_meal_rejections on fuel_meal_rejections
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );
create policy platform_admin_all_fuel_meal_rejections on fuel_meal_rejections
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ---------------------------------------------------------------------
-- 3) Her saved meals.
--
--    pattern_at_save IS THE WHOLE POINT OF THAT COLUMN. A retake can
--    change her reading, and a meal she saved under the old one stays
--    saved. Storing the pattern she held when she saved it is what lets
--    My Meals label it quietly and honestly rather than either dropping
--    it or pretending she saved it under the reading she has now.
-- ---------------------------------------------------------------------
create table fuel_meal_saves (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  meal_id text not null,

  pattern_at_save text not null check (pattern_at_save in (
    'protein_supportive', 'balanced_fuel', 'carb_supportive', 'flexible_fuel'
  )),

  created_at timestamptz not null default now()
);

create unique index fuel_meal_saves_one_per_member_meal
  on fuel_meal_saves (member_id, meal_id);
create index fuel_meal_saves_member_idx
  on fuel_meal_saves (member_id, created_at desc);

alter table fuel_meal_saves enable row level security;

create policy member_read_own_fuel_meal_saves on fuel_meal_saves
  for select using (member_id = auth.uid());
create policy member_insert_own_fuel_meal_saves on fuel_meal_saves
  for insert with check (member_id = auth.uid());
create policy member_delete_own_fuel_meal_saves on fuel_meal_saves
  for delete using (member_id = auth.uid());
create policy coach_read_assigned_fuel_meal_saves on fuel_meal_saves
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );
create policy platform_admin_all_fuel_meal_saves on fuel_meal_saves
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ---------------------------------------------------------------------
-- 4) Where each of her four slots has got to.
--
--    WHY THIS IS STORED AT ALL. Without it, closing the page and coming
--    back would put her in front of the first meal of the set again,
--    including one she had already swapped away from. The brief calls
--    that resetting her to rejected meals, and it is the reason this
--    table exists rather than a session cookie.
--
--    shown_meal_ids is what makes "all six before any repeat" true across
--    a reload rather than only within one sitting.
--
--    pattern is stored so a retake that changes her reading starts the
--    slots again instead of holding a meal from a set she no longer has.
-- ---------------------------------------------------------------------
create table fuel_meal_slot_state (
  member_id uuid not null references auth.users(id) on delete cascade,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),

  pattern text not null check (pattern in (
    'protein_supportive', 'balanced_fuel', 'carb_supportive', 'flexible_fuel'
  )),

  current_meal_id text,
  shown_meal_ids text[] not null default '{}',

  updated_at timestamptz not null default now(),

  primary key (member_id, meal_type)
);

alter table fuel_meal_slot_state enable row level security;

create policy member_read_own_fuel_meal_slot_state on fuel_meal_slot_state
  for select using (member_id = auth.uid());
create policy member_insert_own_fuel_meal_slot_state on fuel_meal_slot_state
  for insert with check (member_id = auth.uid());
create policy member_update_own_fuel_meal_slot_state on fuel_meal_slot_state
  for update using (member_id = auth.uid());
create policy member_delete_own_fuel_meal_slot_state on fuel_meal_slot_state
  for delete using (member_id = auth.uid());
create policy platform_admin_all_fuel_meal_slot_state on fuel_meal_slot_state
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
