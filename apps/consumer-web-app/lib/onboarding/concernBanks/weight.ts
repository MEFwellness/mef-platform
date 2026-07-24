/**
 * Question bank for members whose primary_concern is "weight" — surfaced in
 * Phase 3a as a real conversation about what's actually driving the goal,
 * not a calorie-and-scale intake form. Two of these sixteen are selected
 * per member (weighted-random, see lib/onboarding/adaptivePlan.ts),
 * alongside one fixed legacy anchor question. Coverage spans what's been
 * tried before, hunger and cravings, eating patterns and their emotional
 * texture, energy, confidence, and what success would genuinely look and
 * feel like — the goal is a member who feels like someone finally asked
 * the right questions, never a body-shaming or purely clinical framing.
 */

import type { ConcernQuestionSeed } from './types';

export const WEIGHT_BANK: ConcernQuestionSeed[] = [
  {
    question_key: 'weight_desired_outcome',
    prompt_text: "If this went really well, what would actually be different in six months?",
    answer_type: 'free_text',
    domain: 'mindset',
    weight: 1.5,
  },
  {
    question_key: 'weight_previous_attempts',
    prompt_text: "How many real attempts have you made at this before?",
    answer_type: 'enum',
    allowed_values: ['this_is_my_first_real_attempt', 'a_couple_of_times', 'many_times', 'i_feel_like_ive_tried_everything'],
    domain: 'mindset',
    weight: 1.5,
  },
  {
    question_key: 'weight_biggest_obstacle',
    prompt_text: "What's gotten in the way the most in the past?",
    helper_text: 'Select any that apply.',
    answer_type: 'multi_select',
    allowed_values: ['cravings', 'lack_of_time', 'inconsistent_motivation', 'stress_or_emotions', 'social_situations', 'not_knowing_what_actually_works', 'plateaus', 'lack_of_energy'],
    domain: 'lifestyle',
    weight: 1.5,
  },
  {
    question_key: 'weight_hunger_level',
    prompt_text: 'How would you describe your hunger on a normal day?',
    helper_text: '1 = rarely feel hungry, 5 = feel hungry often, hard to ignore.',
    answer_type: 'numeric',
    domain: 'nutrition_digestion',
    weight: 1,
  },
  {
    question_key: 'weight_craving_frequency',
    prompt_text: 'How often do strong cravings show up for you?',
    answer_type: 'enum',
    allowed_values: ['rarely', 'a_few_times_a_week', 'daily', 'multiple_times_a_day'],
    domain: 'nutrition_digestion',
    weight: 1,
  },
  {
    question_key: 'weight_craving_triggers',
    prompt_text: 'When cravings hit, what tends to be behind them?',
    answer_type: 'enum',
    allowed_values: ['stress_or_emotions', 'boredom', 'genuine_hunger', 'habit_or_time_of_day', 'being_around_certain_foods', 'not_sure'],
    domain: 'nutrition_digestion',
    weight: 1,
    requires: [{ question_key: 'weight_craving_frequency', op: 'in', value: ['a_few_times_a_week', 'daily', 'multiple_times_a_day'] }],
  },
  {
    question_key: 'weight_energy_level',
    prompt_text: 'How would you rate your everyday energy right now?',
    helper_text: '1 = running on empty most days, 5 = genuinely energized.',
    answer_type: 'numeric',
    domain: 'movement_energy',
    weight: 1,
  },
  {
    question_key: 'weight_eating_pattern',
    prompt_text: 'Which best describes how you tend to eat during the day?',
    answer_type: 'enum',
    allowed_values: ['structured_meals', 'grazing_throughout_the_day', 'skip_meals_then_eat_a_lot_later', 'irregular_no_real_pattern'],
    domain: 'nutrition_digestion',
    weight: 1,
  },
  {
    question_key: 'weight_relationship_with_food',
    prompt_text: "Would you say your approach to food tends to be more restrictive, or more go-with-the-flow?",
    answer_type: 'enum',
    allowed_values: ['very_restrictive', 'somewhat_restrictive', 'fairly_intuitive', 'very_intuitive_no_rules'],
    domain: 'mindset',
    weight: 1,
  },
  {
    question_key: 'weight_emotional_eating',
    prompt_text: "Do you notice yourself eating in response to stress, boredom, or emotions, more than actual hunger?",
    answer_type: 'boolean',
    domain: 'mindset',
    weight: 1.5,
  },
  {
    question_key: 'weight_emotional_eating_frequency',
    prompt_text: 'How often would you say that happens?',
    answer_type: 'enum',
    allowed_values: ['rarely', 'sometimes', 'often', 'most_days'],
    domain: 'mindset',
    weight: 1,
    requires: [{ question_key: 'weight_emotional_eating', op: 'eq', value: true }],
  },
  {
    question_key: 'weight_confidence_impact',
    prompt_text: 'How much does this affect how confident you feel day to day?',
    helper_text: '1 = doesn’t really touch it, 5 = it affects it a lot.',
    answer_type: 'numeric',
    domain: 'mindset',
    weight: 1,
  },
  {
    question_key: 'weight_motivation_source',
    prompt_text: "What's driving this for you right now, more than anything else?",
    answer_type: 'enum',
    allowed_values: ['health_concerns', 'energy_and_vitality', 'how_i_look_and_feel', 'a_specific_event_or_milestone', 'longevity_for_family', 'confidence', 'other'],
    domain: 'mindset',
    weight: 1,
  },
  {
    question_key: 'weight_support_system',
    prompt_text: "Do you have people around you supporting this, or are you mostly figuring it out on your own?",
    answer_type: 'enum',
    allowed_values: ['strong_support', 'some_support', 'mostly_on_my_own', 'people_around_me_work_against_it'],
    domain: 'lifestyle',
    weight: 1,
  },
  {
    question_key: 'weight_activity_level',
    prompt_text: 'How would you describe your typical activity level right now?',
    answer_type: 'enum',
    allowed_values: ['mostly_sedentary', 'lightly_active', 'moderately_active', 'very_active'],
    domain: 'movement_energy',
    weight: 1,
  },
  {
    question_key: 'weight_success_feeling',
    prompt_text: "Beyond a number on a scale, what would actually make you feel like this worked?",
    answer_type: 'free_text',
    domain: 'mindset',
    weight: 1,
  },
];
