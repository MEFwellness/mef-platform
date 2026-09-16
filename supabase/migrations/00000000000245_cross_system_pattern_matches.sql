-- The Whole-Body Cross-System Correlation Engine, Prompt 3 of 3: the
-- evaluation ledger behind the matching engine.
--
-- THIS IS NOT A DIAGNOSTIC ENGINE. Nothing below stores a cause, a
-- condition, a diagnosis or a confirmation, and there is no column one
-- could arrive in. A row here says: on this day, this member's stored
-- signals met the thresholds THIS VERSION of a coach's own written
-- definition sets out, and these exact signal rows are the ones that did
-- it. Every word a coach reads about what that may mean is on the
-- relationship version (migration 243), written by her, in association
-- language.
--
-- WHY A LEDGER AT ALL, when the card is computed live. The coach's card
-- is drawn by the same pure matcher every time it is read, so it can
-- never be stale. What a stored row adds is the thing a recomputation
-- cannot: WHICH VERSION was current when the engine last ran, WHICH ROWS
-- contributed on that day, and WHEN that was. A definition edited next
-- month would otherwise erase the record of what last month's evaluation
-- actually read.
--
-- NOTHING HERE IS SCORED, RANKED OR COMBINED WITH A QUESTIONNAIRE. There
-- is no total, no index, no severity and no percentage in this migration.
-- The Body Systems Survey's own percentages and bands are untouched and
-- live where they always have.
--
-- COACH ONLY, AND THE FENCE IS PHYSICAL, exactly as in migrations 240 and
-- 243. Neither table below carries a member policy of any kind, so a
-- member session asking for a row gets none and no screen has to remember
-- not to draw one.
--
-- AND NOBODY WRITES ONE BY HAND. Neither table carries an insert, update
-- or delete policy for ANY role, coach included. The only writer is the
-- trusted connection the engine itself uses, which is reached from one
-- module and is handed drafts built by the matcher from rows read back out
-- of the database. A coach cannot manufacture a match for a member and
-- neither can a hand made request.

-- ---------------------------------------------------------------------
-- 1. One current evaluation, per member, per relationship.
-- ---------------------------------------------------------------------

-- ONE ROW PER PAIR, REPLACED ON RE-EVALUATION. This is the state of a
-- pattern for a member as of the last time the engine ran, not a history
-- of every run: an evaluation that fires on every ingested sitting and
-- every coach entry would otherwise write a row a day forever. The
-- timeline a coach reads is built from the DATED SIGNAL ROWS themselves
-- (migration 240), which are append over time and are the real record.
--
-- A PATTERN THAT NO LONGER MEETS ITS FLOOR HAS ITS ROW DELETED rather
-- than kept with a "no match" flag, because a stored row that means
-- "nothing" is a row every reader has to remember to filter.
create table cross_system_pattern_matches (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  relationship_id uuid not null references cross_system_relationships(id) on delete cascade,

  /* WHICH WORDING THIS MATCH READ. The version row is immutable
     (migration 243 gives it no update policy), so this id is a permanent
     answer to "what did the definition say on the day". version_number is
     copied in beside it for the same reason a stored signal copies its own
     labels in: a reader should not have to join to find out. */
  version_id uuid not null references cross_system_relationship_versions(id) on delete cascade,
  version_number integer not null check (version_number >= 1),

  /* WHICH STRENGTH LEVEL WAS MET, as the level's own key and the label it
     carried on the day. Both are copied rather than joined, because a
     coach renaming a level next year must not rewrite what this
     evaluation found. */
  level_key text not null,
  level_label text not null,

  /* Emerging or Stronger, derived from the level's PLACE in the coach's
     own ladder rather than from its name: the lowest band she defined is
     the emerging one and anything above it is a stronger one. This is what
     decides which of the two fixed display lines a card prints, and it is
     stored so the line a coach was shown can be read back. */
  strength text not null check (strength in ('emerging', 'stronger')),

  /* THE COUNTS THE THRESHOLDS WERE TESTED AGAINST. Plain arithmetic over
     the contributing rows in section 2, stored so the record is readable
     without recomputing it. Not a score: nothing adds these together and
     nothing grades them. */
  supporting_count integer not null check (supporting_count >= 0),
  related_count integer not null check (related_count >= 0),
  distinct_category_count integer not null check (distinct_category_count >= 0),
  source_count integer not null check (source_count >= 0),

  /* WHEN THE ENGINE LAST RAN for this pair, and what made it run. The
     reason is one of the named events rather than free text, because a
     re-evaluation that cannot say what triggered it is not auditable. */
  evaluated_at timestamptz not null default now(),
  evaluated_reason text not null check (
    evaluated_reason in (
      'sitting_ingested',
      'coach_signal_added',
      'relationship_changed',
      'backfill'
    )
  ),

  created_at timestamptz not null default now(),

  /* One current evaluation per pair. An upsert on this pair is what makes
     a re-evaluation a replacement rather than a second opinion. */
  unique (member_id, relationship_id)
);

