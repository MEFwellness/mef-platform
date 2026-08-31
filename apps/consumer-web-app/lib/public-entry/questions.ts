/**
 * Where Your Energy Goes: the nine questions, and the single source of
 * truth for every key and every option label in this experience.
 *
 * WHY THESE QUESTIONS AND NOT A TIREDNESS SCALE. Asking a stranger to rate
 * their energy one to five produces a number we cannot say anything honest
 * about. Asking WHERE the day loses its energy and WHAT the day is made of
 * produces answers we can quote back to them verbatim, which is the only
 * kind of result that earns any trust from someone who has never heard of
 * us. Every line of the result they read is built from these option labels,
 * so nothing in it can be true of a person who did not answer that way.
 *
 * NO FREE TEXT ANYWHERE, ON PURPOSE. Every answer is one of a fixed set of
 * slugs. A stranger with no account, no consent flow and no clinical review
 * behind them must not be able to type a health disclosure into this
 * product, and the way to guarantee that is to give them nowhere to type
 * it. The database enforces the same thing with a regex on
 * public_entry_answers.answer_value.
 *
 * FOUR CHAPTERS, NOT NINE SCREENS. Each chapter is one idea, announced
 * before its questions so the visitor always knows what is being asked
 * about and why. Two or three questions each, and the chapter transitions
 * are what make a nine-question form read as a conversation.
 */

export const PUBLIC_ENTRY_EXPERIENCE_KEY = 'energy_map' as const;

/**
 * The `primary_concern` value this experience corresponds to, used by the
 * Baseline Assessment to CONFIRM rather than ask cold.
 *
 * Choosing to open a link about energy is a real signal about what somebody
 * came for. It is not the same thing as her telling us energy is what
 * matters most, which is why the assessment asks her and she taps an
 * answer, rather than this value being written on her behalf. Nothing
 * anywhere pre-fills an assessment answer from a public one.
 */
export const PUBLIC_ENTRY_PRIMARY_CONCERN = 'energy' as const;

export type EnergyOption = {
  /** Stored slug. Lowercase, underscores, and permanent once a real visitor has answered it. */
  readonly value: string;
  /** What she taps. Also, verbatim, what the result quotes back to her. */
  readonly label: string;
};

export type EnergyQuestion = {
  readonly key: string;
  readonly chapter: number;
  readonly prompt: string;
  readonly options: readonly EnergyOption[];
};

export type EnergyChapter = {
  readonly number: number;
  readonly eyebrow: string;
  readonly title: string;
  readonly lines: readonly string[];
};

/**
 * The four chapters. Each one's `lines` are the transition screen that
 * introduces it, spoken plainly, never promising anything the questions
 * that follow cannot deliver.
 */
export const ENERGY_CHAPTERS: readonly EnergyChapter[] = [
  {
    number: 1,
    eyebrow: 'One of four',
    title: 'The shape of your day',
    lines: [
      'Tiredness is rarely spread evenly across a day.',
      'It usually has a shape, and the shape is the useful part.',
    ],
  },
  {
    number: 2,
    eyebrow: 'Two of four',
    title: 'The night before',
    lines: [
      'How a day goes is partly decided before it starts.',
      'Three questions about what your nights actually look like.',
    ],
  },
  {
    number: 3,
    eyebrow: 'Three of four',
    title: 'Fuel and rhythm',
    lines: [
      'When you eat changes how a day feels, not only what you eat.',
      'Two questions about the timing of yours.',
    ],
  },
  {
    number: 4,
    eyebrow: 'Four of four',
    title: 'The load you carry',
    lines: [
      'Some tiredness is not physical at all.',
      'Two last questions, and then your result.',
    ],
  },
] as const;

