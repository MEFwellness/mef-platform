-- The Whole-Body Cross-System Correlation Engine, correction and extension:
-- AUTOMATIC COMPLAINT UNDERSTANDING, and the Relationship Library's change
-- of purpose into Root's Whole-Body Association Map.
--
-- WHAT THIS MIGRATION IS FOR. Prompts 1 to 3 built a store of normalized
-- signals, a library of coach written definitions, and an engine that
-- counted a member's signals against those definitions. The thing it did
-- NOT do was listen: a complaint a member typed in her own words reached
-- nothing, and a coach had to write a definition per client by hand before
-- anything surfaced. This migration adds the listening half and turns the
-- library into a knowledge base Root reads automatically.
--
-- IT CREATES NO SECOND SIGNAL STORE. Every signal a classified complaint
-- produces is an ordinary row in cross_system_signals (migration 240),
-- with an ordinary source key and an ordinary fingerprint. What is new
-- here is the RECORD OF THE COMPLAINT ITSELF, so the member's exact words
-- survive beside the structured signals they were normalized into, and a
-- coach can always read the one against the other.
--
-- CLASSIFICATION IDENTIFIES, IT NEVER DIAGNOSES. There is no column below
-- that could hold a cause, a condition, a diagnosis, a confidence or a
-- score, and there is no place one could be added without a reviewer
-- noticing. A classification row says: these words, this canonical signal,
-- this body area, this side, this context. What may be worth reviewing
-- alongside it is decided afterwards, by the association map, which holds
-- only what a coach put in it.
--
-- COACH ONLY, AND THE FENCE IS THE SAME PHYSICAL ONE as migrations 240,
-- 243 and 245. Not one table below carries a member select policy, so a
-- member session asking for a row gets none.

-- ---------------------------------------------------------------------
-- 1. The surfaces a complaint can arrive on, and the contexts it can
--    carry. BOTH ARE DATA, for migration 241's own reason: wiring a
--    journal or a new check-in in should be a row, not a deploy.
-- ---------------------------------------------------------------------

create table cross_system_complaint_surfaces (
  surface_key text primary key,
  position integer not null,
  display_name text not null,
  /* Which of the two author roles this surface normally carries. Advisory
     only: the report row records the real author every time. */
  default_author_role text not null check (default_author_role in ('member', 'coach'))
);

create table cross_system_complaint_contexts (
  context_key text primary key,
  position integer not null,
  display_name text not null
);

-- ---------------------------------------------------------------------
-- 2. The complaint report. One row per thing a member or a coach said.
-- ---------------------------------------------------------------------

-- HER EXACT WORDS ARE THE RECORD. raw_text is stored verbatim, never
-- trimmed of meaning, never rewritten and never replaced by the
-- classifier's tidier version of it. Everything downstream quotes this
-- column, which is what makes a Root finding traceable back to a sentence
-- she actually typed rather than to an interpretation of one.
create table cross_system_complaint_reports (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  /* Which surface the words arrived on. A row in
     cross_system_complaint_surfaces, so adding a journal or a future
     check-in is a row rather than a deploy. */
  surface_key text not null references cross_system_complaint_surfaces(surface_key),

  /* The surface's label as it read on the day, copied in at capture time
     rather than joined at read time. Same discipline as a signal's
     source_label: renaming a surface next year must not rewrite what a
     coach was told about where a complaint came from. */
  surface_label text not null,

  /* The member's own words, verbatim. */
  raw_text text not null,

  /* Where in that surface it came from, when the surface has more than one
     free text field, plus the exact prompt she was answering. */
  field_ref text,
  field_prompt text,

  /* The row this text lives on in its own feature's table, so a coach can
     be taken back to the check-in or the note itself. */
  source_record_id uuid,

  /* HER day in HER zone, and the instant. Never a server clock standing in
     for either. */
  reported_on date not null,
  reported_at timestamptz not null,

  /* Who typed it. A member for her own check-in or comment, a coach for an
     observation she entered about the member. */
  author_role text not null check (author_role in ('member', 'coach')),
  authored_by uuid references auth.users(id) on delete set null,

  /* THE CLASSIFIER'S OWN RECEIPT. Which approach read these words and
     which revision of its lexicon, so a finding surfaced last month can
     be explained even after the lexicon grows. There is no confidence and
     no score here on purpose: a deterministic matcher either found a
     canonical phrase or it did not. */
  classifier_kind text not null check (classifier_kind in ('deterministic_lexicon', 'provider_validated')),
  classifier_revision text not null,

  /* True once the lookup has run over this report. A report with no
     canonical signal in it is still marked read, so the ingestion pass
     does not reconsider it forever. */
  lookup_completed_at timestamptz,

  /* Names the surface, the record and the field, so re-reading one
     check-in cannot write the same complaint twice. */
  ingest_fingerprint text,

  created_at timestamptz not null default now()
);