create index cross_system_pattern_matches_member_idx
  on cross_system_pattern_matches (member_id, evaluated_at desc);

create index cross_system_pattern_matches_relationship_idx
  on cross_system_pattern_matches (relationship_id);

-- ---------------------------------------------------------------------
-- 2. Exactly which signal rows contributed.
-- ---------------------------------------------------------------------

-- THE POINT OF THE WHOLE LEDGER. A match that could not name the rows
-- behind it is an assertion, and this feature's first rule is that a coach
-- can always read the original response. One row here per contributing
-- signal, pointing at the real signal row in cross_system_signals, which
-- carries its own source label, its own capture date and the exact
-- question the member was answering.
--
-- ON DELETE CASCADE ON THE SIGNAL, deliberately. A signal row is never
-- updated (migration 240 gives it no update policy) and is only ever
-- removed when the member herself is, so a contribution pointing at a row
-- that is gone is a contribution about nobody.
create table cross_system_pattern_match_signals (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references cross_system_pattern_matches(id) on delete cascade,
  signal_id uuid not null references cross_system_signals(id) on delete cascade,

  /* Which role in the definition this row answered. The same three roles
     migration 243 uses, and the reason the card can separate what was
     observed from what was found alongside it. */
  role text not null check (role in ('primary', 'related', 'support')),

  /* The component it satisfied, by its position in that version. Enough to
     point back at the exact input a coach wrote without copying her
     wording a second time. */
  component_position integer not null,

  created_at timestamptz not null default now(),

  unique (match_id, signal_id, role)
);

create index cross_system_pattern_match_signals_match_idx
  on cross_system_pattern_match_signals (match_id, role, component_position);

create index cross_system_pattern_match_signals_signal_idx
  on cross_system_pattern_match_signals (signal_id);

-- ---------------------------------------------------------------------
-- 3. Row level security. Coach and administrator may READ. Nobody writes.
-- ---------------------------------------------------------------------

alter table cross_system_pattern_matches enable row level security;
alter table cross_system_pattern_match_signals enable row level security;

-- SELECT ONLY, AND STAFF ONLY. There is deliberately no insert, update or
-- delete policy on either table for any role. The engine writes through
-- the trusted connection, which is the same discipline ingestion uses
-- (lib/cross-system-signals/serviceRole.ts) and for the same reason: a
-- match is written while a MEMBER'S own submit is completing, where no
-- coach session exists at all.
create policy coach_read_cross_system_pattern_matches on cross_system_pattern_matches
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy admin_read_cross_system_pattern_matches on cross_system_pattern_matches
  for select using (public.has_active_role(auth.uid(), 'platform_administrator'));

create policy coach_read_cross_system_pattern_match_signals on cross_system_pattern_match_signals
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy admin_read_cross_system_pattern_match_signals on cross_system_pattern_match_signals
  for select using (public.has_active_role(auth.uid(), 'platform_administrator'));

comment on table cross_system_pattern_matches is
  'Whole-Body Cross-System Correlation Engine, evaluation ledger. NOT A DIAGNOSIS: a row records that a member stored signals met the thresholds of one version of a coach written definition, and when that was last evaluated. COACH ONLY: no member policy exists and none may be added. No role may write; only the engine trusted connection does.';

comment on table cross_system_pattern_match_signals is
  'Exactly which stored signal rows contributed to one evaluation, and in which role. This is what lets a coach read every original response behind a pattern rather than take the pattern on trust.';
