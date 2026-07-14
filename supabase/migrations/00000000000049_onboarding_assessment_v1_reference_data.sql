-- The onboarding_assessment_versions/onboarding_questions rows for version 1
-- were only ever added via supabase/seed/01_onboarding_questions.sql, which
-- runs on `supabase db reset` (local) but is never applied to a remote
-- project by `supabase db push` — seeds and migrations are separate
-- pipelines. That left production with the schema (migrations 7 and 8) but
-- no version 1 row, so submit_onboarding() (migration 18) hit its "no
-- active version" guard for every real member. This is that same reference
-- data, promoted to a migration so it ships to every environment through
-- the normal migration pipeline instead of a local-only seed step.
--
-- Idempotent: safe to run against a database that already has this data
-- (e.g. local, where the seed already inserted it).
insert into onboarding_assessment_versions (assessment_version)
values (1)
on conflict (assessment_version) do nothing;

do $$
declare
  v_version_id uuid;
begin
  select id into v_version_id from onboarding_assessment_versions where assessment_version = 1;

  insert into onboarding_questions
    (question_key, assessment_version_id, question_version, display_order, prompt_text, answer_type, allowed_values, domain)
  values
    ('primary_concern', v_version_id, 1, 1,
     'What brought you here today?', 'enum',
     '["pain","energy","digestion","sleep","stress","weight","general_optimization","other"]', 'all'),

    ('baseline_sleep_quality', v_version_id, 1, 2,
     'How would you rate your typical sleep quality?', 'numeric', null, 'sleep'),

    ('baseline_sleep_hours', v_version_id, 1, 3,
     'On a typical night, how many hours do you sleep?', 'enum',
     '["<5","5-6","6-7","7-8","8+"]', 'sleep'),

    ('baseline_stress_level', v_version_id, 1, 4,
     'How would you rate your everyday stress?', 'numeric', null, 'mind_stress'),

    ('baseline_energy_level', v_version_id, 1, 5,
     'How is your energy most days?', 'numeric', null, 'movement_energy'),

    ('baseline_digestion', v_version_id, 1, 6,
     'How would you describe your digestion?', 'numeric', null, 'nutrition_digestion'),

    ('baseline_pain_areas', v_version_id, 1, 7,
     'Do you have any areas of ongoing discomfort?', 'multi_select',
     '["neck","shoulders","upper_back","lower_back","hips","knees","none"]', 'pain_structural'),

    ('baseline_movement_frequency', v_version_id, 1, 8,
     'How many days a week do you currently move intentionally?', 'enum',
     '["0","1-2","3-4","5+"]', 'movement_energy'),

    ('baseline_goals', v_version_id, 1, 9,
     'What would you like to feel or be able to do in the next 90 days?', 'free_text', null, 'all'),

    ('readiness_importance', v_version_id, 1, 10,
     'How important is making a change right now, on a scale of 0 to 10?', 'numeric', null, 'mind_stress'),

    ('readiness_confidence', v_version_id, 1, 11,
     'How confident are you that you can make this change, 0 to 10?', 'numeric', null, 'mind_stress'),

    ('readiness_actively_working', v_version_id, 1, 12,
     'Are you already actively working on this?', 'boolean', null, 'mind_stress')
  on conflict (question_key, question_version) do nothing;
end $$;