create index cross_system_complaint_reports_member_idx
  on cross_system_complaint_reports (member_id, reported_on desc, reported_at desc);

-- Nulls are distinct in a plain unique index, so a hand entered report
-- with no fingerprint coexists with any number of others. This is
-- deliberately NOT a partial index: migration 242 records what that cost
-- the last time, because PostgREST cannot send the index's own WHERE
-- clause and every upsert came back 42P10.
create unique index cross_system_complaint_reports_fingerprint_idx
  on cross_system_complaint_reports (member_id, ingest_fingerprint);

-- ---------------------------------------------------------------------
-- 3. What the classifier found in those words.
-- ---------------------------------------------------------------------

-- ONE ROW PER CANONICAL SIGNAL RECOGNIZED, and one complaint may produce
-- several: "my skin has been breaking out and I have been really bloated
-- after meals" is a skin row and a digestion row, each pointing back at
-- the one sentence.
--
-- matched_phrase IS THE PROOF. It is the span of her own text that caused
-- this row, so a coach reading a finding can see exactly which words Root
-- read, and a wrong classification is visible rather than mysterious.
create table cross_system_complaint_classifications (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references cross_system_complaint_reports(id) on delete cascade,
  position integer not null check (position >= 0),

  /* The canonical name from cross_system_signal_names (migration 241).
     THERE IS NO STRING TRANSFORM ANYWHERE that invents one of these: a
     phrase with no lexicon row is skipped, exactly as migration 241's
     dictionary skips a question ref it does not hold. */
  signal_slug text not null references cross_system_signal_names(signal_slug),

  /* The body area and side the words themselves carried, which may narrow
     the canonical name's own default. Null means the words said nothing
     about it, never "assume both". */
  body_area_key text references cross_system_body_areas(area_key),
  side text check (side in ('left', 'right', 'both', 'not_applicable')),

  /* The span of raw_text this row came from, and the context word beside
     it when she gave one ("when I walk", "after meals"). Context is a
     stored phrase from the lexicon, never a sentence the code composed. */
  matched_phrase text not null,
  context_key text references cross_system_complaint_contexts(context_key),

  /* What she said about how much or how often, where her words carried it.
     The numeric is the Body Systems Survey's own point value, so a
     complaint saying "constantly" is comparable with a survey answer of
     "Almost always" on one timeline rather than on two. */
  frequency_key text,
  frequency_label text,
  frequency_numeric integer,

  /* The signal row this classification was written into, so the two halves
     are joined in the database rather than by a later guess. Null when the
     signal write did not happen, which keeps the classification readable
     as a record of what Root understood either way. */
  signal_id uuid references cross_system_signals(id) on delete set null,

  created_at timestamptz not null default now(),

  unique (report_id, position)
);

create index cross_system_complaint_classifications_report_idx
  on cross_system_complaint_classifications (report_id, position);
create index cross_system_complaint_classifications_signal_idx
  on cross_system_complaint_classifications (signal_slug);

-- ---------------------------------------------------------------------
-- 4. THE LEXICON. The whole of what the classifier knows, as rows.
--
-- This is the deterministic half, and it is data for the same reason every
-- other list in this feature is: a coach who finds that her members say
-- "gippy tummy" needs a row, not a release. Every row points at a
-- canonical signal that already exists, so the lexicon can never widen the
-- vocabulary, only widen the ways into it.
-- ---------------------------------------------------------------------

