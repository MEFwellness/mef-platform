/**
 * Question bank for members whose primary_concern is "healthy_aging" —
 * surfaced in Phase 3a as a real conversation about how they want to move,
 * feel, and function years from now, not a decline checklist. Two of these
 * sixteen are selected per member (weighted-random, see
 * lib/onboarding/adaptivePlan.ts), alongside one fixed legacy anchor
 * question. Coverage spans mobility and strength trends over time, balance
 * and stability confidence, joint health, memory and focus (framed gently,
 * never clinically), family health history (framed as something worth
 * understanding, never as a diagnostic signal), independence goals for the
 * decades ahead, everyday vitality, and what "aging well" personally means
 * to them. Nothing here screens for or names a condition — it stays in
 * coaching language so a member feels understood, not evaluated.
 */

import type { ConcernQuestionSeed } from './types';

export const HEALTHY_AGING_BANK: ConcernQuestionSeed[] = [
  {
    question_key: 'healthy_aging_definition',
    prompt_text: 'When you imagine aging well, what does that actually look like for you?',
    answer_type: 'free_text',
    domain: 'mindset',
    weight: 1,
  },
  {
    question_key: 'healthy_aging_mobility_trend',
    prompt_text: 'Compared to a few years ago, how would you rate your flexibility and range of motion today?',
    helper_text: '1 = noticeably more limited, 5 = just as free as ever.',
    answer_type: 'numeric',
    domain: 'movement_energy',
    weight: 1,
  },
  {
    question_key: 'healthy_aging_strength_trend',
    prompt_text: "Have you noticed a real change in your overall strength over the past few years?",
    answer_type: 'enum',
    allowed_values: ['noticeably_stronger', 'about_the_same', 'some_decline', 'significant_decline'],
    domain: 'movement_energy',
    weight: 1.5,
  },
  {
    question_key: 'healthy_aging_strength_area',
    prompt_text: "Where have you noticed that most?",
    helper_text: 'Select any that apply.',
    answer_type: 'multi_select',
    allowed_values: ['legs_and_hips', 'core', 'upper_body', 'grip_strength', 'overall_stamina', 'not_sure'],
    domain: 'movement_energy',
    weight: 1,
    requires: [{ question_key: 'healthy_aging_strength_trend', op: 'in', value: ['some_decline', 'significant_decline'] }],
  },
  {
    question_key: 'healthy_aging_balance_confidence',
    prompt_text: 'How confident do you feel in your balance and stability day to day?',
    helper_text: '1 = not confident at all, 5 = completely steady.',
    answer_type: 'numeric',
    domain: 'pain_structural',
    weight: 1.5,
  },
  {
    question_key: 'healthy_aging_joint_health',
    prompt_text: 'How would you describe your joints these days — knees, hips, shoulders?',
    answer_type: 'enum',
    allowed_values: ['feel_great', 'occasional_stiffness', 'regular_discomfort', 'significant_limitation'],
    domain: 'pain_structural',
    weight: 1,
  },
  {
    question_key: 'healthy_aging_cognitive_sharpness',
    prompt_text: 'How sharp does your memory and focus feel lately, compared to how they used to?',
    helper_text: '1 = noticeably foggier, 5 = just as sharp as ever.',
    answer_type: 'numeric',
    domain: 'mindset',
    weight: 1,
  },
  {
    question_key: 'healthy_aging_family_history',
    prompt_text: "Is there anything in your family's health history that feels worth understanding better as you think about your own aging?",
    answer_type: 'boolean',
    domain: 'mindset',
    weight: 1.5,
  },
  {
    question_key: 'healthy_aging_family_history_detail',
    prompt_text: "What's on your mind there?",
    answer_type: 'free_text',
    domain: 'mindset',
    weight: 1,
    requires: [{ question_key: 'healthy_aging_family_history', op: 'eq', value: true }],
  },
  {
    question_key: 'healthy_aging_independence_goal',
    prompt_text: 'Looking 10 or 20 years down the road, what do you want to still be fully able to do on your own?',
    helper_text: 'Select any that apply.',
    answer_type: 'multi_select',
    allowed_values: ['play_with_grandkids_or_kids', 'travel_easily', 'live_without_assistance', 'keep_doing_a_hobby_or_sport', 'work_as_long_as_i_want', 'other'],
    domain: 'lifestyle',
    weight: 1.5,
  },
  {
    question_key: 'healthy_aging_energy_trend',
    prompt_text: "Compared to a few years ago, how's your overall energy and vitality?",
    helper_text: '1 = much lower than it was, 5 = just as high as ever.',
    answer_type: 'numeric',
    domain: 'recovery',
    weight: 1,
  },
  {
    question_key: 'healthy_aging_recovery_pace',
    prompt_text: 'After a physically demanding day, how long does it usually take you to feel back to normal?',
    answer_type: 'enum',
    allowed_values: ['same_day', 'a_day_or_two', 'several_days', 'over_a_week'],
    domain: 'recovery',
    weight: 1,
  },
  {
    question_key: 'healthy_aging_daily_function_worry',
    prompt_text: "Is there a specific everyday movement — stairs, getting up from the floor, carrying groceries — that's started to feel harder?",
    answer_type: 'enum',
    allowed_values: ['nothing_comes_to_mind', 'stairs', 'getting_up_and_down', 'carrying_or_lifting', 'walking_long_distances', 'other'],
    domain: 'pain_structural',
    weight: 1,
  },
  {
    question_key: 'healthy_aging_activity_level',
    prompt_text: 'How physically active would you say you are in a normal week?',
    helper_text: '1 = mostly sedentary, 5 = very active.',
    answer_type: 'numeric',
    domain: 'movement_energy',
    weight: 1,
  },
  {
    question_key: 'healthy_aging_motivation_source',
    prompt_text: "What's really driving you to focus on this now?",
    answer_type: 'enum',
    allowed_values: ['a_health_scare', 'watching_a_loved_one', 'wanting_to_stay_independent', 'general_prevention', 'a_specific_goal', 'other'],
    domain: 'mindset',
    weight: 1,
  },
  {
    question_key: 'healthy_aging_role_model',
    prompt_text: "Who's someone you consider to be aging really well, and what stands out about them?",
    answer_type: 'free_text',
    domain: 'mindset',
    weight: 1,
  },
];
