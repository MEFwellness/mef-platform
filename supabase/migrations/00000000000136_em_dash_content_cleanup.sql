-- Permanent style law: no em dash (—, U+2014) anywhere a member or coach
-- can read text. The app-code sweep fixed every UI string, but a handful
-- of tables were already seeded with em-dash copy by earlier migrations
-- (97, 109, 076, 134, 052, 053) before this rule existed, and one
-- function (020's assign_client_to_coach) raises an exception whose
-- message could reach an admin-facing error toast. Editing those
-- already-applied migration files' own INSERT statements (also done, for
-- a correct historical record and clean `supabase db reset`) does not
-- retroactively change rows already committed in production — hence this
-- follow-up migration of real UPDATEs against the live rows, matched by
-- each row's own stable natural key (question_key, phase_key, rule_key,
-- etc.), never a bulk regex pass that could touch unrelated data.

-- Onboarding adaptive question bank (migration 97).
update onboarding_questions set prompt_text = 'How long has this been part of your life (days, months, longer)?' where question_key = 'pain_duration';
update onboarding_questions set prompt_text = 'And on the flip side, what actually helps, even a little?' where question_key = 'pain_relieving_activities';
update onboarding_questions set prompt_text = 'Have you tried working on this before (physical therapy, a professional, anything at home)?' where question_key = 'pain_prior_treatment_tried';
update onboarding_questions set prompt_text = 'Are there everyday things (carrying groceries, playing with kids, getting up from a chair) that feel harder than they should?' where question_key = 'pain_daily_task_difficulty';
update onboarding_questions set prompt_text = 'Is there a time of day when it tends to be worst (morning, after meals, evening)?' where question_key = 'digestion_worst_time_of_day';
update onboarding_questions set prompt_text = 'Walk me through the last half hour before you turn the lights off. What does that usually look like?' where question_key = 'sleep_bedtime_wind_down';
update onboarding_questions set prompt_text = 'Do you lean on anything (a supplement, a sound machine, a nightly ritual) to help you fall asleep?' where question_key = 'sleep_reliance_on_aid';
update onboarding_questions set prompt_text = 'How consistent are your bed and wake times (weekdays compared to weekends)?' where question_key = 'sleep_weekday_weekend_consistency';
update onboarding_questions set prompt_text = 'How much does your stress spill over onto the people around you (snapping, going quiet, that kind of thing)?' where question_key = 'stress_impact_relationships';
update onboarding_questions set helper_text = 'Select any that apply, no judgment, just want the real picture.' where question_key = 'stress_current_coping';
update onboarding_questions set helper_text = 'Select whatever''s realest, even a few at once.' where question_key = 'stress_main_sources';
update onboarding_questions set prompt_text = 'Is it more your body that feels tired, or your mind, or both?' where question_key = 'energy_mental_vs_physical';
update onboarding_questions set prompt_text = 'How often are you moving your body in a typical week (walks, workouts, anything active)?' where question_key = 'energy_exercise_frequency';
update onboarding_questions set prompt_text = 'Tell me about it, what are you working toward?' where question_key = 'performance_goal_description';
update onboarding_questions set prompt_text = 'When it really counts (a big lift, a race, a big moment at work), how focused and composed do you feel?' where question_key = 'performance_mental_composure';
update onboarding_questions set prompt_text = 'How would you describe your joints these days (knees, hips, shoulders)?' where question_key = 'healthy_aging_joint_health';
update onboarding_questions set prompt_text = 'Is there a specific everyday movement (stairs, getting up from the floor, carrying groceries) that''s started to feel harder?' where question_key = 'healthy_aging_daily_function_worry';

-- Driver check-in question bank (migration 109).
update driver_probe_questions set prompt = 'Compared to your usual bedtime, last night you went to bed:' where question_key = 'checkin_probe.bedtime_vs_usual';
update driver_probe_questions set options = '[{"value":"comfortable","label":"Comfortable"},{"value":"a_little_off","label":"A little off"},{"value":"uncomfortable_had_to_hunch","label":"Uncomfortable, had to hunch"},{"value":"not_sure","label":"Not sure"}]'::jsonb where question_key = 'checkin_probe.screen_height_comfort';
update driver_probe_questions set prompt = 'If you carried a bag today, which side (or did you switch)?' where question_key = 'checkin_probe.bag_or_carry_side';
update driver_probe_questions set prompt = 'Did anything today load one side more than the other (a sport, carrying something, your desk setup)?' where question_key = 'checkin_probe.one_sided_activity_today';
update driver_probe_questions set prompt = 'How would you describe your breathing today: relaxed, or shallow/held at times?' where question_key = 'checkin_probe.breath_holding_or_shallow';
update driver_probe_questions set prompt = 'Did you have any real downtime today (time with nothing scheduled or expected of you)?' where question_key = 'checkin_probe.had_unstructured_time';
update driver_probe_questions set
  prompt = 'Was today''s schedule your normal routine, or was it thrown off (travel, a shift change, something like that)?',
  options = '[{"value":"normal_routine","label":"Normal routine"},{"value":"slightly_different","label":"Slightly different"},{"value":"very_different_travel_or_shift","label":"Very different (travel or shift change)"}]'::jsonb
  where question_key = 'checkin_probe.schedule_today_vs_usual';
