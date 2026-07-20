-- Backfill assessment_attempts from real, already-stored evidence only.
--
-- Scope rule applied throughout: only COMPLETED attempts are backfilled.
-- No completion is invented for an in_progress draft, and no field is
-- populated without a real source column to copy it from — see each
-- block below for exactly which columns feed which.
--
-- Idempotent: `on conflict (source_table, source_id) do nothing`, so
-- re-running this migration (or partially failing and retrying) never
-- creates duplicate ledger rows.

-- 1. CHEK HLC1 + Four Doctors, from wellness_assessments. questionnaire_id
--    resolves the assessment_definition (both already share this table).
--    First completed attempt per member+questionnaire -> 'standard',
--    every later one -> 'retake', ordered by completed_at (real
--    chronological evidence, not assumed).
insert into assessment_attempts (
  member_id, assessment_definition_id, assessment_version,
  attempt_type, status, started_at, completed_at,
  calculated_score, result_classification, result_payload,
  source_table, source_id
)
select
  wa.member_id,
  ad.id,
  wa.questionnaire_version,
  case when row_number() over (
    partition by wa.member_id, wa.questionnaire_id order by wa.completed_at asc
  ) = 1 then 'standard' else 'retake' end,
  'completed',
  wa.started_at,
  wa.completed_at,
  wa.total_score,
  wa.total_priority,
  jsonb_build_object('total_score', wa.total_score, 'total_max_score', wa.total_max_score, 'total_priority', wa.total_priority),
  'wellness_assessments',
  wa.id
from wellness_assessments wa
join assessment_definitions ad on ad.key = wa.questionnaire_id
where wa.status = 'completed'
on conflict (source_table, source_id) do nothing;

-- 2. Primal Pattern, from primal_pattern_assessments. Same first-vs-later
--    'standard'/'retake' rule as above. No numeric score exists for this
--    instrument (it's a rule-based classification, not a point sum), so
--    calculated_score stays null — result_classification/result_payload
--    carry the real stored classification and counts instead.
insert into assessment_attempts (
  member_id, assessment_definition_id, assessment_version,
  attempt_type, status, started_at, completed_at,
  result_classification, result_payload,
  source_table, source_id
)
select
  ppa.member_id,
  ad.id,
  ppa.questionnaire_version,
  case when row_number() over (
    partition by ppa.member_id, ppa.questionnaire_id order by ppa.completed_at asc
  ) = 1 then 'standard' else 'retake' end,
  'completed',
  ppa.started_at,
  ppa.completed_at,
  ppa.result,
  jsonb_build_object('a_count', ppa.a_count, 'b_count', ppa.b_count, 'skipped_count', ppa.skipped_count, 'both_count', ppa.both_count),
  'primal_pattern_assessments',
  ppa.id
from primal_pattern_assessments ppa
join assessment_definitions ad on ad.key = ppa.questionnaire_id
where ppa.status = 'completed'
on conflict (source_table, source_id) do nothing;

-- 3. Onboarding, from onboarding_submissions. This table has no
--    in_progress concept at all — a row only ever exists once a
--    submission has been made (submit_onboarding() inserts everything in
--    one transaction), so every row is a completed attempt by
--    construction. No separate "start time" is recorded upstream, so
--    started_at and completed_at both use submitted_at (the one real
--    timestamp that exists) rather than inventing a distinct start time.
--    assessment_type baseline/reassessment maps to attempt_type
--    baseline/retake — 'retake' because, like the generic engine,
--    onboarding's reassessment is unlimited and member-initiated with no
--    staged midpoint/final structure, making 'retake' the closest fit
--    among the Attempt model's five values (documented here since it's
--    not a literal name match).
insert into assessment_attempts (
  member_id, assessment_definition_id, assessment_version,
  attempt_type, status, started_at, completed_at,
  source_table, source_id
)
select
  os.user_id,
  '6b86f205-a75b-452f-b926-4c5dffc29baa',
  av.assessment_version,
  case when os.assessment_type = 'baseline' then 'baseline' else 'retake' end,
  'completed',
  os.submitted_at,
  os.submitted_at,
  'onboarding_submissions',
  os.id
from onboarding_submissions os
join onboarding_assessment_versions av on av.id = os.assessment_version_id
on conflict (source_table, source_id) do nothing;

-- 4. Body Assessment, from body_assessments. Only rows with a real
--    completed_at are backfilled — in_progress/submitted/not_configured
--    rows have no completion evidence and are left out entirely (per
--    guardrail: do not mark a member complete without stored evidence).
--    No baseline/retake distinction is tracked upstream for this system
--    (inventory: "implicit only"), so every backfilled row is
--    'standard' rather than guessing which was "the" baseline.
insert into assessment_attempts (
  member_id, assessment_definition_id, assessment_version,
  attempt_type, status, started_at, completed_at,
  result_payload,
  source_table, source_id
)
select
  ba.member_id,
  '6c071b7d-ca9a-4f52-a7c0-87ae69de726b',
  1,
  'standard',
  'completed',
  ba.started_at,
  ba.completed_at,
  jsonb_build_object('assessment_type', ba.assessment_type, 'status', ba.status, 'provider_status', ba.provider_status),
  'body_assessments',
  ba.id
from body_assessments ba
where ba.completed_at is not null
on conflict (source_table, source_id) do nothing;
