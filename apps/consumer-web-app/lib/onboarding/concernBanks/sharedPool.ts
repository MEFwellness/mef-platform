/**
 * Phase 3b's "zoom out" sampler bank — the one place in the assessment that
 * touches Recovery, Lifestyle, and Mindset, three of the brief's eight
 * shared-wellness domains that nothing else (not the legacy 12, not any
 * concern bank) currently asks about at all. Exactly one of these is picked
 * per member (see lib/onboarding/adaptivePlan.ts's pickPhase3bQuestion),
 * weighted/boosted by primary_concern — which is always known by Phase 3,
 * unlike the same-bank-only restriction concern banks are under.
 */

import type { ConcernQuestionSeed } from './types';

export const SHARED_POOL_BANK: ConcernQuestionSeed[] = [
  {
    question_key: 'shared_recovery_soreness_frequency',
    prompt_text: 'How often do you feel overly sore or run-down after being active?',
    answer_type: 'enum',
    allowed_values: ['rarely', 'sometimes', 'often', 'constantly'],
    domain: 'recovery',
    weight: 1,
  },
  {
    question_key: 'shared_recovery_rest_days',
    prompt_text: 'How many rest or recovery days do you usually build into your week?',
    answer_type: 'enum',
    allowed_values: ['0', '1', '2', '3+'],
    domain: 'recovery',
    weight: 1,
  },
  {
    question_key: 'shared_recovery_bounce_back',
    prompt_text: 'After a demanding day, how quickly would you say your body bounces back?',
    answer_type: 'numeric',
    domain: 'recovery',
    weight: 1,
    boosts: [
      { question_key: 'primary_concern', op: 'in', value: ['pain', 'performance', 'healthy_aging', 'movement'], amount: 1.5 },
    ],
  },
  {
    question_key: 'shared_recovery_injury_history',
    prompt_text: 'Do you have any past injuries that still affect how you move today?',
    answer_type: 'boolean',
    domain: 'recovery',
    weight: 1,
    boosts: [{ question_key: 'primary_concern', op: 'eq', value: 'pain', amount: 1.5 }],
  },
  {
    question_key: 'shared_lifestyle_routine_consistency',
    prompt_text: 'How consistent is your daily routine, day to day?',
    helper_text: '1 = it changes constantly, 5 = it looks about the same every day.',
    answer_type: 'numeric',
    domain: 'lifestyle',
    weight: 1,
  },
  {
    question_key: 'shared_lifestyle_support_system',
    prompt_text: 'How much support do you feel you have from people around you for your health goals?',
    answer_type: 'enum',
    allowed_values: ['strong', 'some', 'little', 'none'],
    domain: 'lifestyle',
    weight: 1,
  },
  {
    question_key: 'shared_lifestyle_time_availability',
    prompt_text: 'On a typical day, how much time do you feel you genuinely have for yourself?',
    answer_type: 'enum',
    allowed_values: ['almost_none', 'a_little', 'a_fair_amount', 'plenty'],
    domain: 'lifestyle',
    weight: 1,
  },
  {
    question_key: 'shared_lifestyle_biggest_barrier',
    prompt_text: 'What tends to get in the way of sticking with healthy habits?',
    helper_text: 'Select any that apply.',
    answer_type: 'multi_select',
    allowed_values: ['time', 'energy', 'motivation', 'knowledge', 'cost', 'consistency', 'other'],
    domain: 'lifestyle',
    weight: 1,
    boosts: [
      { question_key: 'primary_concern', op: 'in', value: ['weight', 'habits', 'general_optimization'], amount: 1.5 },
    ],
  },
  {
    question_key: 'shared_mindset_self_talk',
    prompt_text: "When things don't go as planned with your health, how would you describe your inner voice?",
    answer_type: 'enum',
    allowed_values: ['mostly_kind', 'mixed', 'mostly_critical'],
    domain: 'mindset',
    weight: 1,
  },
  {
    question_key: 'shared_mindset_optimism',
    prompt_text: 'How hopeful do you feel about making real progress from here?',
    answer_type: 'numeric',
    domain: 'mindset',
    weight: 1,
    boosts: [
      { question_key: 'primary_concern', op: 'in', value: ['stress', 'general_optimization', 'other'], amount: 1.5 },
    ],
  },
  {
    question_key: 'shared_mindset_past_success',
    prompt_text: 'Have you experienced real success with a health change before, even a small one?',
    answer_type: 'boolean',
    domain: 'mindset',
    weight: 1,
  },
  {
    question_key: 'shared_mindset_biggest_why',
    prompt_text: "What's the real reason this matters to you right now?",
    answer_type: 'free_text',
    domain: 'mindset',
    weight: 1,
    boosts: [{ question_key: 'primary_concern', op: 'in', value: ['weight', 'habits'], amount: 1.5 }],
  },
];
