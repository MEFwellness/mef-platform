/**
 * Question bank for members whose primary_concern is "general_optimization"
 * — surfaced in Phase 3a as a broad, exploratory conversation for members
 * who aren't chasing one specific problem but still want things to
 * genuinely improve. This bank also serves as the deep-dive fallback for
 * three other legacy primary_concern values that don't have a dedicated
 * bank of their own — "movement", "habits", and "other" — so it's written
 * to stay broad and inclusive rather than narrowly about one goal. Three
 * of these sixteen are selected per member (weighted-random, see
 * lib/onboarding/adaptivePlan.ts); unlike performance and healthy_aging,
 * there's no fixed legacy anchor question backing this concern, so all
 * three shown questions come from here. Coverage spans what "better" would
 * actually look like, where they'd focus first, satisfaction with current
 * habits, where they already sense room to grow, what's worked for them
 * before, their day-to-day relationship with their own health, what a
 * small early win would look like, and whether they lean toward structure
 * or flexibility.
 */

import type { ConcernQuestionSeed } from './types';

export const GENERAL_OPTIMIZATION_BANK: ConcernQuestionSeed[] = [
  {
    question_key: 'general_optimization_better_definition',
    prompt_text: "If things were meaningfully better a year from now, what would actually be different?",
    answer_type: 'free_text',
    domain: 'all',
    weight: 1,
  },
  {
    question_key: 'general_optimization_priority_area',
    prompt_text: 'If you had to pick just one area to focus on first, what would it be?',
    answer_type: 'enum',
    allowed_values: ['sleep', 'movement_and_energy', 'nutrition', 'stress_and_mindset', 'structure_and_habits', 'not_sure'],
    domain: 'all',
    weight: 1.5,
  },
  {
    question_key: 'general_optimization_habit_satisfaction',
    prompt_text: 'Overall, how satisfied are you with your day-to-day habits right now?',
    helper_text: '1 = not satisfied at all, 5 = genuinely happy with them.',
    answer_type: 'numeric',
    domain: 'lifestyle',
    weight: 1.5,
  },
  {
    question_key: 'general_optimization_growth_area',
    prompt_text: "If you're honest with yourself, where do you already sense the biggest opportunity for growth?",
    answer_type: 'enum',
    allowed_values: ['sleep', 'movement', 'nutrition', 'stress_management', 'consistency_and_follow_through', 'relationship_with_food_or_body', 'not_sure'],
    domain: 'all',
    weight: 1,
  },
  {
    question_key: 'general_optimization_past_success',
    prompt_text: "Have you successfully built a healthy habit before, even a small one?",
    answer_type: 'boolean',
    domain: 'mindset',
    weight: 1,
  },
  {
    question_key: 'general_optimization_past_success_area',
    prompt_text: 'Where in life have you made a change like that actually stick?',
    helper_text: 'Select any that apply.',
    answer_type: 'multi_select',
    allowed_values: ['nutrition', 'movement', 'sleep', 'stress_management', 'a_totally_different_area'],
    domain: 'mindset',
    weight: 1,
    requires: [{ question_key: 'general_optimization_past_success', op: 'eq', value: true }],
  },
  {
    question_key: 'general_optimization_health_relationship',
    prompt_text: 'Right now, how would you describe your relationship with your own health?',
    answer_type: 'enum',
    allowed_values: ['a_partnership', 'a_chore', 'a_source_of_stress', 'something_i_avoid_thinking_about', 'pretty_good_honestly'],
    domain: 'mindset',
    weight: 1,
    boosts: [{ question_key: 'primary_concern', op: 'eq', value: 'other', amount: 1.5 }],
  },
  {
    question_key: 'general_optimization_small_win',
    prompt_text: 'What would a small, real win in the next couple of weeks actually look like for you?',
    answer_type: 'free_text',
    domain: 'all',
    weight: 1,
  },
  {
    question_key: 'general_optimization_structure_preference',
    prompt_text: 'Are you someone who does better with a lot of structure, or a lot of flexibility?',
    answer_type: 'enum',
    allowed_values: ['clear_structure', 'some_structure', 'mostly_flexible', 'fully_flexible'],
    domain: 'mindset',
    weight: 1.5,
  },
  {
    question_key: 'general_optimization_movement_frequency',
    prompt_text: 'In a typical week, how much are you moving your body?',
    helper_text: '1 = barely at all, 5 = very regularly.',
    answer_type: 'numeric',
    domain: 'movement_energy',
    weight: 1,
    boosts: [{ question_key: 'primary_concern', op: 'eq', value: 'movement', amount: 1.5 }],
  },
  {
    question_key: 'general_optimization_nutrition_confidence',
    prompt_text: "How confident do you feel in the way you're eating day to day?",
    helper_text: '1 = not confident at all, 5 = very confident.',
    answer_type: 'numeric',
    domain: 'nutrition_digestion',
    weight: 1,
  },
  {
    question_key: 'general_optimization_stress_level',
    prompt_text: 'How would you rate your day-to-day stress right now?',
    helper_text: '1 = very low, 5 = very high.',
    answer_type: 'numeric',
    domain: 'mindset',
    weight: 1,
  },
  {
    question_key: 'general_optimization_energy_levels',
    prompt_text: 'How would you rate your everyday energy levels lately?',
    helper_text: '1 = running on empty, 5 = consistently energized.',
    answer_type: 'numeric',
    domain: 'movement_energy',
    weight: 1,
  },
  {
    question_key: 'general_optimization_biggest_barrier',
    prompt_text: "What usually derails you when you're trying to build something new?",
    helper_text: 'Select any that apply.',
    answer_type: 'multi_select',
    allowed_values: ['time', 'energy', 'motivation', 'knowledge', 'support', 'consistency', 'other'],
    domain: 'lifestyle',
    weight: 1,
    boosts: [{ question_key: 'primary_concern', op: 'eq', value: 'habits', amount: 1.5 }],
  },
  {
    question_key: 'general_optimization_motivation_source',
    prompt_text: "What's really motivating you to focus on your health right now?",
    answer_type: 'enum',
    allowed_values: ['a_specific_goal', 'feeling_better_day_to_day', 'a_health_scare', 'someone_i_care_about', 'general_prevention', 'other'],
    domain: 'mindset',
    weight: 1,
  },
  {
    question_key: 'general_optimization_support_system',
    prompt_text: 'Do you feel like you have people around you who support your health goals?',
    answer_type: 'boolean',
    domain: 'lifestyle',
    weight: 1,
  },
];
