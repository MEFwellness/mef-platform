/**
 * Deep-dive question bank for members whose primary_concern is "stress". Two
 * of these sixteen are picked (alongside one fixed legacy anchor question)
 * to replace the old one-size-fits-all onboarding with questions that
 * actually earn their place for this member: where stress shows up in the
 * body, how it shows up emotionally, how fast they recover from it, where
 * it spills into daily life, and what they're already doing about it. See
 * types.ts for the full schema and the question_key/requires/boosts
 * ordering rules every bank file must follow.
 */

import type { ConcernQuestionSeed } from './types';

export const STRESS_BANK: ConcernQuestionSeed[] = [
  {
    question_key: 'stress_carrying_level',
    prompt_text: 'On a typical day, how much stress would you say you\'re carrying?',
    helper_text: '1 = barely any, 5 = about as much as you can handle.',
    answer_type: 'numeric',
    domain: 'mind_stress',
    weight: 1.5,
  },
  {
    question_key: 'stress_pattern',
    prompt_text: 'Does your stress feel more like a constant hum in the background, or does it come in sharp waves?',
    answer_type: 'enum',
    allowed_values: ['constant_low_level', 'sharp_waves', 'a_mix_of_both', 'depends_on_the_week'],
    domain: 'mind_stress',
    weight: 1,
  },
  {
    question_key: 'stress_physical_tension_location',
    prompt_text: 'Where does stress tend to show up in your body first?',
    helper_text: 'Select any that apply.',
    answer_type: 'multi_select',
    allowed_values: ['jaw_or_teeth', 'neck_and_shoulders', 'stomach', 'chest', 'headaches', 'lower_back', 'nowhere_specific', 'other'],
    domain: 'pain_structural',
    weight: 1.5,
  },
  {
    question_key: 'stress_jaw_tension_frequency',
    prompt_text: 'How often do you catch yourself clenching your jaw or grinding your teeth?',
    answer_type: 'enum',
    allowed_values: ['never', 'occasionally', 'most_days', 'almost_always'],
    domain: 'pain_structural',
    weight: 1,
    requires: [{ question_key: 'stress_physical_tension_location', op: 'in', value: ['jaw_or_teeth'] }],
  },
  {
    question_key: 'stress_headache_frequency',
    prompt_text: 'How often does stress seem to turn into a headache?',
    answer_type: 'enum',
    allowed_values: ['never', 'rarely', 'a_few_times_a_month', 'weekly_or_more'],
    domain: 'pain_structural',
    weight: 1,
    requires: [{ question_key: 'stress_physical_tension_location', op: 'in', value: ['headaches'] }],
  },
  {
    question_key: 'stress_emotional_symptoms',
    prompt_text: "Which of these have you been feeling more than you'd like lately?",
    helper_text: 'Select any that apply.',
    answer_type: 'multi_select',
    allowed_values: ['irritability', 'overwhelm', 'anxiousness', 'sadness', 'numbness', 'restlessness', 'none_of_these'],
    domain: 'mind_stress',
    weight: 1.5,
  },
  {
    question_key: 'stress_overwhelm_frequency',
    prompt_text: 'When overwhelm shows up, how often does it feel like genuinely too much?',
    answer_type: 'enum',
    allowed_values: ['rarely', 'sometimes', 'often', 'most_days'],
    domain: 'mind_stress',
    weight: 1,
    requires: [{ question_key: 'stress_emotional_symptoms', op: 'in', value: ['overwhelm'] }],
  },
  {
    question_key: 'stress_bounce_back_speed',
    prompt_text: 'After a stressful day or moment, how quickly do you feel like yourself again?',
    helper_text: '1 = it lingers for days, 5 = pretty much right away.',
    answer_type: 'numeric',
    domain: 'recovery',
    weight: 1,
  },
  {
    question_key: 'stress_impact_on_sleep',
    prompt_text: 'Does stress tend to follow you into bed and make it harder to fall asleep?',
    answer_type: 'boolean',
    domain: 'sleep',
    weight: 1,
  },
  {
    question_key: 'stress_impact_relationships',
    prompt_text: 'How much does your stress spill over onto the people around you — snapping, going quiet, that kind of thing?',
    answer_type: 'enum',
    allowed_values: ['not_at_all', 'a_little', 'noticeably', 'a_lot'],
    domain: 'mind_stress',
    weight: 1,
  },
  {
    question_key: 'stress_impact_eating',
    prompt_text: "When you're stressed, what tends to happen to your eating?",
    answer_type: 'enum',
    allowed_values: ['i_eat_more', 'i_eat_less', 'no_real_change', 'it_depends_on_the_day'],
    domain: 'nutrition_digestion',
    weight: 1,
  },
  {
    question_key: 'stress_current_coping',
    prompt_text: 'When stress hits, what do you actually reach for right now?',
    helper_text: "Select any that apply — no judgment, just want the real picture.",
    answer_type: 'multi_select',
    allowed_values: ['exercise', 'food', 'alcohol', 'scrolling_my_phone', 'talking_to_someone', 'alone_time', 'nothing_in_particular', 'other'],
    domain: 'mind_stress',
    weight: 1,
  },
  {
    question_key: 'stress_has_an_outlet',
    prompt_text: 'Right now, do you feel like you have any real outlet for stress?',
    answer_type: 'boolean',
    domain: 'mindset',
    weight: 1,
  },
  {
    question_key: 'stress_main_sources',
    prompt_text: "What's driving most of your stress these days?",
    helper_text: "Select whatever's realest — even a few at once.",
    answer_type: 'multi_select',
    allowed_values: ['work', 'family', 'money', 'health', 'relationships', 'uncertainty_about_the_future', 'too_much_on_my_plate', 'other'],
    domain: 'mind_stress',
    weight: 1.5,
  },
  {
    question_key: 'stress_work_impact',
    prompt_text: 'How is stress showing up in your work or day-to-day performance, if at all?',
    answer_type: 'free_text',
    domain: 'mind_stress',
    weight: 1,
  },
  {
    question_key: 'stress_wind_down_ability',
    prompt_text: 'At the end of the day, how easily can you actually switch off?',
    helper_text: "1 = I can't switch off at all, 5 = I switch off easily.",
    answer_type: 'numeric',
    domain: 'recovery',
    weight: 1,
  },
];