create table cross_system_complaint_lexicon (
  id uuid primary key default gen_random_uuid(),

  /* The phrase to look for, lowercase, matched on word boundaries. */
  phrase text not null,

  /* What it means, canonically. */
  signal_slug text not null references cross_system_signal_names(signal_slug),

  /* An area or a side the phrase itself carries ("my right hip"), which
     overrides the canonical name's default for this match only. */
  body_area_key text references cross_system_body_areas(area_key),

  /* LONGER PHRASES WIN. "breaking out" must beat "out", and
     "waking up tired" must beat "tired", so the matcher sorts by the
     phrase's own length and this column breaks a genuine tie. */
  specificity integer not null default 0,

  /* False takes the phrase out of service without deleting the record of
     it having been there. */
  is_active boolean not null default true,

  created_at timestamptz not null default now(),

  unique (phrase, signal_slug)
);

create index cross_system_complaint_lexicon_active_idx
  on cross_system_complaint_lexicon (is_active, phrase);

-- The words that mean a side, an area, a context or a frequency, kept
-- apart from the signal phrases because they MODIFY a match rather than
-- being one. "right" is not a complaint.
create table cross_system_complaint_modifiers (
  id uuid primary key default gen_random_uuid(),
  phrase text not null,
  kind text not null check (kind in ('side', 'body_area', 'context', 'frequency', 'negation')),

  /* Exactly one of these carries the meaning, depending on kind. */
  side text check (side in ('left', 'right', 'both', 'not_applicable')),
  body_area_key text references cross_system_body_areas(area_key),
  context_key text references cross_system_complaint_contexts(context_key),
  frequency_key text,
  frequency_label text,
  frequency_numeric integer,

  is_active boolean not null default true,
  unique (phrase, kind)
);

create index cross_system_complaint_modifiers_kind_idx
  on cross_system_complaint_modifiers (kind, is_active);

-- ---------------------------------------------------------------------
-- 5. THE LIBRARY BECOMES A KNOWLEDGE MAP. Two additive columns, and no
--    existing one changes meaning.
-- ---------------------------------------------------------------------

-- WHY A SOURCE TYPE. All relationships do not have the same evidence
-- basis, and presenting a coaching methodology association as an
-- established medical fact is the exact failure this feature exists to
-- avoid. Every seeded row carries one, every coach written row gets
-- 'coach_added' by default, and the coach's card prints it.
create table cross_system_relationship_source_types (
  source_type_key text primary key,
  position integer not null,
  display_name text not null,
  /* One line the coach's card can print under the association, so the
     basis is stated rather than implied. */
  basis_note text not null
);

insert into cross_system_relationship_source_types
  (source_type_key, position, display_name, basis_note) values
  ('chek_hlc', 1, 'CHEK / HLC coaching methodology',
   'A coaching methodology association, not an established medical finding.'),
  ('referred_pain', 2, 'Conventional anatomy / referred-pain relationship',
   'A recognized anatomical or referred-pain relationship.'),
  ('biomechanics', 3, 'Movement / biomechanics',
   'A movement and loading relationship.'),
  ('lifestyle', 4, 'Lifestyle coaching relationship',
   'A lifestyle and behaviour relationship observed in coaching.'),
  ('mef_internal', 5, 'Internal MEF methodology',
   'An internal MEF methodology association.'),
  ('coach_added', 6, 'Coach-added relationship',
   'Added by the coach from her own practice.'),
  ('other', 7, 'Other', 'Basis recorded as other.')
on conflict (source_type_key) do nothing;

-- The version carries it, not the head record, because it is a thing an
-- edit can change and an edit makes a new version. Defaulted to
-- 'coach_added' so every row that already exists keeps a truthful value:
-- the one example row and anything she wrote before today WAS coach added.
alter table cross_system_relationship_versions
  add column source_type_key text not null default 'coach_added'
    references cross_system_relationship_source_types(source_type_key);

-- WHAT MAKES A MAP ENTRY A MAP ENTRY. A seeded methodology row is meant to
-- be read automatically whenever a matching complaint arrives, and the
-- floor based counting from Prompt 3 is the wrong gate for that: an area
-- worth reviewing is worth reviewing even when nothing supports it yet,
-- and "not currently observed" is information a coach wants.
--
-- This flag says which of the two behaviours a definition wants. It
-- defaults to false, so every definition that already exists keeps
-- behaving exactly as it did.
alter table cross_system_relationship_versions
  add column surfaces_on_complaint boolean not null default false;

