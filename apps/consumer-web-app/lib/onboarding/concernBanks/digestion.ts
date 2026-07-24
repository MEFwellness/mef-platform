/**
 * Question bank for members whose primary_concern is "digestion" — surfaced
 * in Phase 3a as a genuine deep-dive into what's actually going on day to
 * day, not a symptom checklist. Two of these sixteen are selected per
 * member (weighted-random, see lib/onboarding/adaptivePlan.ts), alongside
 * one fixed legacy anchor question. Coverage spans what the main concern
 * actually is, when and how often it shows up, its relationship to meals
 * and specific foods, whether it's been addressed before, and how it
 * bleeds into energy, sleep, and stress. Nothing here diagnoses a
 * condition or names a disorder — it stays in coaching language, close to
 * how a member would describe their own experience.
 */

import type { ConcernQuestionSeed } from './types';

export const DIGESTION_BANK: ConcernQuestionSeed[] = [
  {
    question_key: 'digestion_primary_concern',
    prompt_text: "What's the main thing going on with your digestion right now?",
    answer_type: 'enum',
    allowed_values: ['bloating', 'irregularity', 'discomfort_or_cramping', 'reflux_or_heartburn', 'gas', 'unpredictable_bathroom_habits', 'low_appetite', 'other'],
    domain: 'nutrition_digestion',
    weight: 1.5,
  },
  {
    question_key: 'digestion_secondary_concern',
    prompt_text: "Anything else going on alongside that, or is it really just the one thing?",
    helper_text: 'Select any others that apply.',
    answer_type: 'multi_select',
    allowed_values: ['bloating', 'irregularity', 'discomfort_or_cramping', 'reflux_or_heartburn', 'gas', 'unpredictable_bathroom_habits', 'low_appetite', 'none_just_the_one_thing'],
    domain: 'nutrition_digestion',
    weight: 1,
    requires: [{ question_key: 'digestion_primary_concern', op: 'in', value: ['bloating', 'irregularity', 'discomfort_or_cramping', 'reflux_or_heartburn', 'gas', 'unpredictable_bathroom_habits', 'low_appetite', 'other'] }],
  },
  {
    question_key: 'digestion_worst_time_of_day',
    prompt_text: 'Is there a time of day when it tends to be worst — morning, after meals, evening?',
    answer_type: 'enum',
    allowed_values: ['morning', 'midday', 'after_meals', 'evening', 'late_at_night', 'no_real_pattern'],
    domain: 'nutrition_digestion',
    weight: 1,
  },
  {
    question_key: 'digestion_frequency',
    prompt_text: 'How often would you say this is showing up?',
    answer_type: 'enum',
    allowed_values: ['almost_every_day', 'a_few_times_a_week', 'about_once_a_week', 'occasionally'],
    domain: 'nutrition_digestion',
    weight: 1.5,
  },
  {
    question_key: 'digestion_duration',
    prompt_text: "How long has this been going on for you?",
    answer_type: 'enum',
    allowed_values: ['under_a_month', '1_to_6_months', '6_months_to_a_year', 'over_a_year', 'on_and_off_for_years'],
    domain: 'nutrition_digestion',
    weight: 1,
  },
  {
    question_key: 'digestion_severity_typical',
    prompt_text: 'On a typical day it shows up, how much does it throw you off?',
    helper_text: '1 = barely notice it, 5 = it derails my day.',
    answer_type: 'numeric',
    domain: 'nutrition_digestion',
    weight: 1.5,
  },
  {
    question_key: 'digestion_meal_relationship',
    prompt_text: 'Does it seem tied to specific meals or eating patterns, or does it feel random?',
    answer_type: 'enum',
    allowed_values: ['specific_foods', 'meal_size_or_timing', 'eating_too_fast', 'skipping_meals', 'feels_random', 'not_sure'],
    domain: 'nutrition_digestion',
    weight: 1,
  },
  {
    question_key: 'digestion_trigger_foods',
    prompt_text: "Are there particular foods or drinks you've noticed tend to set it off?",
    answer_type: 'free_text',
    domain: 'nutrition_digestion',
    weight: 1,
    requires: [{ question_key: 'digestion_meal_relationship', op: 'eq', value: 'specific_foods' }],
  },
  {
    question_key: 'digestion_affects_energy',
    prompt_text: 'Do you notice your energy dipping when your digestion is off?',
    answer_type: 'boolean',
    domain: 'movement_energy',
    weight: 1,
  },
  {
    question_key: 'digestion_affects_sleep',
    prompt_text: 'Does it ever interfere with falling asleep or sleeping through the night?',
    answer_type: 'boolean',
    domain: 'recovery',
    weight: 1,
  },
  {
    question_key: 'digestion_prior_changes_tried',
    prompt_text: "Have you tried changing your diet or eliminating certain foods to get ahead of this?",
    answer_type: 'enum',
    allowed_values: ['yes_worked_with_a_professional', 'yes_tried_it_myself', 'no_havent_tried_yet', 'currently_trying_something'],
    domain: 'nutrition_digestion',
    weight: 1,
  },
  {
    question_key: 'digestion_changes_helped',
    prompt_text: 'Did that actually make a difference, or did it not really change much?',
    answer_type: 'enum',
    allowed_values: ['helped_a_lot', 'helped_somewhat', 'didnt_really_help', 'too_soon_to_tell'],
    domain: 'nutrition_digestion',
    weight: 1,
    requires: [{ question_key: 'digestion_prior_changes_tried', op: 'in', value: ['yes_worked_with_a_professional', 'yes_tried_it_myself', 'currently_trying_something'] }],
  },
  {
    question_key: 'digestion_stress_connection',
    prompt_text: "Have you noticed a connection between how stressed you're feeling and how your digestion behaves?",
    answer_type: 'numeric',
    helper_text: '1 = no connection I can see, 5 = they track together closely.',
    domain: 'mind_stress',
    weight: 1,
  },
  {
    question_key: 'digestion_hydration_habit',
    prompt_text: 'How would you describe your water intake on a normal day?',
    answer_type: 'enum',
    allowed_values: ['well_hydrated', 'could_be_better', 'i_barely_drink_water', 'not_sure'],
    domain: 'lifestyle',
    weight: 1,
  },
  {
    question_key: 'digestion_eating_pace',
    prompt_text: 'When you eat, would you say you tend to rush, or take your time?',
    answer_type: 'enum',
    allowed_values: ['usually_rushed', 'somewhere_in_between', 'usually_relaxed'],
    domain: 'lifestyle',
    weight: 1,
  },
  {
    question_key: 'digestion_social_impact',
    prompt_text: "Has this ever made you hesitant around meals out, travel, or social plans?",
    answer_type: 'boolean',
    domain: 'mindset',
    weight: 1,
  },
];
