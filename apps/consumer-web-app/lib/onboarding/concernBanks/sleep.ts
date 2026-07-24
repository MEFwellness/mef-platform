/**
 * Deep-dive question bank for members whose primary_concern is "sleep". Two
 * of these sixteen are picked (alongside one fixed legacy anchor question)
 * to replace the old one-size-fits-all onboarding with questions that
 * actually earn their place for this member: getting to sleep, staying
 * asleep, waking rested, and the daily habits that shape all three. See
 * types.ts for the full schema and the question_key/requires/boosts
 * ordering rules every bank file must follow.
 */

import type { ConcernQuestionSeed } from './types';

export const SLEEP_BANK: ConcernQuestionSeed[] = [
  {
    question_key: 'sleep_falling_asleep_time',
    prompt_text: "Once you're actually in bed, how long does it usually take you to fall asleep?",
    answer_type: 'enum',
    allowed_values: ['under_10_minutes', '10_to_20_minutes', '20_to_40_minutes', 'over_40_minutes'],
    domain: 'sleep',
    weight: 1.5,
  },
  {
    question_key: 'sleep_racing_mind',
    prompt_text: "As you're trying to drift off, how much is your mind still running?",
    helper_text: '1 = completely quiet, 5 = constant chatter.',
    answer_type: 'numeric',
    domain: 'mindset',
    weight: 1.5,
  },
  {
    question_key: 'sleep_night_waking_frequency',
    prompt_text: "How often do you wake up in the middle of the night, once you've actually fallen asleep?",
    answer_type: 'enum',
    allowed_values: ['rarely_or_never', 'once', 'twice', 'three_or_more_times'],
    domain: 'sleep',
    weight: 1.5,
  },
  {
    question_key: 'sleep_waking_reason',
    prompt_text: "When you do wake up in the night, what's usually behind it?",
    helper_text: 'Select any that apply.',
    answer_type: 'multi_select',
    allowed_values: [
      'need_the_bathroom',
      'racing_thoughts',
      'noise',
      'too_hot_or_too_cold',
      'a_partner_or_pet',
      'discomfort',
      'no_clear_reason',
      'other',
    ],
    domain: 'sleep',
    weight: 1,
    requires: [{ question_key: 'sleep_night_waking_frequency', op: 'in', value: ['once', 'twice', 'three_or_more_times'] }],
  },
  {
    question_key: 'sleep_back_to_sleep_ease',
    prompt_text: 'Once you wake up in the night, how easily do you fall back asleep?',
    helper_text: '1 = it takes forever, 5 = almost right away.',
    answer_type: 'numeric',
    domain: 'sleep',
    weight: 1,
  },
  {
    question_key: 'sleep_wake_feeling',
    prompt_text: 'In that first moment you wake up in the morning, how do you actually feel?',
    answer_type: 'enum',
    allowed_values: ['refreshed', 'okay_but_not_great', 'groggy', 'completely_exhausted'],
    domain: 'sleep',
    weight: 1.5,
  },
  {
    question_key: 'sleep_morning_energy_ramp',
    prompt_text: "Once you're up, how long does it take before you actually feel awake?",
    answer_type: 'enum',
    allowed_values: ['im_awake_immediately', '15_to_30_minutes', 'about_an_hour', 'most_of_the_morning'],
    domain: 'sleep',
    weight: 1,
  },
  {
    question_key: 'sleep_screens_before_bed',
    prompt_text: "Are you usually still on a screen right up until you try to fall asleep?",
    answer_type: 'boolean',
    domain: 'recovery',
    weight: 1,
  },
  {
    question_key: 'sleep_caffeine_timing',
    prompt_text: "What time does your last caffeine of the day usually land?",
    answer_type: 'enum',
    allowed_values: ['before_noon', 'early_afternoon', 'late_afternoon', 'evening_or_later', 'i_dont_drink_caffeine'],
    domain: 'sleep',
    weight: 1,
  },
  {
    question_key: 'sleep_bedtime_wind_down',
    prompt_text: 'Walk me through the last half hour before you turn the lights off — what does that usually look like?',
    answer_type: 'free_text',
    domain: 'recovery',
    weight: 1,
  },
  {
    question_key: 'sleep_reliance_on_aid',
    prompt_text: 'Do you lean on anything — a supplement, a sound machine, a nightly ritual — to help you fall asleep?',
    answer_type: 'boolean',
    domain: 'sleep',
    weight: 1,
  },
  {
    question_key: 'sleep_environment_quality',
    prompt_text: 'Is there anything about your bedroom itself that makes it harder to sleep well?',
    helper_text: 'Select any that apply.',
    answer_type: 'multi_select',
    allowed_values: [
      'too_much_light',
      'noise',
      'uncomfortable_temperature',
      'uncomfortable_mattress_or_pillow',
      'nothing_its_fine',
      'other',
    ],
    domain: 'sleep',
    weight: 1,
  },
  {
    question_key: 'sleep_weekday_weekend_consistency',
    prompt_text: 'How consistent are your bed and wake times — weekdays compared to weekends?',
    helper_text: '1 = totally different schedules, 5 = basically the same every day.',
    answer_type: 'numeric',
    domain: 'sleep',
    weight: 1,
  },
  {
    question_key: 'sleep_worry_content',
    prompt_text: "When your mind is looping at night, what's it usually circling back to?",
    answer_type: 'enum',
    allowed_values: ['work', 'health', 'relationships', 'money', 'nothing_specific_just_busy', 'other'],
    domain: 'mindset',
    weight: 1,
    requires: [{ question_key: 'sleep_racing_mind', op: 'gte', value: 3 }],
  },
  {
    question_key: 'sleep_naps',
    prompt_text: 'Do you find yourself napping during the day?',
    answer_type: 'enum',
    allowed_values: ['never', 'occasionally', 'regularly', 'i_need_to_but_cant'],
    domain: 'sleep',
    weight: 1,
  },
  {
    question_key: 'sleep_cant_sleep_response',
    prompt_text: "When you've been lying awake a while and sleep just isn't coming, what do you usually do?",
    answer_type: 'enum',
    allowed_values: [
      'stay_in_bed_and_wait_it_out',
      'get_up_and_do_something_calm',
      'check_my_phone',
      'get_frustrated_and_toss_and_turn',
      'other',
    ],
    domain: 'sleep',
    weight: 1,
  },
];
