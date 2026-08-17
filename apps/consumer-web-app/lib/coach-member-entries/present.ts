/**
 * Coach Member Detail: turning stored answers back into the question she was
 * asked and the answer she gave.
 *
 * Pure. No I/O, no Supabase client, no React. Every rule about how an entered
 * answer is worded lives here so it can be tested without a database.
 *
 * WHY THE QUESTIONS ARE SPELLED OUT. A coach reading "digestion_rating: 2"
 * is reading a column name and a number, and has to remember both the scale
 * and its direction to know what the member meant. The member was asked a
 * sentence and chose a word, so the sentence and the word are what a coach is
 * shown. The labels below are the same ones the check-in screen itself uses.
 *
 * WHY NULL IS NEVER FORMATTED AWAY. Every formatter here returns null for an
 * absent answer and never a fallback value. Rendering a skipped question as
 * "0", "None", or an empty cell would put an answer in a member's mouth that
 * she did not give. The screen turns null into the words "Not answered", in
 * one place, so it cannot be done inconsistently.
 */

import type { DailyCheckin } from '@mef/shared-types-contracts';
import { WELCOME_GOALS } from '@/lib/welcome/goals';
import type { EnteredAnswer, GoalEntry } from './types';
import { checkinHydrationTracked } from '@/lib/hydration/gate';

// ---------------------------------------------------------------------
// The fixed check-in questions
// ---------------------------------------------------------------------

/** The words the check-in itself puts on each point of a 1 to 5 scale. */
const SLEEP_QUALITY: Record<number, string> = {
  1: 'Very poor',
  2: 'Poor',
  3: 'Okay',
  4: 'Good',
  5: 'Very good',
};

const ENERGY: Record<number, string> = {
  1: 'Running on empty',
  2: 'Low',
  3: 'Okay',
  4: 'Good',
  5: 'Full of energy',
};

const STRESS: Record<number, string> = {
  1: 'Very calm',
  2: 'Calm',
  3: 'Some stress',
  4: 'Stressed',
  5: 'Very stressed',
};

const DIGESTION: Record<number, string> = {
  1: 'Very poor',
  2: 'Poor',
  3: 'Okay',
  4: 'Good',
  5: 'Very good',
};

const PAIN: Record<number, string> = {
  0: 'No pain',
  1: 'Barely noticeable',
  2: 'Mild',
  3: 'Moderate',
  4: 'Strong',
  5: 'Severe',
};

const MOVEMENT: Record<string, string> = {
  none: 'Nothing yet',
  light: 'Something light',
  moderate: 'A moderate session',
  full_session: 'A full session',
};

const MOOD: Record<number, string> = {
  1: 'Low',
  2: 'Below par',
  3: 'Okay',
  4: 'Good',
  5: 'Great',
};

const SORENESS: Record<number, string> = {
  1: 'None',
  2: 'A little',
  3: 'Noticeable',
  4: 'Sore',
  5: 'Very sore',
};

const BOWEL: Record<string, string> = {
  normal: 'Normal',
  constipated: 'Constipated',
  loose: 'Loose',
  none: 'None that day',
};

const SLEEP_DURATION: Record<string, string> = {
  '<5h': 'Under 5 hours',
  '5-6h': '5 to 6 hours',
  '6-7h': '6 to 7 hours',
  '7-8h': '7 to 8 hours',
  '8h+': 'Over 8 hours',
};

/**
 * A scale answer, as the word she picked with the number she picked beside
 * it. Both, because the word is what she chose and the number is what every
 * other screen in the product shows.
 */
export function scaleAnswer(
  value: number | null | undefined,
  labels: Record<number, string>,
  max: number
): string | null {
  if (value === null || value === undefined) return null;
  const label = labels[value];
  return label ? `${label} (${value} of ${max})` : `${value} of ${max}`;
}

export function choiceAnswer(
  value: string | null | undefined,
  labels: Record<string, string>
): string | null {
  if (value === null || value === undefined || value === '') return null;
  return labels[value] ?? value;
}

/**
 * The fixed part of a check-in, always in the same order, always the whole
 * list. A question she skipped stays in the list with a null answer rather
 * than being dropped, because a coach needs to see that it was asked and not
 * answered.
 */
