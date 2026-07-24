/**
 * Deep-dive question bank for members whose primary_concern is "energy". Two
 * of these sixteen are picked (alongside one fixed legacy anchor question)
 * to replace the old one-size-fits-all onboarding with questions that
 * actually earn their place for this member: when energy dips hardest, what
 * they're leaning on to push through it, and how sleep, movement, food,
 * and stress each seem to be feeding (or draining) it. See types.ts for the
 * full schema and the question_key/requires/boosts ordering rules every
 * bank file must follow.
 */

import type { ConcernQuestionSeed } from './types';

export const ENERGY_BANK: ConcernQuestionSeed[] = [
  {
    question_key: 'energy_dip_time',
    prompt_text: 'When does your energy tend to crash the hardest during the day?',
    answer_type: 'enum',
    allowed_values: ['morning', 'mid_afternoon', 'evening', 'it_doesnt_really_dip', 'it_varies_a_lot'],
    domain: 'movement_energy',
    weight: 1.5,
  },
  {
    question_key: 'energy_caffeine_reliance',
    prompt_text: 'How much are you leaning on caffeine to get through a normal day?',
    answer_type: 'enum',
    allowed_values: ['none', 'one_serving', 'two_to_three_servings', 'four_or_more_servings'],
    domain: 'nutrition_digestion',
    weight: 1.5,
  },
  {
    question_key: 'energy_sugar_reliance',
    prompt_text: 'When your energy dips, do you find yourself reaching for something sugary or quick to fix it?',
    answer_type: 'enum',
    allowed_values: ['often', 'sometimes', 'rarely', 'never'],
    domain: 'nutrition_digestion',
    weight: 1,
  },
  {
    question_key: 'energy_motivation_to_move',
    prompt_text: 'How much does your energy level decide whether you actually move your body that day?',
    helper_text: '1 = no connection at all, 5 = it completely decides it.',
    answer_type: 'numeric',
    domain: 'movement_energy',
    weight: 1,
  },
  {
    question_key: 'energy_motivation_to_socialize',
    prompt_text: 'How often does low energy make you want to cancel plans or avoid people?',
    helper_text: "1 = never, 5 = it's usually the reason.",
    answer_type: 'numeric',
    domain: 'movement_energy',
    weight: 1,
  },
  {
    question_key: 'energy_sleep_connection',
    prompt_text: 'How closely tied is your energy to how well you slept the night before?',
    answer_type: 'enum',
    allowed_values: ['directly_tied', 'somewhat_tied', 'not_really_connected', 'not_sure'],
    domain: 'sleep',
    weight: 1.5,
  },
  {
    question_key: 'energy_nutrition_connection',
    prompt_text: 'Do you notice your energy shifting based on what or when you eat?',
    answer_type: 'enum',
    allowed_values: ['yes_clearly', 'somewhat', 'not_really', 'havent_really_paid_attention'],
    domain: 'nutrition_digestion',
    weight: 1,
  },
  {
    question_key: 'energy_changed_recently',
    prompt_text: 'Has your energy changed recently, or has it felt like this for a long time?',
    answer_type: 'enum',
    allowed_values: ['a_recent_change', 'a_gradual_decline_over_time', 'always_been_this_way', 'not_sure'],
    domain: 'movement_energy',
    weight: 1,
  },
  {
    question_key: 'energy_recent_change_reason',
    prompt_text: 'What do you think changed?',
    answer_type: 'free_text',
    domain: 'movement_energy',
    weight: 1,
    requires: [{ question_key: 'energy_changed_recently', op: 'eq', value: 'a_recent_change' }],
  },
  {
    question_key: 'energy_mental_vs_physical',
    prompt_text: 'Is it more your body that feels tired, or your mind — or both?',
    answer_type: 'enum',
    allowed_values: ['mostly_physical', 'mostly_mental', 'both_equally', 'not_sure'],
    domain: 'mindset',
    weight: 1,
  },
  {
    question_key: 'energy_ideal_day_feeling',
    prompt_text: 'If you had a genuinely energized day, what would that actually feel like for you?',
    answer_type: 'free_text',
    domain: 'mindset',
    weight: 1,
  },
  {
    question_key: 'energy_stress_drain',
    prompt_text: "How much does stress feel like it's draining your energy right now?",
    helper_text: "1 = not at all, 5 = it's the main thing draining me.",
    answer_type: 'numeric',
    domain: 'mind_stress',
    weight: 1,
  },
  {
    question_key: 'energy_exercise_frequency',
    prompt_text: 'How often are you moving your body in a typical week — walks, workouts, anything active?',
    answer_type: 'enum',
    allowed_values: ['rarely_or_never', 'once_or_twice', 'a_few_times', 'most_days'],
    domain: 'movement_energy',
    weight: 1.5,
  },
  {
    question_key: 'energy_exercise_effect',
    prompt_text: "After you've been active, how does your energy usually respond?",
    answer_type: 'enum',
    allowed_values: ['it_boosts_my_energy', 'it_drains_me_for_the_rest_of_the_day', 'it_depends_on_the_day', 'no_noticeable_effect'],
    domain: 'movement_energy',
    weight: 1,
    requires: [{ question_key: 'energy_exercise_frequency', op: 'in', value: ['once_or_twice', 'a_few_times', 'most_days'] }],
  },
  {
    question_key: 'energy_morning_startup',
    prompt_text: "Do you wake up already feeling behind on energy, before the day's even started?",
    answer_type: 'boolean',
    domain: 'sleep',
    weight: 1,
  },
  {
    question_key: 'energy_drainers',
    prompt_text: 'What tends to drain your energy the most in a normal week?',
    helper_text: 'Select any that apply.',
    answer_type: 'multi_select',
    allowed_values: ['poor_sleep', 'stress', 'skipping_meals', 'too_much_screen_time', 'lack_of_movement', 'an_overloaded_schedule', 'not_sure', 'other'],
    domain: 'movement_energy',
    weight: 1,
  },
];
