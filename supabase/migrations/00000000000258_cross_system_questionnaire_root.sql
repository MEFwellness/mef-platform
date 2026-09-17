-- Root hears the Body Systems Survey.
--
-- Until this migration Root Noticed could only be reached by a sentence: a
-- finding had to name the complaint report that caused it. The Body Systems
-- Survey already fills the Signal Library at the question level (migration
-- 241's dictionary maps all 111 of its questions to canonical signals), so
-- a member who answered that headaches happen Often had a real headache
-- signal on her timeline and Root never consulted the Association Map about
-- it, because nothing she TYPED said so.
--
-- WHAT THIS ADDS, AND WHAT IT DELIBERATELY DOES NOT.
--
--   1. A Root finding may now be caused by a completed survey sitting
--      instead of a complaint report. Same table, same areas, same row
--      links, same review state, same safety flag. There is no second
--      findings store.
--   2. A small table naming WHICH signal rows triggered a finding, so a
--      coach can trace a finding back to the exact survey answers behind
--      it rather than to "the survey".
--   3. The question to signal mapping becomes editable by a coach and
--      versioned, through the same append only discipline the Relationship
--      Library uses: an edit writes the next revision and then moves the
--      head, and no revision is ever rewritten.
--
--   NOT A NEW SIGNAL STORE. Survey answers are still ordinary rows in
--     cross_system_signals written by the existing adapter.
--   NOT A NEW INTERPRETATION ENGINE. Whether an answer counts as an active
--     signal is decided by one deterministic rule in
--     lib/cross-system-signals/questionnaireRules.ts, and what Root checks
--     for it comes only from the existing Association Map.
--   NOT A NEW SIGNAL NAME. No row is added to cross_system_signal_names.
--   NOTHING MEMBER FACING. No table below carries a member policy of any
--     kind, and no survey table, score, band or result is touched.

-- ---------------------------------------------------------------------
-- 1. A finding may be caused by a survey sitting.
-- ---------------------------------------------------------------------

alter table cross_system_root_findings
  alter column report_id drop not null;

-- The source and the sitting that caused a survey finding. Both null on a
-- complaint finding, both set on a survey finding, and never one without
-- the other (the check below).
alter table cross_system_root_findings
  add column source_key text references cross_system_signal_sources(source_key);

alter table cross_system_root_findings
  add column source_session_id uuid;

-- A stable description of what the finding contained when it was written:
-- the map entry version, the trigger rows, and every area's state and rows.
-- It lets a re-run over the same sitting recognise that nothing changed and
-- write nothing, which is what makes the backfill idempotent down to the
-- row ids rather than merely "the same number of rows".
alter table cross_system_root_findings
  add column evidence_digest text;

-- Which revision of the survey signal rule decided the triggers, so a
-- finding written under one set of thresholds stays explainable after the
-- thresholds are retuned.
alter table cross_system_root_findings
  add column rule_revision text;

-- EXACTLY ONE CAUSE. A complaint finding names its report; a survey finding
-- names its source and sitting. A row naming both, or neither, is refused.
alter table cross_system_root_findings
  add constraint cross_system_root_findings_one_cause check (
    (report_id is not null and source_key is null and source_session_id is null)
    or
    (report_id is null and source_key is not null and source_session_id is not null)
  );

-- ONE FINDING PER SITTING AND MAP ENTRY, the survey twin of the existing
-- unique (report_id, relationship_id). Not partial: a complaint finding
-- carries nulls here, and nulls are distinct in a unique index.
create unique index cross_system_root_findings_sitting_idx
  on cross_system_root_findings (member_id, source_key, source_session_id, relationship_id);

-- The widened trigger list stays exactly what it was: a survey finding is
-- written either when a sitting is ingested or by the backfill, and both
-- values were already allowed by migration 246.

-- ---------------------------------------------------------------------
-- 2. Which signal rows triggered a finding.
-- ---------------------------------------------------------------------

-- A complaint finding is triggered by the rows one sentence produced, and
-- the classification table already joins those. A survey finding can be
-- triggered by several answers at once (a Digestion system entry is reached
-- by bloating, gas and heartburn together), so the rows are named here, one
-- per row, rather than squeezed into a single column.
create table cross_system_root_finding_triggers (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references cross_system_root_findings(id) on delete cascade,
  signal_id uuid not null references cross_system_signals(id) on delete cascade,
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  unique (finding_id, signal_id)
);

create index cross_system_root_finding_triggers_finding_idx
  on cross_system_root_finding_triggers (finding_id, position);

create index cross_system_root_finding_triggers_signal_idx
  on cross_system_root_finding_triggers (signal_id);

alter table cross_system_root_finding_triggers enable row level security;

-- COACH READ, ADMIN ALL, AND NOBODY ELSE. The only writer is the trusted
-- connection, for migration 246's reason: a survey finding is written while
-- the MEMBER'S own submit is completing, where no coach session exists.
create policy coach_read_cross_system_root_finding_triggers on cross_system_root_finding_triggers
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy admin_all_cross_system_root_finding_triggers on cross_system_root_finding_triggers
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

comment on table cross_system_root_finding_triggers is
  'Root Noticed: the signal rows that triggered one finding. COACH ONLY: no member policy exists and none may be added.';

-- ---------------------------------------------------------------------
-- 3. The survey question to signal mapping, editable and versioned.
-- ---------------------------------------------------------------------

-- The head row keeps the revision it currently reflects and who last moved
-- it. Both carry defaults, so every existing dictionary row stays valid.
alter table cross_system_signal_source_map
  add column revision_number integer not null default 1 check (revision_number >= 1);

alter table cross_system_signal_source_map
  add column updated_by uuid references auth.users(id) on delete set null;

-- ONE ROW PER REVISION, NEVER REWRITTEN. Every field a coach can change is
-- stored whole on each revision, so "what did this question map to in
-- March" is a query rather than a reconstruction, and a revision can be
-- compared with the one below it on the screen.
create table cross_system_signal_source_map_revisions (
  id uuid primary key default gen_random_uuid(),
  source_key text not null references cross_system_signal_sources(source_key) on delete cascade,
  external_kind text not null check (external_kind in (
    'section', 'question', 'item', 'finding_type', 'metric'
  )),
  external_key text not null,
  revision_number integer not null check (revision_number >= 1),
  signal_slug text not null references cross_system_signal_names(signal_slug),
  body_area_key text references cross_system_body_areas(area_key),
  is_active boolean not null,
  -- The coach's own one line reason, or the seed's note on revision 1.
  change_note text,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  unique (source_key, external_kind, external_key, revision_number)
);

create index cross_system_signal_source_map_revisions_key_idx
  on cross_system_signal_source_map_revisions (source_key, external_kind, external_key, revision_number desc);

alter table cross_system_signal_source_map_revisions enable row level security;

create policy coach_read_cross_system_signal_source_map_revisions on cross_system_signal_source_map_revisions
  for select using (public.has_active_role(auth.uid(), 'coach'));

-- A coach may APPEND a revision for a Body Systems Survey question, signed
-- by herself. There is no coach update or delete policy on this table at
-- all, which is the append only rule stated in the database.
create policy coach_insert_cross_system_signal_source_map_revisions on cross_system_signal_source_map_revisions
  for insert with check (
    public.has_active_role(auth.uid(), 'coach')
    and changed_by = auth.uid()
    and source_key = 'body_systems_survey'
    and external_kind = 'question'
  );

create policy admin_all_cross_system_signal_source_map_revisions on cross_system_signal_source_map_revisions
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- A coach may MOVE THE HEAD of a Body Systems Survey question's mapping,
-- and only that. She cannot insert a dictionary row for another source,
-- cannot delete one (switching it off is how a mapping is retired, so the
-- record of it having existed stays), and cannot touch another source's
-- dictionary at all.
create policy coach_update_body_systems_cross_system_source_map on cross_system_signal_source_map
  for update using (
    public.has_active_role(auth.uid(), 'coach')
    and source_key = 'body_systems_survey'
    and external_kind = 'question'
  )
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and source_key = 'body_systems_survey'
    and external_kind = 'question'
    and updated_by = auth.uid()
  );

comment on table cross_system_signal_source_map_revisions is
  'Signal Library: every revision of a source question to canonical signal mapping. Append only. COACH ONLY: no member policy exists and none may be added.';

-- REVISION 1 FOR EVERY SURVEY QUESTION, taken from the dictionary exactly
-- as it stands, so the history of every mapping starts at the mapping in
-- force rather than at the first edit. Re-running this inserts nothing.
insert into cross_system_signal_source_map_revisions
  (source_key, external_kind, external_key, revision_number, signal_slug, body_area_key, is_active, change_note, changed_by)
select
  map.source_key,
  map.external_kind,
  map.external_key,
  map.revision_number,
  map.signal_slug,
  map.body_area_key,
  map.is_active,
  'The mapping as first authored in the Signal Library content.',
  null
from cross_system_signal_source_map map
where map.source_key = 'body_systems_survey'
  and map.external_kind = 'question'
on conflict (source_key, external_kind, external_key, revision_number) do nothing;
