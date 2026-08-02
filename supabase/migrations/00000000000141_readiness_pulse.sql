-- Readiness Pulse — Experience 3 of the free-tier lineup, the final
-- conversation of the free arc. Built on the same Unified Adaptive
-- Assessment Foundation/Runtime (migrations 98-99) and the exact same
-- pattern Core Values Snapshot (migration 134) and Life Signal Check
-- (migration 138) established: a catalog row (assessment_definitions), a
-- content definition (unified_assessment_definitions/sections/questions),
-- and nothing new in the runtime itself. Unlocks after Life Signal Check
-- (enforced via the assessment registry's own prerequisiteKeys mechanism,
-- lib/assessment-registry/registry.ts — the same real, server-enforced
-- gating Life Signal Check's own unlock already uses, this is simply the
-- second assessment to use it).
--
-- Reuses lifestyle_experiments / cvs_experiment_daily_logs / the day-3/
-- day-7 follow-up engine exactly as-is (source_experience_key =
-- 'readiness-pulse', no schema change needed — that column is already
-- free text). Two new member_coaching_messages.conversation_type values
-- for Readiness Pulse's own day-3/day-7 follow-ups, same additive
-- drop/re-add pattern migrations 134/138 used.
--
-- Also extends wellness_coaching_style_profile.tone_preference (migration
-- 36) additively: Question 5 asks an explicit hypothetical ("what would
-- you want from me if two days slipped") that maps onto four distinct
-- coaching styles, and only one of the four ('direct') already existed in
-- the enum the deterministic keyword classifier (lib/intelligence-core/
-- coachingStyle.ts) produces. Rather than force Question 5's other three
-- answers into an existing value that would misrepresent what the member
-- actually said (violating Root's own "never claim something untrue"
-- rule), the enum gains 'meaning_anchored', 'adaptive', and 'autonomous'
-- — additive, same discipline as every other check-constraint change in
-- this file, and lib/intelligence-core/coachingStyle.ts's own keyword
-- lists are extended to match (see that file's own comment) so the
-- profile stays a genuinely living single source of truth, not a value
-- only Readiness Pulse's own write path ever produces.

-- 1) Catalog row.
insert into assessment_definitions (id, key, display_name, category) values
  ('76e12c62-fb0d-478b-8543-c0693690e912', 'readiness-pulse', 'Readiness Pulse', 'behavior_change');

insert into assessment_definition_versions (assessment_definition_id, version, notes)
values ('76e12c62-fb0d-478b-8543-c0693690e912', 1, 'Initial Readiness Pulse release on the Unified Adaptive Assessment Runtime.');

-- 2) Content — definition, 3 sections, 9 questions. Q2's answer_options is
-- deliberately null: its prompt and options are generated at take-time
-- from the member's own Q1 answer (lib/readiness-pulse/q2.ts), same
-- "answer_options null, generated live" pattern as Life Signal Check's own
-- Q10 and Core Values Snapshot's own Q12. No question here sets
-- concern_category/severity_tags/validation — like Core Values Snapshot
-- and Life Signal Check, this is a listening instrument, not a symptom
-- instrument, so it deliberately produces zero Universal Registry
-- findings.
with def as (
  insert into unified_assessment_definitions (
    key, catalog_definition_id, title, description, assessment_type,
    estimated_completion_time_minutes, adaptive_enabled, reassessment_enabled,
    safety_enabled, version, active
  ) values (
    'readiness-pulse',
    '76e12c62-fb0d-478b-8543-c0693690e912',
    'Readiness Pulse',
    'Nine questions that find out, honestly and with zero judgment, whether a member is actually ready to act on what the first two conversations found.',
    'readiness_pulse',
    4, false, true, false, 1, true
  )
  returning id
),
sections as (
  insert into unified_assessment_sections (assessment_definition_id, title, subtitle, display_order)
  select def.id, v.title, v.subtitle, v.display_order
  from def, (values
    ('Honest History', null, 1),
    ('Capacity, Not Motivation', 'Be honest about your actual life, not the version you wish you had.', 2),
    ('The Decision', null, 3)
  ) as v(title, subtitle, display_order)
  returning id, title
)
insert into unified_assessment_questions (
  assessment_definition_id, section_id, question_key, display_order, prompt, description, answer_type, answer_options
)
select def.id, sections.id, q.question_key, q.display_order, q.prompt, q.description, q.answer_type, q.answer_options
from def, sections, (values
  ('Honest History', 'rpl_q1', 1,
   'Have you tried to change how you feel before?',
   null::text, 'single_select',
   '[{"value":"first_real_try","label":"This is my first real try"},{"value":"a_few_tries","label":"A few tries"},{"value":"more_than_i_can_count","label":"More times than I can count"},{"value":"never_started","label":"I have thought about it but never started"}]'::jsonb),
  ('Honest History', 'rpl_q2', 2,
   'What usually got in the way?',
   'Generated live from your Question 1 answer.', 'single_select', null),
  ('Honest History', 'rpl_q3', 3,
   'Right now, change feels...',
   null, 'single_select',
   '[{"value":"overdue","label":"Overdue"},{"value":"appealing_but_exhausting","label":"Appealing but exhausting"},{"value":"a_little_scary","label":"A little scary"},{"value":"curious","label":"Something I am curious about"}]'::jsonb),

  ('Capacity, Not Motivation', 'rpl_q4', 4,
   'Be honest about your next month. How much room does your life actually have?',
   null, 'single_select',
   '[{"value":"room_if_protect","label":"Room if I protect it"},{"value":"small_pockets","label":"Small pockets here and there"},{"value":"almost_none","label":"Almost none right now"},{"value":"genuinely_open","label":"Genuinely open"}]'::jsonb),
  ('Capacity, Not Motivation', 'rpl_q5', 5,
   'Imagine it is day four of your first week and two days slipped. What would you want from me?',
   null, 'single_select',
   '[{"value":"direct","label":"Call it out, straight, no cushion"},{"value":"meaning_anchored","label":"Remind me why I started"},{"value":"adaptive","label":"Shrink it, make tomorrow smaller"},{"value":"autonomous","label":"Say nothing, I will come back on my own"}]'::jsonb),
  ('Capacity, Not Motivation', 'rpl_q6', 6,
   'What would sink this first?',
   null, 'single_select',
   '[{"value":"schedule","label":"My schedule"},{"value":"follow_through","label":"My own follow-through"},{"value":"other_people","label":"Other people''s needs"},{"value":"expecting_too_much","label":"Expecting too much too fast"}]'::jsonb),
  ('Capacity, Not Motivation', 'rpl_q7', 7,
   'Five minutes a day. How does that land?',
   null, 'single_select',
   '[{"value":"easily_doable","label":"Easily doable"},{"value":"doable_good_days","label":"Doable on good days"},{"value":"sounds_small_know_myself","label":"Sounds small but I know myself"},{"value":"even_that_heavy","label":"Honestly, even that feels heavy"}]'::jsonb),

  ('The Decision', 'rpl_q8', 8,
   'If Root could change one thing about how your last two weeks felt, what would it be?',
   null, 'single_select',
   '[{"value":"energy","label":"Energy"},{"value":"sleep","label":"Sleep"},{"value":"tension","label":"Tension"},{"value":"digestion","label":"Digestion"},{"value":"body","label":"Body"},{"value":"mind","label":"Mind"}]'::jsonb),
  ('The Decision', 'rpl_q9', 9,
   'Honestly, are you ready to start, or still deciding?',
   null, 'single_select',
   '[{"value":"ready_now","label":"Ready now"},{"value":"ready_if_small","label":"Ready, but it needs to be small"},{"value":"still_deciding","label":"Still deciding"},{"value":"not_yet","label":"Not yet"}]'::jsonb)
) as q(section_title, question_key, display_order, prompt, description, answer_type, answer_options)
where sections.title = q.section_title;

