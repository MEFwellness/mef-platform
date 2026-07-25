-- WBSA (Whole-Body Systems Assessment) — schema extensions.
--
-- WBSA is the first real content built on the Unified Adaptive Assessment
-- Foundation/Runtime (migrations 98/99), which migration 98's own header
-- comment named as an intended consumer. This migration is purely additive:
-- it extends existing, already-established mechanisms with the small,
-- genuine gaps a real assessment needs, rather than introducing any new
-- table, engine, or pipeline.
--
-- 1. "Prefer not to answer" — unified_assessment_questions never carried
--    this concept (onboarding_questions.allows_prefer_not_to_answer is the
--    only existing precedent). Adding the column is enough: a member's
--    "prefer not to answer" tap writes a shared sentinel AnswerValue (see
--    lib/assessment-runtime/types.ts's PREFER_NOT_TO_ANSWER) that already
--    satisfies "answered" for completeness/progress purposes and never
--    matches any FindingRule — zero runtime logic changes required.
alter table unified_assessment_questions
  add column allows_prefer_not_to_answer boolean not null default false;

-- 2. registry_entries.domain — extended with 7 new whole-body-system
--    domains WBSA needs (immune/circulatory/renal/thyroid-metabolic/
--    neurological/skin/digestive concerns have no honest existing match
--    among posture/movement/breathing/questionnaire/sleep/stress/
--    nutrition/wearable/lab/hormone). Same additive drop/re-add pattern
--    every prior domain-adjacent extension in this file family uses for
--    source_feature checks.
alter table registry_entries drop constraint registry_entries_domain_check;
alter table registry_entries add constraint registry_entries_domain_check
  check (domain in (
    'posture', 'movement', 'breathing', 'questionnaire', 'sleep', 'stress',
    'nutrition', 'wearable', 'lab', 'hormone',
    'digestive', 'metabolic', 'immune', 'circulatory', 'renal', 'neurological', 'dermatological'
  ));

-- 3. safety_classifications.source_feature — extended so a WBSA red-flag
--    answer can call evaluateConcern() under its own, honestly-labeled
--    source rather than being folded into an unrelated existing value.
--    Same additive drop/re-add pattern migrations 31/33/37/63 established.
alter table safety_classifications drop constraint safety_classifications_source_feature_check;
alter table safety_classifications add constraint safety_classifications_source_feature_check
  check (source_feature in (
    'daily_checkin', 'coach_note', 'ai_recommendation', 'daily_feed',
    'dynamic_coaching', 'wellness_intelligence', 'conversation_coach',
    'body_assessment', 'member_wellness_event', 'unified_assessment'
  ));

-- 4. assessment_attempts.source_table — extended so the Unified Runtime
--    can participate in the same cross-assessment attempt ledger every
--    other assessment system already does (status.ts/facts.ts/
--    reassessment-intelligence all read this ledger, via
--    assessment_status_by_member below, to answer "has this member
--    completed X" — without this, WBSA would silently and permanently
--    read back as "not started" everywhere despite real completions).
alter table assessment_attempts drop constraint assessment_attempts_source_table_check;
alter table assessment_attempts add constraint assessment_attempts_source_table_check
  check (source_table in (
    'wellness_assessments', 'primal_pattern_assessments', 'onboarding_submissions',
    'body_assessments', 'unified_assessment_sessions'
  ));

-- 5. Live-sync trigger for unified_assessment_sessions, exactly mirroring
--    the four triggers 00000000000079 already added for the other source
--    tables: fires once, the first time a session's status becomes
--    'completed', and writes a derived snapshot into assessment_attempts.
--    Resolves the catalog-side assessment_definitions.id via
--    unified_assessment_definitions.catalog_definition_id — the exact
--    bridge column migration 98 added "once/if a future assessment
--    registers itself in both places." A session whose definition has no
--    catalog_definition_id set is skipped, not errored (same
--    fail-safe posture as the other four trigger functions' EXCEPTION
--    handler), so this never blocks a completion for a hypothetical future
--    unified-runtime assessment that hasn't been registered in the catalog.
create or replace function public.sync_assessment_attempt_from_unified_assessment_session()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_catalog_definition_id uuid;
  v_is_first boolean;
begin
  if new.status <> 'completed' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'completed' then
    return new;
  end if;

  select catalog_definition_id into v_catalog_definition_id
  from public.unified_assessment_definitions
  where id = new.assessment_definition_id;

  if v_catalog_definition_id is null then
    return new;
  end if;

  select not exists (
    select 1 from public.assessment_attempts
    where member_id = new.member_id and assessment_definition_id = v_catalog_definition_id
  ) into v_is_first;

  insert into public.assessment_attempts (
    member_id, assessment_definition_id, assessment_version,
    attempt_type, status, started_at, completed_at,
    source_table, source_id
  ) values (
    new.member_id, v_catalog_definition_id, new.assessment_version,
    case when v_is_first then 'standard' else 'retake' end,
    'completed', new.started_at, new.completed_at,
    'unified_assessment_sessions', new.id
  )
  on conflict (source_table, source_id) do nothing;

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists sync_assessment_attempt_after_unified_assessment_session on public.unified_assessment_sessions;
create trigger sync_assessment_attempt_after_unified_assessment_session
  after insert or update on public.unified_assessment_sessions
  for each row
  execute function public.sync_assessment_attempt_from_unified_assessment_session();

-- 6. assessment_status_by_member — extended with a unified_assessment_
--    sessions branch in the drafts CTE, same join-through-catalog_
--    definition_id bridge as the trigger above. Completed unified-runtime
--    sessions already reach this view via assessment_attempts (per the
--    trigger above), matching exactly how onboarding-style tables (no
--    native draft concept) already only appear via assessment_attempts.
create or replace view assessment_status_by_member
  with (security_invoker = true)
as
with drafts as (
  select wa.member_id, ad.id as assessment_definition_id, wa.id as attempt_source_id, wa.started_at
  from wellness_assessments wa
  join assessment_definitions ad on ad.key = wa.questionnaire_id
  where wa.status = 'in_progress'

  union all

  select ppa.member_id, ad.id as assessment_definition_id, ppa.id as attempt_source_id, ppa.started_at
  from primal_pattern_assessments ppa
  join assessment_definitions ad on ad.key = ppa.questionnaire_id
  where ppa.status = 'in_progress'

  union all

  select ba.member_id, '6c071b7d-ca9a-4f52-a7c0-87ae69de726b'::uuid as assessment_definition_id, ba.id as attempt_source_id, ba.started_at
  from body_assessments ba
  where ba.completed_at is null

  union all

  select uas.member_id, uad.catalog_definition_id as assessment_definition_id, uas.id as attempt_source_id, uas.started_at
  from unified_assessment_sessions uas
  join unified_assessment_definitions uad on uad.id = uas.assessment_definition_id
  where uas.status = 'in_progress' and uad.catalog_definition_id is not null
),
latest_completed as (
  select distinct on (aa.member_id, aa.assessment_definition_id)
    aa.member_id, aa.assessment_definition_id, aa.id as attempt_id, aa.completed_at
  from assessment_attempts aa
  where aa.status = 'completed'
  order by aa.member_id, aa.assessment_definition_id, aa.completed_at desc
)
select
  coalesce(d.member_id, c.member_id) as member_id,
  coalesce(d.assessment_definition_id, c.assessment_definition_id) as assessment_definition_id,
  case when d.member_id is not null then 'in_progress' else 'completed' end as status,
  c.attempt_id as latest_completed_attempt_id,
  c.completed_at as latest_completed_at
from (
  select distinct member_id, assessment_definition_id from drafts
) d
full outer join latest_completed c
  using (member_id, assessment_definition_id);

comment on view assessment_status_by_member is
  'Read-only. One row per (member, assessment) the member has ever
   interacted with; absent = not started. A current in_progress draft
   always wins over a past completed attempt, matching
   QuestionnaireStatus semantics already used by the generic engine.
   Extended (00000000000100) to include Unified Adaptive Assessment
   Runtime sessions via unified_assessment_definitions.catalog_definition_id.';

-- 7. WBSA's catalog row — same fixed-UUID insert pattern as migration 70.
--    This id MUST match lib/assessment-registry/registry.ts's WBSA
--    entry.databaseId exactly.
insert into assessment_definitions (id, key, display_name, category) values
  ('bfb52589-7566-4347-95aa-03d696a1041e', 'wbsa', 'Whole-Body Systems Assessment', 'whole_body_systems');

insert into assessment_definition_versions (assessment_definition_id, version, notes)
values (
  'bfb52589-7566-4347-95aa-03d696a1041e',
  1,
  'Initial WBSA release on the Unified Adaptive Assessment Runtime.'
);
