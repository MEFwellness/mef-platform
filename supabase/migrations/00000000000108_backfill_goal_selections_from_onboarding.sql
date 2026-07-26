-- Backfill member_goal_selections for accounts that predate the welcome
-- flow entirely. Migration 104's own backfill only covered profiles with
-- a non-null profiles.welcome_flow_goals (i.e. members who went through
-- the OLD 4-screen welcome flow) — a member who signed up and completed
-- onboarding *before the welcome flow existed at all* has
-- welcome_flow_eligible = false and welcome_flow_goals = null, so that
-- backfill correctly skipped them, but it left them with zero rows in
-- member_goal_selections and therefore no goal for the Case View to
-- frame itself around.
--
-- These members did answer a real "why are you here" question, though:
-- onboarding's own primary_concern question (allowed_values expanded in
-- migration 68), captured in their baseline onboarding_submissions row's
-- raw_payload->'answers'. This migration reverse-maps that concern back
-- onto lib/welcome/goals.ts's WELCOME_GOALS vocabulary (the inverse of
-- WELCOME_GOAL_TO_PRIMARY_CONCERN) and inserts one member_goal_selections
-- row per affected member — never fabricated, always traceable back to
-- her own answered question.
--
-- Two concern values are ambiguous under the reverse mapping (two
-- welcome-goal keys collapse onto the same concern going forward):
-- 'performance' <- strength_fitness | sports_golf_performance, and
-- 'general_optimization' <- understand_my_body | work_with_coach. Picked
-- the more general/likely reading in each case (strength_fitness,
-- understand_my_body) rather than guessing at sport-specificity or
-- routing her into the coaching-service-request goal she never actually
-- selected. 'healthy_aging' (migration 68's allowed_values) has no
-- corresponding welcome-goal key at all — left unmapped, so those
-- members are simply not backfilled rather than forcing a guess.

alter table member_goal_selections drop constraint if exists member_goal_selections_source_check;
alter table member_goal_selections add constraint member_goal_selections_source_check
  check (source in ('welcome_flow', 'onboarding_confirmation', 'onboarding_backfill'));

comment on constraint member_goal_selections_source_check on member_goal_selections is
  'onboarding_backfill: inserted once by migration 108 for members who completed onboarding
   before the welcome flow existed and therefore have no other row in this table.';

insert into member_goal_selections (member_id, goals, primary_goal, goals_other, source)
select
  candidate.user_id,
  jsonb_build_array(candidate.goal_key),
  candidate.goal_key,
  null,
  'onboarding_backfill'
from (
  select distinct on (os.user_id)
    os.user_id,
    case (ans->>'value')
      when 'pain' then 'reduce_pain'
      when 'movement' then 'improve_posture_movement'
      when 'energy' then 'increase_energy'
      when 'sleep' then 'sleep_better'
      when 'stress' then 'reduce_stress'
      when 'digestion' then 'improve_digestion'
      when 'weight' then 'body_composition'
      when 'performance' then 'strength_fitness'
      when 'habits' then 'healthier_habits'
      when 'general_optimization' then 'understand_my_body'
      when 'other' then 'something_else'
      else null
    end as goal_key
  from onboarding_submissions os,
       jsonb_array_elements(os.raw_payload -> 'answers') as ans
  where os.assessment_type = 'baseline'
    and os.superseded_at is null
    and ans ->> 'question_key' = 'primary_concern'
    and os.user_id not in (select member_id from member_goal_selections)
  order by os.user_id, os.submitted_at asc
) candidate
where candidate.goal_key is not null;
