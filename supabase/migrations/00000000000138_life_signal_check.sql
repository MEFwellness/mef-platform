-- Life Signal Check — Experience 2 of the free-tier lineup, built on the
-- same Unified Adaptive Assessment Foundation/Runtime (migrations 98-99)
-- and the exact same pattern Core Values Snapshot (migration 134)
-- established: a catalog row (assessment_definitions), a content
-- definition (unified_assessment_definitions/sections/questions), and
-- nothing new in the runtime itself. Unlocks after Core Values Snapshot
-- (enforced via the assessment registry's own prerequisiteKeys mechanism,
-- lib/assessment-registry/registry.ts — a real, pre-existing field this
-- is the first assessment to actually use).
--
-- Also generalizes two pieces of Core Values Snapshot's own machinery so
-- both experiences can run their Weekly Experiment/day-3/day-7 follow-up
-- system side by side without ambiguity, rather than building a second
-- parallel engine:
--   1) lifestyle_experiments gets one new, nullable, additive column
--      (source_experience_key) so "which experience started this
--      experiment" is a real, queryable fact instead of the previous
--      "recommendation_id is null" heuristic, which could not tell a
--      Core Values Snapshot experiment apart from a Life Signal Check
--      one. Existing Core Values Snapshot-sourced rows are backfilled in
--      the same statement — safe today because zero Life Signal Check
--      experiments exist yet anywhere this migration runs.
--   2) member_coaching_messages' conversation_type vocabulary gets two
--      more values for Life Signal Check's own day-3/day-7 follow-ups,
--      same additive drop/re-add pattern migration 134 used for Core
--      Values Snapshot's own two.
--
-- cvs_experiment_daily_logs (migration 134) is reused as-is for Life
-- Signal Check's own daily taps/day-3 response — its schema was never
-- actually Core Values Snapshot-specific (just its table name), only
-- ever keyed by experiment_id, so no new table is needed here.

-- 1) Catalog row.
insert into assessment_definitions (id, key, display_name, category) values
  ('e784c029-0d1c-4f31-afc2-4c6c2e97e320', 'life-signal-check', 'Life Signal Check', 'body_signals');

insert into assessment_definition_versions (assessment_definition_id, version, notes)
values ('e784c029-0d1c-4f31-afc2-4c6c2e97e320', 1, 'Initial Life Signal Check release on the Unified Adaptive Assessment Runtime.');

