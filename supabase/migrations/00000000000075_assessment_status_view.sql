-- assessment_status_by_member — read-only convenience view.
--
-- "User assessment status" per Prompt 2 Step 4, without introducing a
-- second mutable table that could drift from the tables that are actually
-- authoritative. A draft's existence in its own source table (an
-- in_progress wellness_assessments/primal_pattern_assessments/
-- body_assessments row) always outranks a past completed attempt in
-- assessment_attempts, matching the existing three-bucket
-- 'not_started' | 'in_progress' | 'completed' semantics already used by
-- lib/assessments/engine/types.ts's QuestionnaireStatus — a member with a
-- completed attempt AND a fresh in_progress retake shows as in_progress
-- here, same as the generic engine already treats it. A member/definition
-- pair with neither simply has no row (the same "absence = not started"
-- convention every one of these tables already uses for its own drafts).
--
-- Onboarding never contributes an in_progress row (that table has no
-- draft/in_progress concept — see 00000000000074's comment), so it only
-- ever appears here via assessment_attempts.
-- security_invoker = true is required, not stylistic: without it, this
-- view would evaluate the underlying tables' RLS policies as the view's
-- OWNER, not the querying user, which would leak every member's drafts
-- and completed attempts to any authenticated caller. With it, the exact
-- same member_read_own_* / coach_read_assigned_* / platform_admin_all_*
-- policies already enforced on wellness_assessments, primal_pattern_
-- assessments, body_assessments, and assessment_attempts apply here too.
create view assessment_status_by_member
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
   QuestionnaireStatus semantics already used by the generic engine.';