-- 3) Root Coaching Conversation Engine — two new topic types for
-- Readiness Pulse's own Weekly Experiment day-3/day-7 follow-ups, same
-- additive drop/re-add pattern migrations 134/138 used.
alter table member_coaching_messages drop constraint member_coaching_messages_conversation_type_check;
alter table member_coaching_messages add constraint member_coaching_messages_conversation_type_check
  check (conversation_type in (
    'first_observation', 'repeated_signal', 'improving_trend', 'worsening_trend',
    'conflicting_information', 'new_assessment_available', 'reassessment',
    'experiment_follow_up', 'experiment_success', 'experiment_unsuccessful',
    'cvs_day3_checkin', 'cvs_day7_result',
    'lsc_day3_checkin', 'lsc_day7_result',
    'rpl_day3_checkin', 'rpl_day7_result'
  ));

-- 4) wellness_coaching_style_profile.tone_preference — additive enum
-- extension (see this file's own header comment for why).
alter table wellness_coaching_style_profile drop constraint wellness_coaching_style_profile_tone_preference_check;
alter table wellness_coaching_style_profile add constraint wellness_coaching_style_profile_tone_preference_check
  check (tone_preference in (
    'encouragement', 'direct', 'education_first', 'meaning_anchored', 'adaptive', 'autonomous', 'unclear'
  ));