-- 2) Content — definition, 3 sections, 11 questions. Q10's answer_options
-- is deliberately null: its options are generated at take-time from the
-- member's own Q4-Q9 answers (lib/life-signal-check/q10.ts), not fixed
-- content — same pattern as Core Values Snapshot's own Q12. No question
-- here sets concern_category/severity_tags/validation — like Core Values
-- Snapshot, this is a listening instrument, not a symptom instrument, so
-- it deliberately produces zero Universal Registry findings.
with def as (
  insert into unified_assessment_definitions (
    key, catalog_definition_id, title, description, assessment_type,
    estimated_completion_time_minutes, adaptive_enabled, reassessment_enabled,
    safety_enabled, version, active
  ) values (
    'life-signal-check',
    'e784c029-0d1c-4f31-afc2-4c6c2e97e320',
    'Life Signal Check',
    'Eleven questions that listen for where a member''s life is speaking the loudest right now, across energy, sleep, tension, digestion, body, and mind.',
    'life_signal_check',
    4, false, true, false, 1, true
  )
  returning id
),
sections as (
  insert into unified_assessment_sections (assessment_definition_id, title, subtitle, display_order)
  select def.id, v.title, v.subtitle, v.display_order
  from def, (values
    ('The Wide Lens', null, 1),
    ('Six Signals', 'Six places your body might be speaking up. Be honest about this past week, not how you wish it went.', 2),
    ('The Call', null, 3)
  ) as v(title, subtitle, display_order)
  returning id, title
)
insert into unified_assessment_questions (
  assessment_definition_id, section_id, question_key, display_order, prompt, description, answer_type, answer_options
)
select def.id, sections.id, q.question_key, q.display_order, q.prompt, q.description, q.answer_type, q.answer_options
from def, sections, (values
  ('The Wide Lens', 'lsc_q1', 1,
   'Think about a normal day this past week. When did you feel most like yourself?',
   null::text, 'single_select',
   '[{"value":"mornings","label":"Mornings"},{"value":"midday","label":"The middle of the day"},{"value":"evenings","label":"Evenings"},{"value":"not_much","label":"Honestly, not much of the day"},{"value":"varies","label":"It varies a lot"}]'::jsonb),
  ('The Wide Lens', 'lsc_q2', 2,
   'And when does the day tend to get hardest?',
   null, 'single_select',
   '[{"value":"mornings","label":"Mornings"},{"value":"midday","label":"The middle of the day"},{"value":"evenings","label":"Evenings"},{"value":"not_much","label":"Honestly, not much of the day"},{"value":"varies","label":"It varies a lot"}]'::jsonb),
  ('The Wide Lens', 'lsc_q3', 3,
   'If your body could send you one text this week, what would it say?',
   null, 'single_select',
   '[{"value":"tired","label":"I''m tired"},{"value":"tense","label":"I''m tense"},{"value":"ache","label":"I ache"},{"value":"cant_settle","label":"I can''t settle down"},{"value":"hungry_for_different","label":"I''m hungry for something different"},{"value":"okay_actually","label":"I''m okay, actually"}]'::jsonb),

  ('Six Signals', 'lsc_q4', 4, 'How often did you run out of steam before the day ran out of things to do?', null, 'single_select',
   '[{"value":"never","label":"Never"},{"value":"once_or_twice","label":"Once or twice"},{"value":"most_days","label":"Most days"},{"value":"every_day","label":"Every day"}]'::jsonb),
  ('Six Signals', 'lsc_q5', 5, 'How did mornings feel when you woke up?', null, 'single_select',
   '[{"value":"rested","label":"Rested"},{"value":"slow_start","label":"Okay after a slow start"},{"value":"needed_more","label":"Like I needed more"},{"value":"barely_slept","label":"Like I barely slept"}]'::jsonb),
  ('Six Signals', 'lsc_q6', 6, 'Where did stress live in your body this week?', null, 'single_select',
   '[{"value":"didnt_notice","label":"Didn''t really notice it"},{"value":"shoulders_neck","label":"Shoulders and neck"},{"value":"stomach","label":"Stomach"},{"value":"chest_breathing","label":"Chest or breathing"},{"value":"everywhere","label":"Everywhere, honestly"}]'::jsonb),
  ('Six Signals', 'lsc_q7', 7, 'After meals, your body mostly felt...', null, 'single_select',
   '[{"value":"settled","label":"Settled"},{"value":"heavy_bloated","label":"Heavy or bloated"},{"value":"unpredictable","label":"Unpredictable"},{"value":"uncomfortable","label":"Uncomfortable more often than not"}]'::jsonb),
  ('Six Signals', 'lsc_q8', 8, 'Did anything ache enough to change how you moved or sat?', null, 'single_select',
   '[{"value":"no","label":"No"},{"value":"worked_around_it","label":"A little, I worked around it"},{"value":"most_days","label":"Most days"},{"value":"constantly","label":"Constantly"}]'::jsonb),
  ('Six Signals', 'lsc_q9', 9, 'In quiet moments, could your mind actually rest?', null, 'single_select',
   '[{"value":"usually","label":"Usually"},{"value":"sometimes","label":"Sometimes"},{"value":"rarely","label":"Rarely"},{"value":"no_quiet_moments","label":"What quiet moments"}]'::jsonb),

  ('The Call', 'lsc_q10', 10,
   'If Root could quiet just one of these for you, which would you pick?',
   'Options generated live from your own answers above.', 'single_select', null),
  ('The Call', 'lsc_q11', 11,
   'How long has that one been speaking up?',
   null, 'single_select',
   '[{"value":"just_this_week","label":"Just this week"},{"value":"a_few_weeks","label":"A few weeks"},{"value":"months","label":"Months"},{"value":"as_long_as_i_can_remember","label":"As long as I can remember"}]'::jsonb)
) as q(section_title, question_key, display_order, prompt, description, answer_type, answer_options)
where sections.title = q.section_title;

-- 3) lifestyle_experiments — one new, nullable, additive column so a
-- lifestyle_experiments row can name which experience started it. Every
-- existing Core Values Snapshot-sourced row (recommendation_id null,
-- source_session_id set) is backfilled in the same statement, since no
-- Life Signal Check experiment can exist yet anywhere this migration
-- runs. Every Recommendation Engine-sourced row (the overwhelming
-- majority of this table) is untouched and stays null, exactly as before.
alter table lifestyle_experiments add column source_experience_key text;

update lifestyle_experiments
set source_experience_key = 'core-values-snapshot'
where recommendation_id is null and source_session_id is not null;

-- 4) Root Coaching Conversation Engine — two new topic types for Life
-- Signal Check's own Weekly Experiment day-3/day-7 follow-ups, same
-- additive drop/re-add pattern migration 134 used for Core Values
-- Snapshot's own two.
alter table member_coaching_messages drop constraint member_coaching_messages_conversation_type_check;
alter table member_coaching_messages add constraint member_coaching_messages_conversation_type_check
  check (conversation_type in (
    'first_observation', 'repeated_signal', 'improving_trend', 'worsening_trend',
    'conflicting_information', 'new_assessment_available', 'reassessment',
    'experiment_follow_up', 'experiment_success', 'experiment_unsuccessful',
    'cvs_day3_checkin', 'cvs_day7_result',
    'lsc_day3_checkin', 'lsc_day7_result'
  ));
