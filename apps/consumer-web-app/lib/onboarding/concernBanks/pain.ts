/**
 * Question bank for members whose primary_concern is "pain" — surfaced in
 * Phase 3a as a deep-dive into the specific discomfort they're carrying,
 * not a generic pain scale. Two of these sixteen are selected per member
 * (weighted-random, see lib/onboarding/adaptivePlan.ts), alongside one
 * fixed legacy anchor question. Coverage spans where it lives, how long
 * it's been there, what makes it worse or better, whether it's been
 * treated before, and how it's actually showing up in daily life — sleep,
 * mood, and the specific activities it's taking off the table. Nothing
 * here diagnoses or names a condition; it stays in coaching language so a
 * member feels heard, not screened.
 */

import type { ConcernQuestionSeed } from './types';

export const PAIN_BANK: ConcernQuestionSeed[] = [
  {
    question_key: 'pain_primary_location',
    prompt_text: 'Where in your body has been bothering you the most lately?',
    answer_type: 'enum',
    allowed_values: [
      'neck',
      'shoulders',
      'upper_back',
      'lower_back',
      'hips',
      'knees',
      'feet_or_ankles',
      'hands_or_wrists',
      'widespread',
      'other',
    ],
    domain: 'pain_structural',
    weight: 1.5,
  },
  {
    question_key: 'pain_secondary_location',
    prompt_text: "Is there a second spot that's been acting up too, or is it really just the one area?",
    helper_text: 'Select any others that apply.',
    answer_type: 'multi_select',
    allowed_values: [
      'neck',
      'shoulders',
      'upper_back',
      'lower_back',
      'hips',
      'knees',
      'feet_or_ankles',
      'hands_or_wrists',
      'none_just_the_one_spot',
    ],
    domain: 'pain_structural',
    weight: 1,
    requires: [{ question_key: 'pain_primary_location', op: 'in', value: ['neck', 'shoulders', 'upper_back', 'lower_back', 'hips', 'knees', 'feet_or_ankles', 'hands_or_wrists', 'other'] }],
  },
  {
    question_key: 'pain_duration',
    prompt_text: "How long has this been part of your life — days, months, longer?",
    answer_type: 'enum',
    allowed_values: ['under_2_weeks', '2_weeks_to_3_months', '3_to_12_months', 'over_a_year', 'on_and_off_for_years'],
    domain: 'pain_structural',
    weight: 1.5,
  },
  {
    question_key: 'pain_pattern',
    prompt_text: "Is it there constantly, or does it come and go depending on the day?",
    answer_type: 'enum',
    allowed_values: ['constant', 'comes_and_goes', 'only_with_certain_movements', 'mostly_gone_now'],
    domain: 'pain_structural',
    weight: 1,
  },
  {
    question_key: 'pain_intensity_typical',
    prompt_text: 'On a typical day, how much does it demand your attention?',
    helper_text: '1 = barely notice it, 5 = hard to think about anything else.',
    answer_type: 'numeric',
    domain: 'pain_structural',
    weight: 1.5,
  },
  {
    question_key: 'pain_worst_moments',
    prompt_text: "At its worst, how much does it throw off your day?",
    helper_text: '1 = a minor annoyance, 5 = it stops me in my tracks.',
    answer_type: 'numeric',
    domain: 'pain_structural',
    weight: 1,
  },
  {
    question_key: 'pain_previous_injury',
    prompt_text: 'Does this trace back to a specific injury or event, or has it just crept in over time?',
    answer_type: 'enum',
    allowed_values: ['specific_injury_or_accident', 'gradual_onset', 'after_a_surgery', 'not_sure_where_it_started'],
    domain: 'pain_structural',
    weight: 1,
  },
  {
    question_key: 'pain_aggravating_activities',
    prompt_text: "What tends to set it off or make it worse?",
    helper_text: 'Select any that apply.',
    answer_type: 'multi_select',
    allowed_values: ['sitting_for_long_periods', 'standing_for_long_periods', 'bending_or_twisting', 'lifting', 'exercise_or_sports', 'sleeping_position', 'stress_or_tension', 'cold_weather', 'not_sure'],
    domain: 'pain_structural',
    weight: 1.5,
  },
  {
    question_key: 'pain_relieving_activities',
    prompt_text: "And on the flip side — what actually helps, even a little?",
    helper_text: 'Select any that apply.',
    answer_type: 'multi_select',
    allowed_values: ['rest', 'gentle_movement_or_stretching', 'heat', 'ice', 'massage_or_bodywork', 'medication', 'nothing_reliably_helps'],
    domain: 'pain_structural',
    weight: 1,
  },
  {
    question_key: 'pain_disrupts_sleep',
    prompt_text: 'Does it ever wake you up at night or make it hard to get comfortable?',
    answer_type: 'boolean',
    domain: 'recovery',
    weight: 1,
  },
  {
    question_key: 'pain_prior_treatment_tried',
    prompt_text: "Have you tried working on this before — physical therapy, a professional, anything at home?",
    answer_type: 'enum',
    allowed_values: ['yes_saw_a_professional', 'yes_tried_things_on_my_own', 'no_havent_addressed_it_yet', 'currently_working_on_it'],
    domain: 'pain_structural',
    weight: 1,
  },
  {
    question_key: 'pain_treatment_helped',
    prompt_text: 'Did what you tried actually move the needle, or did it not really stick?',
    answer_type: 'enum',
    allowed_values: ['helped_a_lot', 'helped_somewhat', 'didnt_really_help', 'too_soon_to_tell'],
    domain: 'pain_structural',
    weight: 1,
    requires: [{ question_key: 'pain_prior_treatment_tried', op: 'in', value: ['yes_saw_a_professional', 'yes_tried_things_on_my_own', 'currently_working_on_it'] }],
  },
  {
    question_key: 'pain_mood_impact',
    prompt_text: "Has dealing with this affected your mood or confidence at all?",
    answer_type: 'numeric',
    helper_text: '1 = not really, 5 = it weighs on me a lot.',
    domain: 'mindset',
    weight: 1,
  },
  {
    question_key: 'pain_activity_limited',
    prompt_text: "Is there something specific you love doing that this has gotten in the way of?",
    answer_type: 'free_text',
    domain: 'movement_energy',
    weight: 1,
  },
  {
    question_key: 'pain_avoids_movement',
    prompt_text: 'Would you say you hold back from moving or exercising because of it?',
    answer_type: 'boolean',
    domain: 'movement_energy',
    weight: 1,
  },
  {
    question_key: 'pain_daily_task_difficulty',
    prompt_text: "Are there everyday things — carrying groceries, playing with kids, getting up from a chair — that feel harder than they should?",
    answer_type: 'enum',
    allowed_values: ['yes_several_things', 'yes_one_or_two_things', 'not_really', 'not_at_all'],
    domain: 'movement_energy',
    weight: 1,
  },
];
