-- ---------------------------------------------------------------------
-- Every current member, run through the new rules.
-- ---------------------------------------------------------------------
--
-- NOTHING IS DELETED, MOVED OR CHANGED BY THIS MIGRATION. It only inserts
-- rows into member_feature_visibility, which is a table of presentation
-- decisions. Every check-in, answer, finding, food entry, assessment
-- attempt and score snapshot every member has is exactly where it was
-- before this ran and stays readable to her, to her coach, and to every
-- engine in the app.
--
-- WHAT IT WRITES, AND WHY ONLY THIS.
--
-- Rule 2 of the visibility build says nothing a member has already started,
-- completed or logged data in ever disappears. This migration is that rule,
-- applied once to everyone who was already here on the day the rules
-- arrived. For each member it writes one 'grandfathered' row per feature she
-- has genuinely touched, so those stay on her screens whatever a rule would
-- otherwise say.
--
-- It deliberately does NOT try to evaluate the reveal rules in SQL. Those
-- rules read her canonical findings and their evidence tiers, which are
-- computed by lib/member-interpretation at read time from live data and are
-- not a table this migration could join. Re-implementing them here in a
-- second language would create exactly the thing this whole build exists to
-- remove: two systems that can disagree about the same member. So untouched
-- features are simply left with no row, and resolve against her real intake
-- answers and findings on her next page load, which is what the brief asks
-- for.
--
-- EVERY ROW IS WRITTEN ALREADY ACKNOWLEDGED. `acknowledged_at` is set to
-- now(). Without that, every existing member would open the app on deploy
-- day and be told, in Root's voice, about a dozen features she has been
-- using for weeks. A reveal sentence is for something new.
--
-- IDEMPOTENT. `on conflict do nothing` throughout, so running it twice
-- changes nothing and it can never overwrite a decision made after it ran.
-- ---------------------------------------------------------------------

-- Feature keys must match lib/visibility/catalog.ts exactly. They are
-- listed literally rather than derived, because the catalog lives in
-- TypeScript where each rule sits beside the reason it exists, and a
-- database copy of it would be the second source of truth this build is
-- removing. tests/visibility-layer.test.ts asserts that every key named
-- below is a real catalog key, so a rename cannot silently orphan a row.

-- ---------------------------------------------------------------------
-- 1) Anyone who has ever logged a check-in.
-- ---------------------------------------------------------------------
insert into member_feature_visibility
  (member_id, feature_key, state, source, rule_kind, reason, revealed_at, acknowledged_at)
select distinct
  d.user_id,
  k.feature_key,
  'revealed',
  'grandfathered',
  null,
  'She had already logged check-ins when the visibility rules arrived, so this stayed.',
  now(),
  now()
from daily_checkins d
cross join (values
  ('home.root_score'),
  ('home.daily_brief'),
  ('today.recommendations'),
  ('today.lesson'),
  ('today.numbers_grid'),
  ('progress.history')
) as k(feature_key)
on conflict (member_id, feature_key) do nothing;

-- ---------------------------------------------------------------------
-- 2) Anyone who has ever logged a movement day.
-- ---------------------------------------------------------------------
insert into member_feature_visibility
  (member_id, feature_key, state, source, rule_kind, reason, revealed_at, acknowledged_at)
select distinct
  d.user_id,
  k.feature_key,
  'revealed',
  'grandfathered',
  null,
  'She had already logged movement when the visibility rules arrived, so this stayed.',
  now(),
  now()
from daily_checkins d
cross join (values
  ('tracker.movement_level'),
  ('home.quick_action_movement'),
  ('feature.movement')
) as k(feature_key)
where d.movement_today is not null
on conflict (member_id, feature_key) do nothing;

-- ---------------------------------------------------------------------
-- 3) Anyone who has ever logged food.
-- ---------------------------------------------------------------------
insert into member_feature_visibility
  (member_id, feature_key, state, source, rule_kind, reason, revealed_at, acknowledged_at)
select distinct
  f.member_id,
  'tracker.food_lens',
  'revealed',
  'grandfathered',
  null,
  'She had already logged food when the visibility rules arrived, so this stayed.',
  now(),
  now()
from member_food_log f
on conflict (member_id, feature_key) do nothing;

-- ---------------------------------------------------------------------
-- 4) Anyone with a connected device.
-- ---------------------------------------------------------------------
insert into member_feature_visibility
  (member_id, feature_key, state, source, rule_kind, reason, revealed_at, acknowledged_at)
select distinct
  w.member_id,
  k.feature_key,
  'revealed',
  'grandfathered',
  null,
  'She already had a device connected when the visibility rules arrived, so this stayed.',
  now(),
  now()
from wearable_connections w
cross join (values
  ('home.wearable_connect'),
  ('feature.wearables')
) as k(feature_key)
where w.status = 'connected'
on conflict (member_id, feature_key) do nothing;

-- ---------------------------------------------------------------------
-- 5) Anyone with an active registry finding.
-- ---------------------------------------------------------------------
-- These are the interpretation surfaces. A member with findings already on
-- her Root Map keeps it, whatever tier those findings currently sit at.
insert into member_feature_visibility
  (member_id, feature_key, state, source, rule_kind, reason, revealed_at, acknowledged_at)