update driver_probe_questions set prompt = 'Any change to medications or supplements recently (starting, stopping, or a dose change)?' where question_key = 'checkin_probe.medication_or_supplement_change';

-- Holistic Reset program phase labels (migration 76).
update program_phases set display_name = 'Phase 1: Intake & Baseline' where program_key = 'holistic_reset' and phase_key = 'phase_1_intake_baseline';
update program_phases set display_name = 'Phase 2: Deeper Diagnostics' where program_key = 'holistic_reset' and phase_key = 'phase_2_deeper_diagnostics';
update program_phases set display_name = 'Phase 3: Active Coaching' where program_key = 'holistic_reset' and phase_key = 'phase_3_active_coaching';
update program_phases set display_name = 'Phase 4: Reassessment & Completion' where program_key = 'holistic_reset' and phase_key = 'phase_4_reassessment_completion';

-- Core Values Snapshot question bank (migration 134).
update unified_assessment_sections set subtitle = 'That was what matters. Now, what''s actually been getting your time? For each of these, be honest about the last two weeks. Not your intentions. Your calendar.'
  where title = 'Where Your Time Goes'
  and assessment_definition_id = (select id from unified_assessment_definitions where key = 'core-values-snapshot');
update unified_assessment_questions set
  prompt = 'If tomorrow had a 25th hour that nobody could claim but you (no work, no obligations), what would you actually spend it on?',
  answer_options = '[{"value":"health","label":"Moving my body: training, walking, stretching, breathing"},{"value":"relationships","label":"Uninterrupted time with someone I love"},{"value":"growth","label":"Learning or working on something I keep putting off"},{"value":"purpose","label":"Making progress on work that actually matters to me"},{"value":"freedom","label":"Something purely for fun (no goal attached)"},{"value":"peace","label":"Absolutely nothing. Quiet."}]'::jsonb
  where question_key = 'cvs_q1';
update unified_assessment_questions set
  prompt = 'When life gets loud and busy, what disappears first (the thing you quietly miss the most)?',
  answer_options = '[{"value":"health","label":"Exercise and taking care of my body"},{"value":"relationships","label":"Real time with the people closest to me"},{"value":"growth","label":"Reading, learning, working on myself"},{"value":"purpose","label":"The work I care about, buried under the work I have to do"},{"value":"freedom","label":"Fun, play, anything spontaneous"},{"value":"peace","label":"Stillness: a moment that belongs to no one"}]'::jsonb
  where question_key = 'cvs_q2';
update unified_assessment_questions set
  answer_options = '[{"value":"health","label":"Your body: it carries everything else"},{"value":"relationships","label":"The relationships that won''t wait forever"},{"value":"growth","label":"Your growth: who you were becoming"},{"value":"purpose","label":"The work only you could do"},{"value":"freedom","label":"The adventures you kept postponing"},{"value":"peace","label":"Your peace: you were allowed to rest"}]'::jsonb
  where question_key = 'cvs_q4';
update unified_assessment_questions set prompt = 'Last one. Don''t think. Choose. If today forced you to pick:' where question_key = 'cvs_q12';

-- Proactive coaching / AI rules notification templates (migrations 52, 53).
-- Column is jsonb (`produces`); patch only the descriptionTemplate key,
-- leaving every other key (insightType, confidence, etc.) untouched.
update ai_rules set produces = jsonb_set(produces, '{descriptionTemplate}', '"Stress has increased for {{stressConsecutiveIncreaseDays}} consecutive days while sleep quality has been declining. This combination often signals a need for recovery."'::jsonb)
  where rule_key = 'recovery_needed_stress_sleep';
update ai_rules set produces = jsonb_set(produces, '{descriptionTemplate}', '"Pain has been easing while movement has been increasing over recent check-ins. Real, measurable progress worth recognizing."'::jsonb)
  where rule_key = 'celebrate_pain_movement_progress';
update ai_rules set produces = jsonb_set(produces, '{descriptionTemplate}', '"It has been {{daysSinceLastCheckin}} days since the last check-in. A quick one today keeps things on track."'::jsonb)
  where rule_key = 'missed_checkin_scheduled_nudge';
update ai_rules set produces = jsonb_set(produces, '{descriptionTemplate}', '"It has been {{daysSinceLastCheckin}} days. Whenever you are ready, your coach and Root are right here."'::jsonb)
  where rule_key = 'member_inactive_reengagement';

-- assign_client_to_coach's conflict message could reach an admin-facing
-- error toast; redefine with the corrected message, logic unchanged.
create or replace function public.assign_client_to_coach(p_coach_id uuid, p_client_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  if p_coach_id = p_client_id then
    raise exception 'A coach cannot be assigned as their own client';
  end if;

  if not exists (
    select 1 from user_roles
    where user_id = p_coach_id and role = 'coach' and revoked_at is null
  ) then
    raise exception 'Target user % does not have an active coach role grant', p_coach_id;
  end if;

  if exists (
    select 1 from coach_client_assignments
    where client_id = p_client_id and status = 'active'
  ) then
    raise exception 'Client % already has an active coach assignment, revoke it first', p_client_id;
  end if;

  insert into coach_client_assignments (coach_id, client_id, assigned_by)
  values (p_coach_id, p_client_id, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;
