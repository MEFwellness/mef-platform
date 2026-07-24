/**
 * Question bank for members whose primary_concern is "performance" —
 * surfaced in Phase 3a as a deep-dive into what performing well actually
 * means for this specific person, whether that's a sport, a training goal,
 * or simply wanting to feel more capable in daily life. Two of these
 * sixteen are selected per member (weighted-random, see
 * lib/onboarding/adaptivePlan.ts), alongside one fixed legacy anchor
 * question. Coverage spans their personal definition of performance,
 * current training load and type, plateaus, recovery between efforts,
 * consistency, a specific goal or event (if any), what's held them back
 * before, the mental side of performing under pressure, and how they fuel
 * their body around activity. This is a coaching conversation, not a
 * training-max intake form — nothing here diagnoses or prescribes.
 */

import type { ConcernQuestionSeed } from './types';

export const PERFORMANCE_BANK: ConcernQuestionSeed[] = [
  {
    question_key: 'performance_definition',
    prompt_text: 'When you picture yourself performing at your best, what does that actually look like day to day?',
    answer_type: 'free_text',
    domain: 'mindset',
    weight: 1,
  },
  {
    question_key: 'performance_activity_type',
    prompt_text: 'What does your current training or activity mostly look like?',
    helper_text: 'Select any that apply.',
    answer_type: 'multi_select',
    allowed_values: ['strength_training', 'endurance_or_cardio', 'team_or_individual_sport', 'functional_daily_movement', 'mobility_or_flexibility_work', 'other'],
    domain: 'movement_energy',
    weight: 1.5,
  },
  {
    question_key: 'performance_training_frequency',
    prompt_text: 'In a typical week, how many days are you actually training or working on this?',
    answer_type: 'enum',
    allowed_values: ['0_to_1', '2_to_3', '4_to_5', '6_plus'],
    domain: 'movement_energy',
    weight: 1,
  },
  {
    question_key: 'performance_training_intensity',
    prompt_text: "On the days you do train, how hard would you say you're pushing yourself?",
    helper_text: '1 = pretty easy effort, 5 = leaving everything out there.',
    answer_type: 'numeric',
    domain: 'movement_energy',
    weight: 1,
  },
  {
    question_key: 'performance_plateau',
    prompt_text: "Does it feel like your progress has stalled recently, even though you're still putting in the work?",
    answer_type: 'boolean',
    domain: 'movement_energy',
    weight: 1.5,
  },
  {
    question_key: 'performance_plateau_duration',
    prompt_text: "About how long has it felt like you've been stuck at this level?",
    answer_type: 'enum',
    allowed_values: ['less_than_a_month', 'one_to_three_months', 'three_to_six_months', 'over_six_months'],
    domain: 'movement_energy',
    weight: 1,
    requires: [{ question_key: 'performance_plateau', op: 'eq', value: true }],
  },
  {
    question_key: 'performance_sleep_quality',
    prompt_text: 'How rested do you typically feel heading into a training day or a big effort?',
    helper_text: '1 = running on empty, 5 = fully rested.',
    answer_type: 'numeric',
    domain: 'sleep',
    weight: 1,
  },
  {
    question_key: 'performance_recovery_between_efforts',
    prompt_text: 'After a hard session or event, how fully do you feel recovered before the next one?',
    helper_text: "1 = still beat up, 5 = completely bounced back.",
    answer_type: 'numeric',
    domain: 'recovery',
    weight: 1,
  },
  {
    question_key: 'performance_consistency',
    prompt_text: 'How consistent has your training or practice actually been over the last month or so?',
    helper_text: '1 = on-and-off at best, 5 = like clockwork.',
    answer_type: 'numeric',
    domain: 'movement_energy',
    weight: 1,
  },
  {
    question_key: 'performance_consistency_barrier',
    prompt_text: 'What tends to knock you off your rhythm?',
    helper_text: 'Select any that apply.',
    answer_type: 'multi_select',
    allowed_values: ['time', 'energy', 'motivation', 'injury_or_pain', 'travel_or_schedule', 'life_stress', 'other'],
    domain: 'lifestyle',
    weight: 1,
  },
  {
    question_key: 'performance_specific_goal',
    prompt_text: "Is there a specific goal, event, or milestone you're training toward right now?",
    answer_type: 'boolean',
    domain: 'movement_energy',
    weight: 1.5,
  },
  {
    question_key: 'performance_goal_description',
    prompt_text: "Tell me about it — what are you working toward?",
    answer_type: 'free_text',
    domain: 'movement_energy',
    weight: 1,
    requires: [{ question_key: 'performance_specific_goal', op: 'eq', value: true }],
  },
  {
    question_key: 'performance_goal_timeline',
    prompt_text: 'How far out is that goal?',
    answer_type: 'enum',
    allowed_values: ['within_a_month', 'one_to_three_months', 'three_to_six_months', 'six_months_plus', 'no_fixed_date'],
    domain: 'movement_energy',
    weight: 1,
    requires: [{ question_key: 'performance_specific_goal', op: 'eq', value: true }],
  },
  {
    question_key: 'performance_past_obstacle',
    prompt_text: "Looking back, what's most often gotten in the way of you performing the way you want to?",
    answer_type: 'enum',
    allowed_values: ['injury_or_pain', 'burnout_or_overtraining', 'lack_of_time', 'lack_of_structure', 'motivation_dips', 'nerves_or_pressure', 'other'],
    domain: 'mindset',
    weight: 1,
  },
  {
    question_key: 'performance_mental_composure',
    prompt_text: 'When it really counts — a big lift, a race, a big moment at work — how focused and composed do you feel?',
    helper_text: '1 = rattled and scattered, 5 = locked in and confident.',
    answer_type: 'numeric',
    domain: 'mindset',
    weight: 1,
  },
  {
    question_key: 'performance_fueling_habits',
    prompt_text: 'How would you describe the way you fuel your body around training or big performance days?',
    answer_type: 'enum',
    allowed_values: ['dialed_in', 'pretty_good', 'inconsistent', 'rarely_think_about_it'],
    domain: 'nutrition_digestion',
    weight: 1,
  },
];
