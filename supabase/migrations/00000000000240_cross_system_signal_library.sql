-- The Whole-Body Cross-System Correlation Engine, Prompt 1 of 3: the
-- shared Signal Library. THE STORE ONLY. No correlation, no relationship
-- definition and no pattern card is in this migration, and no column here
-- exists for one.
--
-- IT IS A NEW SYSTEM AND IT IS NOT EITHER OF THE TWO THINGS ITS NAME
-- SOUNDS LIKE. The app already holds the Rooted Reset Whole-Body Signal
-- Assessment (migrations 225 to 228, tables prefixed
-- whole_body_signal_) and the older Whole-Body Check-In in the assessment
-- registry. Neither is read, written, renamed or retired here. Every
-- table below is prefixed cross_system_ so a future reader grepping for
-- whole_body_signal_ finds that instrument and only that instrument, and
-- a reader grepping for cross_system_ finds this library and only this
-- library. In coach facing words this library and its rows are called
-- "Signals".
--
-- COACH ONLY, PERMANENTLY, AND THE FENCE IS PHYSICAL. Not one table below
-- carries a member select policy, so a member session asking for a row
-- directly gets none, exactly the way the Signal Assessment's Zone layer
-- is fenced (migration 225). Nothing in this feature may ever reach a
-- member screen or a member API payload, and the way that is guaranteed
-- is that her session cannot read the rows at all rather than that every
-- screen remembers not to draw them.
--
-- WHO WRITES A ROW. Two callers, and only two.
--   a coach, through her own session, which the insert policy below
--     allows for a member she is actively assigned to;
--   ingestion, when a sitting completes, through the trusted service role
--     connection this app already uses for writes no session has a policy
--     for (lib/coaching-direction/serviceRole.ts states the precedent).
--     A member's own session has no insert policy here, so a hand made
--     POST from her browser cannot manufacture a signal about herself.
--
-- APPEND OVER TIME, NEVER OVERWRITE. A new sitting and a new coach entry
-- each write a new dated row, so a timeline per signal exists from the
-- first row onward. There is no update policy on cross_system_signals at
-- all: a stored signal is a record of what was true on the day it was
-- captured, and editing one would rewrite history that a later
-- correlation pass will read.
--
-- EVERY LIST IS DATA. Categories, body areas, symptom words, the
-- standardized signal names and the map from a source's own question ids
-- to those names are rows, not enums in TypeScript, so a coach adding
-- "Jaw clicking" or wiring up a new assessment needs no deploy. The three
-- things that are check constraints rather than tables are side, the kind
-- of value a row carries and the entry mode, because each of those is a
-- shape the reading code must handle exhaustively and a new one is a code
-- change by definition.

-- ---------------------------------------------------------------------
-- 1. The vocabularies.
-- ---------------------------------------------------------------------