select distinct
  e.member_id,
  k.feature_key,
  'revealed',
  'grandfathered',
  null,
  'She already had findings on her Root Map when the visibility rules arrived, so this stayed.',
  now(),
  now()
from registry_entries e
cross join (values
  ('feature.root_map'),
  ('feature.noticing'),
  ('progress.assessment_findings')
) as k(feature_key)
where e.status = 'active' and e.entry_kind = 'finding' and e.member_visible = true
on conflict (member_id, feature_key) do nothing;

-- ---------------------------------------------------------------------
-- 6) Anyone with a reset plan, an experiment, a habit or a weekly review.
-- ---------------------------------------------------------------------
insert into member_feature_visibility
  (member_id, feature_key, state, source, rule_kind, reason, revealed_at, acknowledged_at)
select distinct p.id, k.feature_key, 'revealed', 'grandfathered', null,
  'Her coach had already granted her a reset plan, so this stayed.', now(), now()
from profiles p
cross join (values ('home.reset_plan'), ('feature.reset_plan')) as k(feature_key)
where p.reset_plan_granted_at is not null
on conflict (member_id, feature_key) do nothing;

insert into member_feature_visibility
  (member_id, feature_key, state, source, rule_kind, reason, revealed_at, acknowledged_at)
select distinct e.member_id, 'home.active_experiments', 'revealed', 'grandfathered', null,
  'She had already started an experiment, so this stayed.', now(), now()
from lifestyle_experiments e
on conflict (member_id, feature_key) do nothing;

insert into member_feature_visibility
  (member_id, feature_key, state, source, rule_kind, reason, revealed_at, acknowledged_at)
select distinct h.user_id, 'tracker.habits', 'revealed', 'grandfathered', null,
  'She already had habits set up, so this stayed.', now(), now()
from habits h
on conflict (member_id, feature_key) do nothing;

insert into member_feature_visibility
  (member_id, feature_key, state, source, rule_kind, reason, revealed_at, acknowledged_at)
select distinct r.member_id, 'home.weekly_review', 'revealed', 'grandfathered', null,
  'She already had a weekly review, so this stayed.', now(), now()
from member_weekly_reviews r
on conflict (member_id, feature_key) do nothing;

-- ---------------------------------------------------------------------
-- 7) Every assessment anyone has started or completed.
-- ---------------------------------------------------------------------
-- The strongest form of rule 2: an assessment a member has put real answers
-- into is never taken off her screen, whether or not she finished it, and
-- whether or not any rule would reveal it today.
insert into member_feature_visibility
  (member_id, feature_key, state, source, rule_kind, reason, revealed_at, acknowledged_at)
select distinct
  a.member_id,
  'assessment.' || d.key,
  'revealed',
  'grandfathered',
  null,
  'She had already started or finished this assessment, so it stayed.',
  now(),
  now()
from assessment_attempts a
join assessment_definitions d on d.id = a.assessment_definition_id
on conflict (member_id, feature_key) do nothing;

-- The intake itself, for anyone who has ever submitted one. It is 'always'
-- in the catalog, so this row is belt and braces rather than the mechanism.
insert into member_feature_visibility
  (member_id, feature_key, state, source, rule_kind, reason, revealed_at, acknowledged_at)
select distinct s.user_id, 'assessment.onboarding-health-history', 'revealed', 'grandfathered', null,
  'She had already completed the intake, so it stayed.', now(), now()
from onboarding_submissions s
on conflict (member_id, feature_key) do nothing;

-- The questionnaire library and its Home card, for anyone with any
-- assessment history at all: a member who has taken something must be able
-- to find where she took it.
insert into member_feature_visibility
  (member_id, feature_key, state, source, rule_kind, reason, revealed_at, acknowledged_at)
select distinct a.member_id, k.feature_key, 'revealed', 'grandfathered', null,
  'She had already taken an assessment, so the library stayed reachable.', now(), now()
from assessment_attempts a
cross join (values
  ('feature.questionnaires'),
  ('home.questionnaires_card')
) as k(feature_key)
on conflict (member_id, feature_key) do nothing;

-- ---------------------------------------------------------------------
-- 8) Anything a coach has assigned, so an assignment cannot be swallowed.
-- ---------------------------------------------------------------------
insert into member_feature_visibility
  (member_id, feature_key, state, source, rule_kind, reason, revealed_at, acknowledged_at)
select distinct
  a.member_id,
  'assessment.' || d.key,
  'revealed',
  'grandfathered',
  null,
  'Her coach had already assigned this, so it stayed.',
  now(),
  now()
from assessment_assignments a
join assessment_definitions d on d.id = a.assessment_definition_id
where a.status = 'pending'
on conflict (member_id, feature_key) do nothing;

insert into member_feature_visibility
  (member_id, feature_key, state, source, rule_kind, reason, revealed_at, acknowledged_at)
select distinct w.member_id, k.feature_key, 'revealed', 'grandfathered', null,
  'Her coach had already assigned her a program, so it stayed.', now(), now()
from coach_assigned_workouts w
cross join (values
  ('home.assigned_programs'),
  ('feature.programs')
) as k(feature_key)
on conflict (member_id, feature_key) do nothing;