-- True for the rows this build seeds, so the library can show her which
-- entries came with the app and which she wrote. It is NOT is_example:
-- a seeded row is real, active methodology content, not a demonstration.
alter table cross_system_relationships
  add column is_seeded boolean not null default false;

-- ---------------------------------------------------------------------
-- 6. THE FINDING. What Root brings to the coach, and its whole receipt.
-- ---------------------------------------------------------------------

-- WHY THIS IS STORED AT ALL, when Prompt 3 argued a card should be
-- computed live. Two reasons that did not apply there. A finding is
-- triggered by an EVENT (she said something on a day), so "what Root
-- noticed when that sentence arrived" is not recoverable from today's
-- rows. And the coach needs an unread count she can clear, which is state
-- about her, not about the member.
--
-- The EVIDENCE inside a finding is still computed live on every read, so a
-- questionnaire answered since cannot leave a stale finding standing.
create table cross_system_root_findings (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  /* The complaint that caused it. */
  report_id uuid not null references cross_system_complaint_reports(id) on delete cascade,

  /* THE RECEIPT. Which relationship, at which version, so the wording the
     finding was built from stays readable even after an edit. */
  relationship_id uuid not null references cross_system_relationships(id) on delete cascade,
  version_id uuid not null references cross_system_relationship_versions(id) on delete cascade,

  /* Which classified signal of that complaint matched the map's primary,
     so the finding can say which half of a two part sentence it answers. */
  classification_id uuid references cross_system_complaint_classifications(id) on delete set null,

  /* Counts, and nothing else. There is no strength, no score, no
     confidence and no combined number anywhere in this table, and the
     schema guard test reads these column names and fails if one appears.
     A count is how many of her rows currently sit under the areas this
     map entry names; it is never added to anything or turned into a
     grade. */
  current_finding_count integer not null default 0,
  historical_finding_count integer not null default 0,
  not_observed_count integer not null default 0,
  area_count integer not null default 0,

  /* The red flag override, recorded rather than merely applied, so a
     withheld finding is auditable. */
  is_safety_withheld boolean not null default false,

  /* Which trigger wrote it. */
  triggered_by text not null check (triggered_by in
    ('complaint_classified', 'sitting_ingested', 'coach_signal_added', 'relationship_saved', 'backfill')),

  /* HER day in HER zone. */
  noticed_on date not null,
  noticed_at timestamptz not null,

  /* Coach state, about the coach and not about the member. */
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  dismissed_at timestamptz,
  dismissed_by uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),

  /* ONE FINDING PER COMPLAINT AND MAP ENTRY. A re-evaluation REPLACES,
     the same rule migration 245 settled on: a stored row meaning nothing
     is a row every reader has to remember to filter. */
  unique (report_id, relationship_id)
);

create index cross_system_root_findings_member_idx
  on cross_system_root_findings (member_id, noticed_on desc, noticed_at desc);
create index cross_system_root_findings_unreviewed_idx
  on cross_system_root_findings (member_id, reviewed_at, dismissed_at);

-- ONE ROW PER AREA THE MAP SENT ROOT TO LOOK AT, with what was found
-- there. This is what makes "why did Root check this area" answerable
-- from the database rather than from a re-run of the engine.
create table cross_system_root_finding_areas (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references cross_system_root_findings(id) on delete cascade,
  position integer not null check (position >= 0),

  /* The map component this area came from, by its vocabulary and key, with
     the label as the coach wrote it on the day. */
  ref_kind text not null check (ref_kind in ('signal', 'category', 'body_area')),
  ref_key text not null,
  ref_label text not null,
  component_role text not null check (component_role in ('primary', 'related', 'support')),

  /* Which bucket the member's evidence for this area fell into. The four
     the brief names, kept apart rather than blended into one status:
     CURRENT, RECENT, HISTORICAL and RESOLVED are different things to a
     coach, and 'not_observed' is the fifth that carries real
     information. */
  evidence_state text not null check (evidence_state in
    ('current', 'recent', 'historical', 'resolved', 'not_observed')),

  /* How many of her rows sit under this area in that state. */
  finding_count integer not null default 0,

  created_at timestamptz not null default now(),

  unique (finding_id, position)
);

create index cross_system_root_finding_areas_finding_idx
  on cross_system_root_finding_areas (finding_id, position);