-- What kind of thing a signal is about. The coach's list groups by this.
create table cross_system_signal_categories (
  category_key text primary key,
  position integer not null,
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index cross_system_signal_categories_position_idx
  on cross_system_signal_categories (position);

-- Where on the body, when a signal has a where. Nullable on a signal, and
-- most system level signals have none.
create table cross_system_body_areas (
  area_key text primary key,
  position integer not null,
  display_name text not null,
  /* True when Left / Right is a sensible question for this area, so the
     coach's entry tool can skip the side selector for "whole body". It
     changes no arithmetic and gates no write: side stays nullable and
     'not_applicable' is always allowed. */
  takes_side boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index cross_system_body_areas_position_idx
  on cross_system_body_areas (position);

-- The symptom words the coach's tap flow offers (pain, stiffness,
-- clicking, snapping, and the rest). A row here is a WORD, not a signal:
-- the coach taps an area and a word, and the tool composes the
-- standardized name from the two.
create table cross_system_symptom_types (
  symptom_key text primary key,
  position integer not null,
  display_name text not null,
  /* The lowercase form used when a name is composed from an area and this
     word ("Hip clicking"). Stored rather than derived, because a display
     name is a label and a composed phrase is grammar, and lowercasing a
     label is how a tool ends up writing "Hip reduced range of motion". */
  phrase text not null,
  default_category_key text references cross_system_signal_categories(category_key),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index cross_system_symptom_types_position_idx
  on cross_system_symptom_types (position);

-- ---------------------------------------------------------------------
-- 2. The standardized signal names.
-- ---------------------------------------------------------------------

-- ONE ROW PER THING THE BODY CAN BE SAYING, whatever asked about it.
--
-- This is what makes the library shared rather than five parallel piles.
-- "Cold hands or feet" is one row, and the Body Systems Survey's T2, its
-- H9 and the Breathing Pattern Check-In's cold_hands_feet all map onto it
-- (section 3 below), so a coach opening that signal reads one timeline
-- across three instruments instead of three signals that happen to mean
-- the same thing.
--
-- is_coach_addable decides whether the coach's search field offers it. An
-- instrument level row like "Breathing pattern total score" is a real
-- signal and a real timeline, and it is not something a coach types in
-- mid conversation.
create table cross_system_signal_names (
  signal_slug text primary key,
  display_name text not null,
  category_key text not null references cross_system_signal_categories(category_key),
  /* The area this name is inherently about, when it has one. A coach
     entered signal may still name a different area: this is the default
     the tool offers, not a constraint. */
  default_body_area_key text references cross_system_body_areas(area_key),
  /* The symptom word this name is inherently about, when it has one. Same
     status as default_body_area_key. */
  default_symptom_key text references cross_system_symptom_types(symptom_key),
  /* Extra words the coach's search matches on, so "wee" finds "Frequent
     urination" and "clicking" finds "Hip clicking or snapping". */
  search_terms text not null default '',
  is_coach_addable boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cross_system_signal_names_category_idx
  on cross_system_signal_names (category_key, display_name);

-- ---------------------------------------------------------------------
-- 3. Where signals come from, and how each source's own ids map in.
-- ---------------------------------------------------------------------

-- One row per registered source. The human readable label is stored here
-- and COPIED ONTO EVERY SIGNAL at capture time, so renaming a source
-- tomorrow never rewrites what a coach was told last month about where a
-- row came from.
create table cross_system_signal_sources (
  source_key text primary key,
  position integer not null,
  display_name text not null,
  /* The assessment this source is, when it is one. Null for the coach and
     for the daily check-in, neither of which is a catalog assessment. */
  assessment_definition_id uuid references assessment_definitions(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index cross_system_signal_sources_position_idx
  on cross_system_signal_sources (position);

-- The adapter's dictionary: one source's own key for something (a
-- question_ref, an item id, a finding type, a section key) to the
-- standardized signal it means.
--
-- AN UNMAPPED KEY IS SKIPPED, NEVER GUESSED AT. That is the whole reason
-- this is a table a human fills in rather than a string transform: an
-- adapter that invented a signal name from a question it had never been
-- told about would be putting words in a member's mouth.
--
-- external_kind says what sort of key external_key is, so one source can
-- map both its section rollups and its individual answers without the two
-- colliding.
create table cross_system_signal_source_map (
  source_key text not null references cross_system_signal_sources(source_key) on delete cascade,
  external_kind text not null check (external_kind in (
    'section', 'question', 'item', 'finding_type', 'metric'
  )),
  external_key text not null,
  signal_slug text not null references cross_system_signal_names(signal_slug) on delete cascade,
  /* Overrides the name's own default when this particular question is
     about a particular place ("My lower back aches" is low back, even
     though the name it maps to could be used elsewhere). */
  body_area_key text references cross_system_body_areas(area_key),
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_key, external_kind, external_key)
);

create index cross_system_signal_source_map_slug_idx
  on cross_system_signal_source_map (signal_slug);

-- ---------------------------------------------------------------------
-- 4. The store.
-- ---------------------------------------------------------------------

-- ONE ROW IS ONE DATED OBSERVATION OF ONE SIGNAL FOR ONE MEMBER.
--
-- signal_name, category_key, source_label and source_question_prompt are
-- all copied in at capture time rather than joined at read time, on
-- purpose. A signal row has to stay readable as what it meant on the day
-- it was written: a renamed category or a reworded question must not
-- silently rewrite a year of history, and a coach looking at a timeline
-- has to be able to see the exact words the member was answering.
-- signal_slug still points at the library, so the timeline for a signal
-- is one query.
create table cross_system_signals (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  -- WHAT IT IS.
  signal_slug text not null references cross_system_signal_names(signal_slug),
  -- The standardized label as it read on the day of capture.
  signal_name text not null,
  category_key text not null references cross_system_signal_categories(category_key),
  body_area_key text references cross_system_body_areas(area_key),
  symptom_key text references cross_system_symptom_types(symptom_key),
  side text check (side in ('left', 'right', 'both', 'not_applicable')),

  -- WHAT IT SAID. Deliberately flexible, because the sources disagree
  -- about what an answer even is: a five point scale word, a band name, a
  -- percentage, a severity, an instrument total, or a coach's tap.
  --
  -- value_label is what a coach reads and it is never null. value_key is
  -- the machine slug behind it when there is one. value_numeric carries
  -- the comparable number when there is one, so Prompt 3 has something to
  -- correlate on without re-deriving it from a word.
  value_kind text not null check (value_kind in (
    'scale', 'band', 'severity', 'score', 'percent', 'presence', 'coach_tap'
  )),
  value_label text not null,
  value_key text,
  value_numeric numeric,

  -- WHERE IT CAME FROM, AND EXACTLY WHICH ANSWER.
  source_key text not null references cross_system_signal_sources(source_key),
  source_label text not null,
  -- The sitting, the assessment or the check-in row this came out of.
  source_session_id uuid,
  -- The question, item, finding type or section key inside that sitting.
  source_question_ref text,
  -- The exact stimulus she answered, stored so the original answer can
  -- always be shown even after the instrument is reworded.
  source_question_prompt text,
  -- A specific record where the source has one beside the sitting (a
  -- posture finding row, for instance).
  source_record_id uuid,

  -- WHEN. captured_on is a bare local day, the one a coach reads and the
  -- one a timeline sorts by. captured_at is the instant behind it.
  captured_on date not null,
  captured_at timestamptz not null,

  note text,

  -- WHO, for a coach entry. Null for every ingested row.
  entered_by uuid references auth.users(id) on delete set null,
  entry_mode text not null default 'ingested' check (entry_mode in ('ingested', 'coach_entered')),

  -- WHAT MAKES RE-INGESTION SAFE. One string naming the source, the
  -- sitting and the thing inside it. Running ingestion twice over the
  -- same completed sitting, which a backfill and a retried submit both
  -- do, writes nothing the second time. A NEW sitting has a new id and
  -- therefore a new fingerprint, which is what keeps the library
  -- append over time rather than idempotent per signal.
  --
  -- Null on a coach entry, on purpose: a coach recording the same thing
  -- twice in one day is recording it twice, and the tool must not
  -- silently swallow the second one.
  ingest_fingerprint text,

  created_at timestamptz not null default now()
);

create unique index cross_system_signals_fingerprint_idx
  on cross_system_signals (member_id, ingest_fingerprint)
  where ingest_fingerprint is not null;

-- The coach's list: this member, newest first.
create index cross_system_signals_member_idx
  on cross_system_signals (member_id, captured_on desc, created_at desc);

-- One signal's own timeline, and the read Prompt 3 will make.
create index cross_system_signals_member_slug_idx
  on cross_system_signals (member_id, signal_slug, captured_on desc);

-- ---------------------------------------------------------------------
-- 5. Row level security. Coach and administrator, and nobody else.
-- ---------------------------------------------------------------------

alter table cross_system_signal_categories enable row level security;
alter table cross_system_body_areas enable row level security;
alter table cross_system_symptom_types enable row level security;
alter table cross_system_signal_names enable row level security;
alter table cross_system_signal_sources enable row level security;
alter table cross_system_signal_source_map enable row level security;
alter table cross_system_signals enable row level security;

-- The vocabularies hold no member data, and a coach needs all of them to
-- draw the entry tool. THERE IS STILL NO MEMBER POLICY, because a member
-- has no reason to hold a list of the words this library files her in.
create policy coach_read_cross_system_categories on cross_system_signal_categories
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy admin_all_cross_system_categories on cross_system_signal_categories
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

create policy coach_read_cross_system_body_areas on cross_system_body_areas
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy admin_all_cross_system_body_areas on cross_system_body_areas
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

create policy coach_read_cross_system_symptom_types on cross_system_symptom_types
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy admin_all_cross_system_symptom_types on cross_system_symptom_types
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

create policy coach_read_cross_system_signal_names on cross_system_signal_names
  for select using (public.has_active_role(auth.uid(), 'coach'));
-- THE LIBRARY GROWS FROM THE COACH'S OWN TOOL, and that is why this one
-- vocabulary table has a coach insert policy while the others do not. A
-- coach taps Hip and Clicking, and if "Hip clicking" is not yet a
-- standardized name it becomes one, once, and every later entry and every
-- later search finds it. The alternative was seeding every body area
-- crossed with every symptom word, four hundred and sixty rows most of
-- which are nonsense ("Throat instability"), so the library would have
-- been mostly noise on the day it shipped.
--
-- Insert only. A coach cannot rename or retire a standardized name,
-- because a rename would silently re-label a stored signal and a retire
-- would orphan one.
create policy coach_insert_cross_system_signal_names on cross_system_signal_names
  for insert with check (public.has_active_role(auth.uid(), 'coach'));
create policy admin_all_cross_system_signal_names on cross_system_signal_names
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

create policy coach_read_cross_system_sources on cross_system_signal_sources
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy admin_all_cross_system_sources on cross_system_signal_sources
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

create policy coach_read_cross_system_source_map on cross_system_signal_source_map
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy admin_all_cross_system_source_map on cross_system_signal_source_map
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- THE STORE ITSELF. A coach reads and writes only for a member she is
-- actively assigned to, which is the same test every other coach scoped
-- policy in this app uses (migrations 16 and 28).
create policy coach_read_assigned_cross_system_signals on cross_system_signals
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_insert_assigned_cross_system_signals on cross_system_signals
  for insert with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
    and entry_mode = 'coach_entered'
    and entered_by = auth.uid()
    and ingest_fingerprint is null
  );

create policy admin_all_cross_system_signals on cross_system_signals
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- NO UPDATE POLICY ANYWHERE ON THIS TABLE, and that is the append over
-- time rule stated in the database rather than in a convention. A coach
-- who taps the wrong thing deletes her own row and enters another one.
create policy coach_delete_own_cross_system_signals on cross_system_signals
  for delete using (
    public.has_active_role(auth.uid(), 'coach')
    and entered_by = auth.uid()
    and entry_mode = 'coach_entered'
  );

-- Same narrow test account escape hatch migrations 151, 189, 190, 220,
-- 225, 230 and 231 give their own tables: a verification pass has to be
-- able to see a signal arrive more than once and leave production clean
-- afterwards. It deletes INGESTED rows for a seeded test member only.
create policy test_member_cleanup_cross_system_signals on cross_system_signals
  for delete using (
    exists (select 1 from profiles p where p.id = cross_system_signals.member_id and p.is_test = true)
    and (
      public.has_active_role(auth.uid(), 'coach')
      or public.has_active_role(auth.uid(), 'platform_administrator')
    )
  );

comment on table cross_system_signals is
  'Whole-Body Cross-System Correlation Engine, shared Signal Library. COACH ONLY: no member select policy exists and none may be added. Append over time, never updated. Not the Rooted Reset Whole-Body Signal Assessment (whole_body_signal_*) and not the Whole-Body Check-In.';