export function checkinAnswers(checkin: DailyCheckin): EnteredAnswer[] {
  return [
    {
      key: 'mood_level',
      question: 'How are you feeling today?',
      answer: scaleAnswer(checkin.mood_level, MOOD, 5),
    },
    {
      key: 'sleep_quality',
      question: 'How did you sleep?',
      answer: scaleAnswer(checkin.sleep_quality, SLEEP_QUALITY, 5),
    },
    {
      key: 'sleep_duration',
      question: 'Roughly how long did you sleep?',
      answer: choiceAnswer(checkin.sleep_duration, SLEEP_DURATION),
    },
    {
      key: 'energy_level',
      question: 'How is your energy today?',
      answer: scaleAnswer(checkin.energy_level, ENERGY, 5),
    },
    {
      key: 'stress_level',
      question: 'How stressed do you feel?',
      answer: scaleAnswer(checkin.stress_level, STRESS, 5),
    },
    {
      key: 'digestion_rating',
      question: 'How has your digestion been?',
      answer: scaleAnswer(checkin.digestion_rating, DIGESTION, 5),
    },
    {
      key: 'pain_discomfort_level',
      question: 'Any pain or discomfort?',
      answer: scaleAnswer(checkin.pain_discomfort_level, PAIN, 5),
    },
    {
      key: 'movement_today',
      question: 'Have you moved today?',
      answer: choiceAnswer(checkin.movement_today, MOVEMENT),
    },
    // Conditional water tracking (migration 163). For a member who does not
    // track water this question is not listed at all, rather than listed
    // with "Not answered" against it. This screen's contract is "every
    // question she was actually asked" — she was not asked this one, and
    // showing it unanswered would read to her coach as a skipped question.
    ...(checkinHydrationTracked(checkin)
      ? [
          {
            key: 'water_cups',
            question: 'How much water have you had?',
            answer: checkin.water_cups === null ? null : `${checkin.water_cups} cups`,
          },
        ]
      : []),
  ];
}

/**
 * The morning readiness questions (migration 63). Kept as their own list
 * because they are only put to her on a morning check-in: showing them
 * alongside the fixed questions would make an evening check-in look like it
 * had seven skipped questions rather than a different set. The screen renders
 * this group only when she answered at least one of them.
 */
export function readinessAnswers(checkin: DailyCheckin): EnteredAnswer[] {
  return [
    {
      key: 'actual_bedtime',
      question: 'What time did you go to bed?',
      answer: checkin.actual_bedtime ?? null,
    },
    {
      key: 'actual_wake_time',
      question: 'What time did you wake up?',
      answer: checkin.actual_wake_time ?? null,
    },
    {
      key: 'night_waking_count',
      question: 'How many times did you wake in the night?',
      answer:
        checkin.night_waking_count === null || checkin.night_waking_count === undefined
          ? null
          : String(checkin.night_waking_count),
    },
    {
      key: 'night_sweats',
      question: 'Any night sweats?',
      answer:
        checkin.night_sweats === null || checkin.night_sweats === undefined
          ? null
          : checkin.night_sweats
            ? 'Yes'
            : 'No',
    },
    {
      key: 'morning_soreness',
      question: 'How sore do you feel this morning?',
      answer: scaleAnswer(checkin.morning_soreness, SORENESS, 5),
    },
    {
      key: 'bowel_movement_status',
      question: 'How was your digestion overnight?',
      answer: choiceAnswer(checkin.bowel_movement_status, BOWEL),
    },
  ];
}

/** True when she answered at least one question in a group, so an untouched group can be left out instead of rendered as six skips. */
export function anyAnswered(answers: EnteredAnswer[]): boolean {
  return answers.some((answer) => answer.answer !== null);
}

// ---------------------------------------------------------------------
// The adaptive driver questions
// ---------------------------------------------------------------------

/**
 * A probe answer, rendered against the question definition it was stored
 * under.
 *
 * The stored value is jsonb because the question bank holds five different
 * response types, so this has to branch on the type the question declares
 * rather than on the shape of the value. An unrecognised shape is printed as
 * its own JSON rather than dropped: a coach seeing a raw value knows
 * something was answered, and seeing nothing would tell her it was skipped,
 * which would be false.
 */