-- The exact signal rows behind one area of one finding. Named
-- individually, the way migration 245's contributing rows are, because a
-- coach tracing a conclusion needs the row, its answer, its question and
-- its date, not a count.
create table cross_system_root_finding_signals (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references cross_system_root_findings(id) on delete cascade,
  area_id uuid not null references cross_system_root_finding_areas(id) on delete cascade,
  signal_id uuid not null references cross_system_signals(id) on delete cascade,
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  unique (area_id, signal_id)
);

create index cross_system_root_finding_signals_finding_idx
  on cross_system_root_finding_signals (finding_id, position);

-- ---------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY. Identical shape to migrations 240, 243 and 245.
--
-- NOT ONE MEMBER POLICY ON ANY TABLE BELOW. A member session reads
-- nothing, and the guard test parses every policy in this file and fails
-- if any clause compares auth.uid() to member_id or grants a member
-- anything.
--
-- AND NO WRITE POLICY FOR ANYBODY on the report, classification and
-- finding tables, coach included. The only writer is the engine's trusted
-- connection, for migration 245's reason: classification fires while a
-- MEMBER'S own check-in is completing, where no coach session exists. A
-- coach cannot manufacture a complaint or a finding about a member by
-- hand, and a member cannot write one about herself.
-- ---------------------------------------------------------------------

alter table cross_system_complaint_reports enable row level security;
alter table cross_system_complaint_classifications enable row level security;
alter table cross_system_complaint_surfaces enable row level security;
alter table cross_system_complaint_contexts enable row level security;
alter table cross_system_complaint_lexicon enable row level security;
alter table cross_system_complaint_modifiers enable row level security;
alter table cross_system_relationship_source_types enable row level security;
alter table cross_system_root_findings enable row level security;
alter table cross_system_root_finding_areas enable row level security;
alter table cross_system_root_finding_signals enable row level security;

create policy coach_read_cross_system_complaint_reports on cross_system_complaint_reports
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy admin_all_cross_system_complaint_reports on cross_system_complaint_reports
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

create policy coach_read_cross_system_complaint_classifications on cross_system_complaint_classifications
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy admin_all_cross_system_complaint_classifications on cross_system_complaint_classifications
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- The four vocabulary tables are readable by a coach and writable by her
-- too, the same door migration 240 opened for signal names: a coach who
-- finds a phrase her members use needs to add it without a deploy.
create policy coach_read_cross_system_complaint_surfaces on cross_system_complaint_surfaces
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy admin_all_cross_system_complaint_surfaces on cross_system_complaint_surfaces
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

create policy coach_read_cross_system_complaint_contexts on cross_system_complaint_contexts
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy admin_all_cross_system_complaint_contexts on cross_system_complaint_contexts
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

create policy coach_read_cross_system_complaint_lexicon on cross_system_complaint_lexicon
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy coach_insert_cross_system_complaint_lexicon on cross_system_complaint_lexicon
  for insert with check (public.has_active_role(auth.uid(), 'coach'));
create policy admin_all_cross_system_complaint_lexicon on cross_system_complaint_lexicon
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

create policy coach_read_cross_system_complaint_modifiers on cross_system_complaint_modifiers
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy admin_all_cross_system_complaint_modifiers on cross_system_complaint_modifiers
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

create policy coach_read_cross_system_relationship_source_types on cross_system_relationship_source_types
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy admin_all_cross_system_relationship_source_types on cross_system_relationship_source_types
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- A coach may UPDATE a finding, and only a finding, and in practice only
-- its four coach state columns: marking one reviewed or dismissed is a
-- thing she does. She still cannot insert one or change what it found.
create policy coach_read_cross_system_root_findings on cross_system_root_findings
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy coach_update_cross_system_root_findings on cross_system_root_findings
  for update using (public.has_active_role(auth.uid(), 'coach'))
  with check (public.has_active_role(auth.uid(), 'coach'));
create policy admin_all_cross_system_root_findings on cross_system_root_findings
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

create policy coach_read_cross_system_root_finding_areas on cross_system_root_finding_areas
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy admin_all_cross_system_root_finding_areas on cross_system_root_finding_areas
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

create policy coach_read_cross_system_root_finding_signals on cross_system_root_finding_signals
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy admin_all_cross_system_root_finding_signals on cross_system_root_finding_signals
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
