-- The Whole-Body Cross-System Correlation Engine, Prompt 2 of 3: the
-- editable Relationship Library. THE DEFINITIONS ONLY.
--
-- NO MATCHING ENGINE IS IN THIS MIGRATION and no pattern card is either.
-- Nothing here reads a member's signals, scores anything, or decides that
-- a member is showing a pattern. That is Prompt 3. What this migration
-- creates is a place for a coach to WRITE DOWN a whole-body relationship
-- she already works with, and a version trail so a later match can record
-- which wording of the definition it matched against.
--
-- THE LIBRARY SHIPS EMPTY. Migration 244 seeds exactly one record, marked
-- as an example and inactive, whose only job is to demonstrate the shape
-- of the form. Nothing in this feature invents, generates, infers or
-- seeds a relationship between two parts of a body. Every real row is
-- typed by the coach, from her own training, and there is no code path
-- anywhere that writes one on her behalf.
--
-- NOTHING IS HARD CODED TO A PAIRING. There is no hip column and no
-- kidney column. A relationship is a list of COMPONENTS, and each
-- component points at one of three things the Signal Library already
-- holds: a standardized signal name, a category (which is what this
-- feature means by a body system), or a body area. Any number of
-- components in any role, so joint to system, muscle to system, skin to
-- digestion, stress to a physical symptom, many systems onto one symptom
-- and one system onto many symptoms are all the same shape.
--
-- COACH ONLY, AND THE FENCE IS PHYSICAL, exactly as in migration 240. Not
-- one table below carries a member select policy, so a member session
-- asking for a row gets none, and no screen has to remember not to draw
-- one.
--
-- A VERSION IS IMMUTABLE. There is no update policy on any of the four
-- version scoped tables. An edit writes a NEW version and moves the head
-- record's pointer, so the wording a match recorded last month is still
-- readable word for word next year.

-- ---------------------------------------------------------------------
-- 1. The head record. One row per relationship, for its whole life.
-- ---------------------------------------------------------------------