export function probeAnswer(
  value: unknown,
  question: { responseType: string; options: unknown }
): string | null {
  if (value === null || value === undefined) return null;

  // The check-in stores an answer as { value: ... } for most types.
  const raw =
    typeof value === 'object' && value !== null && 'value' in (value as Record<string, unknown>)
      ? (value as Record<string, unknown>).value
      : value;

  if (raw === null || raw === undefined || raw === '') return null;

  if (question.responseType === 'boolean') {
    if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';
    if (raw === 'true' || raw === 'false') return raw === 'true' ? 'Yes' : 'No';
  }

  if (question.responseType === 'single_select') {
    const option = optionLabel(raw, question.options);
    if (option) return option;
  }

  if (question.responseType === 'time_pair') {
    // Stored as two clock times; both are hers, so both are shown.
    if (typeof raw === 'object' && raw !== null) {
      const pair = raw as Record<string, unknown>;
      const from = pair.start ?? pair.from ?? pair.bedtime;
      const to = pair.end ?? pair.to ?? pair.waketime;
      if (typeof from === 'string' && typeof to === 'string') return `${from} to ${to}`;
    }
  }

  if (typeof raw === 'number') return String(raw);
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';

  return JSON.stringify(raw);
}

/**
 * The label a member actually saw for the option she chose. Options are
 * stored as either a list of strings or a list of {value,label}, so both are
 * handled; an unmatched value returns null and the caller falls back to
 * printing the stored value rather than inventing a label for it.
 */
export function optionLabel(value: unknown, options: unknown): string | null {
  if (!Array.isArray(options)) return null;
  for (const option of options) {
    if (typeof option === 'string') {
      if (option === value) return option;
      continue;
    }
    if (typeof option === 'object' && option !== null) {
      const record = option as Record<string, unknown>;
      if (record.value === value && typeof record.label === 'string') return record.label;
      if (record.key === value && typeof record.label === 'string') return record.label;
    }
  }
  return null;
}

// ---------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------

const GOAL_LABEL: Record<string, string> = Object.fromEntries(
  WELCOME_GOALS.map((goal) => [goal.key, goal.label])
);

/** Her goal keys turned back into the sentences she picked from. An unknown key is shown as itself rather than dropped. */
export function goalLabels(keys: string[]): string[] {
  return keys.map((key) => GOAL_LABEL[key] ?? key);
}

export function goalLabel(key: string | null): string | null {
  if (!key) return null;
  return GOAL_LABEL[key] ?? key;
}

const GOAL_SOURCE_LABEL: Record<string, string> = {
  welcome_flow: 'Chosen on the welcome flow goal screen',
  onboarding_confirmation: 'Changed at the onboarding confirmation step',
  onboarding_backfill:
    'Carried over from her onboarding assessment, because she joined before the goal screen existed',
};

export function goalSourceLabel(source: string): string {
  return GOAL_SOURCE_LABEL[source] ?? source;
}

/**
 * Newest first. The table is insert-only, so an earlier row is not stale
 * data to be hidden, it is what she used to say, and a coach seeing a goal
 * change is seeing something real.
 */
export function sortGoalsNewestFirst(goals: GoalEntry[]): GoalEntry[] {
  return [...goals].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ---------------------------------------------------------------------
// Shared copy
// ---------------------------------------------------------------------

/** The one place an absent answer becomes words, so it can never be a blank cell. */
export const NOT_ANSWERED = 'Not answered';

/** Said where a whole day's optional question was never put to her. */
export const NOT_ASKED = 'Not asked that day';

export const ENTRIES_INTRO =
  'Everything on this page is something this member entered herself. Nothing here is scored, inferred or generated. Where a question was not answered it says so rather than showing a blank.';

export const CASE_VIEW_POINTER =
  'Patterns, drivers and how these answers relate to each other are not repeated here. They live in Case View, which is built for exactly that.';

export const EMPTY_COPY = {
  checkins: {
    title: 'No check-ins yet',
    body: 'This fills in the first time she completes a Daily Reset. Each day will show every question she was asked and what she answered.',
  },
  submissions: {
    title: 'Nothing completed yet',
    body: 'Questionnaires and experiences appear here once she finishes one. Assigning one does not put it here; only a completed submission does.',
  },
  goals: {
    title: 'No goals on file',
    body: 'She has not been through the goal screen, so there is nothing she has stated. This is not the same as having no goals.',
  },
  conversations: {
    title: 'No conversations with Root yet',
    body: 'Her side of any conversation with Root appears here once she has one.',
  },
} as const;

/** Said when a read did not run at all, which must never look like an empty section. */
export function unavailableCopy(section: string, reason: string): string {
  return `${section} could not be loaded, so this is not a result of "nothing found". ${reason}`;
}