export const ENERGY_QUESTIONS: readonly EnergyQuestion[] = [
  {
    key: 'low_point',
    chapter: 1,
    prompt: 'When does tiredness usually hit you hardest?',
    options: [
      { value: 'early_morning', label: 'First thing, before the day even starts' },
      { value: 'late_morning', label: 'Late morning, once the first push is over' },
      { value: 'early_afternoon', label: 'Early afternoon, somewhere after lunch' },
      { value: 'evening', label: 'Evening, when things finally go quiet' },
      { value: 'all_day', label: 'No single time, it is low all day' },
    ],
  },
  {
    key: 'morning_start',
    chapter: 1,
    prompt: 'How do the first thirty minutes of your day usually go?',
    options: [
      { value: 'up_and_going', label: 'Up and going, no real effort' },
      { value: 'slow_but_fine', label: 'Slow to start, but fine once moving' },
      { value: 'heavy_and_slow', label: 'Heavy, like moving through water' },
      { value: 'need_something_first', label: 'I need coffee or a shower before I am a person' },
    ],
  },
  {
    key: 'sleep_hours',
    chapter: 2,
    prompt: 'On a normal night, how much sleep do you actually get?',
    options: [
      { value: 'under_five', label: 'Under five hours' },
      { value: 'five_to_six', label: 'Five to six hours' },
      { value: 'six_to_seven', label: 'Six to seven hours' },
      { value: 'seven_to_eight', label: 'Seven to eight hours' },
      { value: 'over_eight', label: 'More than eight hours' },
    ],
  },
  {
    key: 'night_pattern',
    chapter: 2,
    prompt: 'Beyond the hours, which of these is closest to your nights?',
    options: [
      { value: 'hard_to_fall_asleep', label: 'Hard to fall asleep, my head will not stop' },
      { value: 'wake_in_the_night', label: 'I fall asleep fine, then wake in the night' },
      { value: 'sleep_fine_wake_tired', label: 'I sleep right through and still wake up tired' },
      { value: 'nights_are_fine', label: 'My nights are genuinely fine' },
    ],
  },
  {
    key: 'wind_down',
    chapter: 2,
    prompt: 'What does the last hour before bed usually look like?',
    options: [
      { value: 'screen_until_lights_out', label: 'A screen, right up until lights out' },
      { value: 'working_or_chores', label: 'Still working, or catching up on the house' },
      { value: 'genuine_wind_down', label: 'Something calm, on purpose' },
      { value: 'collapse_without_warning', label: 'I go from upright to asleep with nothing in between' },
    ],
  },
  {
    key: 'first_food',
    chapter: 3,
    prompt: 'After you wake up, when do you first eat a real meal?',
    options: [
      { value: 'within_an_hour', label: 'Within an hour of waking' },
      { value: 'mid_morning', label: 'Mid morning' },
      { value: 'not_until_lunch', label: 'Not until lunch' },
      { value: 'no_pattern', label: 'It changes completely day to day' },
    ],
  },
  {
    key: 'afternoon_reach',
    chapter: 3,
    prompt: 'When the tiredness hits, what do you usually reach for?',
    options: [
      { value: 'caffeine', label: 'More caffeine' },
      { value: 'something_sweet', label: 'Something sweet or quick' },
      { value: 'push_through', label: 'Nothing, I just push through it' },
      { value: 'move_or_air', label: 'Air, a walk, anything that moves' },
      { value: 'real_meal', label: 'An actual meal' },
    ],
  },
  {
    key: 'mental_load',
    chapter: 4,
    prompt: 'How much of your day is spent being responsible for other people or decisions?',
    options: [
      { value: 'most_of_it', label: 'Most of it, and it does not really stop' },
      { value: 'a_lot', label: 'A lot of it' },
      { value: 'some', label: 'Some of it' },
      { value: 'not_much', label: 'Not much' },
    ],
  },
  {
    key: 'off_switch',
    chapter: 4,
    prompt: 'When did you last have a stretch of time with nothing asked of you?',
    options: [
      { value: 'this_week', label: 'This week' },
      { value: 'this_month', label: 'Sometime this month' },
      { value: 'cant_remember', label: 'I genuinely cannot remember' },
      { value: 'not_the_way_life_is', label: 'That is not what my life looks like right now' },
    ],
  },
] as const;

export const ENERGY_QUESTION_KEYS: readonly string[] = ENERGY_QUESTIONS.map((q) => q.key);

export type EnergyAnswers = Readonly<Record<string, string | undefined>>;

export function questionByKey(key: string): EnergyQuestion | undefined {
  return ENERGY_QUESTIONS.find((q) => q.key === key);
}

export function questionsForChapter(chapter: number): readonly EnergyQuestion[] {
  return ENERGY_QUESTIONS.filter((q) => q.chapter === chapter);
}

/**
 * The label for one answer, or null when the question was not answered or
 * the stored slug is not one this question offers. Null rather than a
 * fallback string on purpose: every sentence in the result is built from
 * one of these, so a missing label must make the sentence disappear rather
 * than make it vague.
 */
export function labelFor(answers: EnergyAnswers, questionKey: string): string | null {
  const question = questionByKey(questionKey);
  if (!question) return null;
  const value = answers[questionKey];
  if (!value) return null;
  return question.options.find((o) => o.value === value)?.label ?? null;
}

/** True only when every one of the nine questions holds a value this experience actually offers. */
export function isComplete(answers: EnergyAnswers): boolean {
  return ENERGY_QUESTIONS.every((q) => {
    const value = answers[q.key];
    return typeof value === 'string' && q.options.some((o) => o.value === value);
  });
}

/** Drops anything that is not a real key/option pair. The one gate between a request body and everything downstream. */
export function sanitizeAnswers(raw: unknown): Record<string, string> {
  const clean: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return clean;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'string') continue;
    const question = questionByKey(key);
    if (!question) continue;
    if (!question.options.some((o) => o.value === value)) continue;
    clean[key] = value;
  }
  return clean;
}
