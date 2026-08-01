-- Permanent style law (migration 136): no em dash (—, U+2014) anywhere a
-- member or coach can read text. Migration 136 fixed every already-seeded
-- migration row (a small, enumerable set of questions/phases/rules, each
-- matched by its own stable natural key). This migration covers a
-- different class of violation the 136 sweep couldn't reach: tables where
-- the *code* composes real prose once, at write time, from an
-- already-fixed template, and freezes the result into a row that is never
-- regenerated. Every one of these templates was already fixed in the
-- 2026-08-01 app-code sweep (lib/core-values-snapshot/copy.ts,
-- lib/life-signal-check/copy.ts, lib/brain/copy.ts,
-- lib/recommendation-engine/describeForMember.ts, etc.) — so no row
-- created after that deploy can contain an em dash. But any row a real
-- member's account already had *before* that deploy is unaffected by a
-- code fix; it keeps showing whatever the old template wrote, forever,
-- until updated here. Confirmed by a fresh `supabase db reset`: all 820
-- public-schema text/varchar/jsonb columns come back with zero em dashes
-- except the two known-internal columns (ai_agents.description,
-- ai_rules.description, never rendered to any UI) — so this is purely a
-- historical-production-data problem, not a remaining code gap.
--
-- Unlike 136, this data isn't a small enumerable seed set — it's one row
-- per real member action (a recommendation shown, an experiment started,
-- a coaching message composed, a narrative item written), so there is no
-- natural key to match by hand. Fix: a small local function applied only
-- to columns confirmed to be 100% system-composed (never a member's or
-- coach's own typed words — narrative_items.provenance is explicitly
-- scoped below to exclude 'member_reported'/'coach_entered' rows, and
-- lifestyle_experiments.reflection_text, the member's own written
-- reflection, is deliberately never touched). The function turns each em
-- dash into the same "period, capitalize the next word" shape every real
-- example found in the app used (" — this isn't" -> ". This isn't"),
-- matching exactly how the app-code sweep itself resolved these same
-- templates by hand. It is dropped again at the end of this migration —
-- not a permanent addition to the schema.

create or replace function public.fix_em_dash_temp(input text) returns text as $$
declare
  result text := input;
  idx int;
  before_part text;
  after_part text;
begin
  if input is null or position(chr(8212) in input) = 0 then
    return input;
  end if;
  loop
    idx := position(chr(8212) in result);
    exit when idx = 0;
    before_part := rtrim(substring(result from 1 for idx - 1));
    after_part := ltrim(substring(result from idx + 1));
    result := before_part || '. ' || upper(substring(after_part from 1 for 1)) || substring(after_part from 2);
  end loop;
  return result;
end;
$$ language plpgsql immutable;

-- Recommendation Engine (migration 91) — title/explanation/why_this_was_selected
-- are composed entirely by lib/recommendation-engine/{builder,describeForMember}.ts,
-- never edited by a member or coach.
update member_recommendations
set
  title = public.fix_em_dash_temp(title),
  explanation = public.fix_em_dash_temp(explanation),
  why_this_was_selected = public.fix_em_dash_temp(why_this_was_selected)
where title like '%' || chr(8212) || '%'
   or explanation like '%' || chr(8212) || '%'
   or why_this_was_selected like '%' || chr(8212) || '%';

-- Lifestyle Experiments (migration 92) — Core Values Snapshot's and Life
-- Signal Check's title/protocol are frozen at experiment-start time from
-- buildExperimentTheoryCopy/buildLscExperimentTheoryCopy
-- (app/actions/coreValuesSnapshot.ts, app/actions/lifeSignalCheck.ts).
-- reflection_text (the member's own written reflection) is deliberately
-- excluded — that is the member's own words, not app copy.
update lifestyle_experiments
set
  title = public.fix_em_dash_temp(title),
  protocol = public.fix_em_dash_temp(protocol)
where title like '%' || chr(8212) || '%'
   or protocol like '%' || chr(8212) || '%';

-- Root Coaching Conversation Engine's memory ledger (migration 96) —
-- message_text is, per that migration's own header comment, "composed
-- entirely from already-approved template copy," never member/coach input.
update member_coaching_messages
set message_text = public.fix_em_dash_temp(message_text)
where message_text like '%' || chr(8212) || '%';

-- Member Health Narrative / "What Root Knows So Far" (migration 29) —
-- title/summary are system-composed only for provenance values the
-- engine itself writes ('system_observed', 'inferred',
-- 'confirmed_recurring'). 'member_reported' and 'coach_entered' rows are
-- a real person's own typed words and are deliberately left untouched.
update narrative_items
set
  title = public.fix_em_dash_temp(title),
  summary = public.fix_em_dash_temp(summary)
where provenance in ('system_observed', 'inferred', 'confirmed_recurring')
  and (title like '%' || chr(8212) || '%' or summary like '%' || chr(8212) || '%');

drop function public.fix_em_dash_temp(text);