-- WHAT IS MUTABLE ABOUT A RELATIONSHIP. Only three things: whether it is
-- active, which version is current, and when it was last touched. Its
-- name, its composition and every word of its coaching text live on a
-- version, because all three are things an edit changes and an edit makes
-- a new version.
create table cross_system_relationships (
  id uuid primary key default gen_random_uuid(),
  /* A stable slug that survives a rename. The pattern's name lives on the
     version, so renaming "Hip and bladder" to something better must not
     break a stored reference to the pattern itself. */
  pattern_key text not null unique,

  /* INACTIVE IS THE DEFAULT, deliberately. A half written definition must
     not be able to surface anywhere the moment it is saved, and the coach
     turns a pattern on when she has decided it is ready. */
  is_active boolean not null default false,

  /* True for the one shipped demonstration record. It exists so the
     editor has something to open on the first day, it is inactive, and it
     is labelled as an example everywhere it is drawn. Nothing reads this
     flag to decide behaviour beyond that label. */
  is_example boolean not null default false,

  /* THE ONLY PLACE THAT SAYS WHICH VERSION IS CURRENT. The version rows
     carry their own number and nothing else about currency, so the two
     can never come to disagree. */
  current_version integer not null default 1 check (current_version >= 1),

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cross_system_relationships_active_idx
  on cross_system_relationships (is_active, pattern_key);

-- ---------------------------------------------------------------------
-- 2. The versions. One row per edit, never rewritten.
-- ---------------------------------------------------------------------

-- EVERY EDIT LANDS HERE AS A NEW ROW. The editor never updates a version,
-- it writes the next one and moves the head's current_version. A later
-- pattern match records this row's id, so "which definition did that
-- match read" has an answer that cannot drift.
--
-- THE FOUR LEVELS THE FORM SEPARATES are the four groups of fields below
-- and the child tables under them:
--   Observed inputs        the components, section 3
--   Pattern composition    min_supporting_signals plus the strength
--                            levels, section 4
--   Possible Association   possible_association_text
--   Coaching Considerations the considerations, section 5
-- Plus evidence_notes, which is the coach's own methodology record and is
-- never shown outside this editor.
create table cross_system_relationship_versions (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references cross_system_relationships(id) on delete cascade,
  version_number integer not null check (version_number >= 1),

  /* The pattern's name as it read in THIS version. */
  pattern_name text not null,

  /* How many supporting signals have to be present before this pattern
     may surface at all. The floor, under every strength level. */
  min_supporting_signals integer not null default 2 check (min_supporting_signals >= 1),

  /* The coach only explanation. Association language only: this describes
     what is observed together and what may be worth exploring, and it is
     never a statement about what causes what. The copy lint in
     tests/cross-system-relationship-copy.test.ts holds that line over the
     shipped strings, and the editor says it in the form. */
  possible_association_text text,

  /* The coach's own evidence and methodology record. Private to her, and
     drawn nowhere but inside this editor. */
  evidence_notes text,

  /* What this edit changed, in her words, shown in the version history
     beside the date. Null on version 1, which changed nothing. */
  change_summary text,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  unique (relationship_id, version_number)
);

create index cross_system_relationship_versions_head_idx
  on cross_system_relationship_versions (relationship_id, version_number desc);

-- ---------------------------------------------------------------------
-- 3. The components. What the pattern is made of.
-- ---------------------------------------------------------------------

-- ONE ROW PER THING THE PATTERN NAMES, in one of three roles.
--
--   primary   the signal, category or body area the pattern starts from.
--               There may be more than one.
--   related   anything observed alongside it. Any number.
--   support   a specific answer or value that counts as support: a
--               particular questionnaire response, or a signal at or above
--               a particular level.
--
-- ref_kind says WHICH VOCABULARY ref_key belongs to, so one table carries
-- a standardized signal name, a category (a body system) and a body area
-- without three columns that are null most of the time.
--
-- REF_KEY IS NOT A FOREIGN KEY, ON PURPOSE, and ref_label is stored beside
-- it. A version is a snapshot of what the coach wrote on the day, exactly
-- as a stored signal copies its own labels in (migration 240). A category
-- renamed next year must not silently rewrite a definition a match has
-- already recorded, and a standardized name retired next year must not
-- delete a row out of the middle of a definition. The editor only ever
-- OFFERS keys that exist in the live vocabularies, which is where that
-- check belongs.
create table cross_system_relationship_components (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references cross_system_relationship_versions(id) on delete cascade,
  position integer not null,

  role text not null check (role in ('primary', 'related', 'support')),
  ref_kind text not null check (ref_kind in ('signal', 'category', 'body_area')),
  ref_key text not null,
  /* The label as it read on the day this version was written. */
  ref_label text not null,

  /* Where on the body, when the coach means one side specifically. Null
     means the component does not care which side. */
  side text check (side in ('left', 'right', 'both', 'not_applicable')),

  /* WHAT COUNTS AS SUPPORT, for a support component. Either a specific
     stored answer (value_key, with the label it read as), or a floor on
     the comparable number a signal carries (min_value_numeric), or
     neither, which means the signal being present at all is enough. */
  value_key text,
  value_label text,
  min_value_numeric numeric,

  /* The instrument and the exact question, when the coach means one
     particular questionnaire response rather than the standardized signal
     in general. All three are stored as they read on the day. */
  source_key text,
  source_question_ref text,
  source_question_prompt text,

  /* One optional line of the coach's own, beside this component. */
  note text,

  created_at timestamptz not null default now()
);

create index cross_system_relationship_components_version_idx
  on cross_system_relationship_components (version_id, role, position);

-- The read Prompt 3 will make: which definitions name this signal at all.
create index cross_system_relationship_components_ref_idx
  on cross_system_relationship_components (ref_kind, ref_key);

-- ---------------------------------------------------------------------
-- 4. The strength rules.
-- ---------------------------------------------------------------------

-- WHAT SEPARATES EMERGING FROM STRONGER, as thresholds rather than as a
-- hard coded ladder. A level is a row, so a coach who wants a third band
-- adds one and a coach who wants only one band keeps one. The two the
-- editor offers by default are Emerging and Stronger, and neither is
-- special to this table.
--
-- EVERY THRESHOLD IS A MINIMUM COUNT, and a null one is a threshold that
-- level does not use.
create table cross_system_relationship_strength_levels (
  version_id uuid not null references cross_system_relationship_versions(id) on delete cascade,
  level_key text not null,
  position integer not null,
  /* What this level is called where a coach reads it. */
  display_label text not null,

  /* How many supporting signals this level needs. */
  min_supporting_signals integer not null check (min_supporting_signals >= 1),
  /* How many DIFFERENT categories those signals have to span, when the
     coach wants a level to mean "more than one system is saying it". */
  min_distinct_categories integer check (min_distinct_categories >= 1),
  /* How many of the related components have to be present. */
  min_related_signals integer check (min_related_signals >= 0),

  created_at timestamptz not null default now(),
  primary key (version_id, level_key)
);

create index cross_system_relationship_strength_levels_order_idx
  on cross_system_relationship_strength_levels (version_id, position);

-- ---------------------------------------------------------------------
-- 5. The coaching considerations.
-- ---------------------------------------------------------------------

-- AN ORDERED LIST OF LINES, and a row rather than an array so the editor
-- can reorder one without rewriting the rest and so a later screen can
-- render them one at a time. Coach facing, association language only, and
-- never a prescription: a consideration is something worth exploring.
create table cross_system_relationship_considerations (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references cross_system_relationship_versions(id) on delete cascade,
  position integer not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index cross_system_relationship_considerations_version_idx
  on cross_system_relationship_considerations (version_id, position);

-- ---------------------------------------------------------------------
-- 6. Row level security. Coach and administrator, and nobody else.
-- ---------------------------------------------------------------------

alter table cross_system_relationships enable row level security;
alter table cross_system_relationship_versions enable row level security;
alter table cross_system_relationship_components enable row level security;
alter table cross_system_relationship_strength_levels enable row level security;
alter table cross_system_relationship_considerations enable row level security;

-- THE HEAD RECORD is the only mutable thing in this feature, and the only
-- things an update may move are its active flag, its current version and
-- its timestamp. Everything else about a relationship is on a version.
create policy coach_read_cross_system_relationships on cross_system_relationships
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy coach_insert_cross_system_relationships on cross_system_relationships
  for insert with check (public.has_active_role(auth.uid(), 'coach'));
create policy coach_update_cross_system_relationships on cross_system_relationships
  for update using (public.has_active_role(auth.uid(), 'coach'))
  with check (public.has_active_role(auth.uid(), 'coach'));
create policy coach_delete_cross_system_relationships on cross_system_relationships
  for delete using (public.has_active_role(auth.uid(), 'coach'));
create policy admin_all_cross_system_relationships on cross_system_relationships
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- A VERSION IS WRITTEN ONCE AND NEVER UPDATED. There is no update policy
-- on this table or on the three below it, and that is the version trail
-- stated in the database rather than in a convention. An edit is a new
-- version; a mistake is a new version too.
create policy coach_read_cross_system_relationship_versions on cross_system_relationship_versions
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy coach_insert_cross_system_relationship_versions on cross_system_relationship_versions
  for insert with check (
    public.has_active_role(auth.uid(), 'coach')
    and created_by = auth.uid()
  );
create policy admin_all_cross_system_relationship_versions on cross_system_relationship_versions
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

create policy coach_read_cross_system_relationship_components on cross_system_relationship_components
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy coach_insert_cross_system_relationship_components on cross_system_relationship_components
  for insert with check (public.has_active_role(auth.uid(), 'coach'));
create policy admin_all_cross_system_relationship_components on cross_system_relationship_components
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

create policy coach_read_cross_system_relationship_levels on cross_system_relationship_strength_levels
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy coach_insert_cross_system_relationship_levels on cross_system_relationship_strength_levels
  for insert with check (public.has_active_role(auth.uid(), 'coach'));
create policy admin_all_cross_system_relationship_levels on cross_system_relationship_strength_levels
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

create policy coach_read_cross_system_relationship_considerations on cross_system_relationship_considerations
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy coach_insert_cross_system_relationship_considerations on cross_system_relationship_considerations
  for insert with check (public.has_active_role(auth.uid(), 'coach'));
create policy admin_all_cross_system_relationship_considerations on cross_system_relationship_considerations
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

comment on table cross_system_relationships is
  'Whole-Body Cross-System Correlation Engine, Relationship Library. COACH ONLY: no member select policy exists and none may be added. Every row is written by a coach. Nothing in this app generates, seeds or infers a relationship. A version is immutable; an edit writes the next one.';

comment on table cross_system_relationship_versions is
  'One immutable snapshot of a relationship definition. A later pattern match records this row id, so the wording it matched against stays readable word for word.';
