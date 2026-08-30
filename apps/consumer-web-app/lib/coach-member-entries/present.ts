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
 * The stored value is jsonb because the question bank holds six different
 * response types, so this has to branch on the type the question declares
 * rather than on the shape of the value.
 *
 * NOTHING STORED EVER REACHES A COACH AS JSON. Found live on 2026-08-30:
 * "Where is it, mainly?" rendered as the two characters `[]`, because a
 * multi-select with nothing selected fell through to JSON.stringify. Two
 * rules follow from that, and they are why every branch below returns
 * either words or null:
 *
 *   1. An answer that says nothing is not an answer. An empty array, an
 *      empty string, a string of spaces and an empty object are all
 *      "unanswered", exactly as null already was, so the screen says
 *      "Not answered" instead of showing punctuation.
 *   2. Anything that does say something is said in words. A list becomes
 *      a comma-separated list of the labels she actually saw; an
 *      unrecognised object becomes its own field names and values. No
 *      bracket, brace or quote from JSON.stringify is ever rendered.
 */
export function probeAnswer(
  value: unknown,
  question: { responseType: string; options: unknown }
): string | null {
  const raw = unwrapStoredValue(value);
  if (isEmptyAnswer(raw)) return null;

  if (question.responseType === 'boolean') {
    if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';
    if (raw === 'true' || raw === 'false') return raw === 'true' ? 'Yes' : 'No';
  }

  if (question.responseType === 'time_pair') {
    // Stored as two clock times; both are hers, so both are shown.
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
      const pair = raw as Record<string, unknown>;
      const from = pair.start ?? pair.from ?? pair.bedtime;
      const to = pair.end ?? pair.to ?? pair.waketime;
      if (typeof from === 'string' && typeof to === 'string') return `${from} to ${to}`;
    }
  }

  // Every multi-select answer, and any other type that was stored as a
  // list. Each entry is turned back into the label she saw, and the empty
  // list has already been ruled out above.
  if (Array.isArray(raw)) {
    const parts = raw
      .map((entry) => scalarAnswer(entry, question.options))
      .filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join(', ') : null;
  }

  return scalarAnswer(raw, question.options);
}

/** The check-in stores an answer as `{ value: ... }` for most types, and bare for older rows. */
function unwrapStoredValue(value: unknown): unknown {
  if (typeof value === 'object' && value !== null && !Array.isArray(value) && 'value' in (value as Record<string, unknown>)) {
    return (value as Record<string, unknown>).value;
  }
  return value;
}

/**
 * True for anything stored that says nothing: null, an empty or
 * whitespace-only string, an empty list, an empty object. All of them mean
 * the same thing to a coach, so all of them render as "Not answered".
 */
export function isEmptyAnswer(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true;
  if (typeof raw === 'string') return raw.trim() === '';
  if (Array.isArray(raw)) return raw.length === 0 || raw.every((entry) => isEmptyAnswer(entry));
  if (typeof raw === 'object') return Object.keys(raw as Record<string, unknown>).length === 0;
  return false;
}

/** One value that is not a list: an option key, a number, a boolean, or an object nothing else recognised. */
function scalarAnswer(raw: unknown, options: unknown): string | null {
  if (isEmptyAnswer(raw)) return null;
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';
  if (typeof raw === 'number') return String(raw);
  if (typeof raw === 'string') {
    // A real {value,label} option is her own wording and is used exactly as
    // it is. A bare-string option list stores the code as its own "label",
    // which is not wording at all, so that falls through to be made
    // readable rather than printing `lower_back` at a coach.
    const label = optionLabel(raw, options);
    if (label !== null && label !== raw) return label;
    // `label === raw` means she picked from a bare-string option list, so
    // the value is definitely a code and is capitalized as one. A value
    // that matched no option is only tidied if it plainly looks like a
    // code, so anything unrecognised still reaches the coach as stored.
    return readableCode(raw, label === raw);
  }
  if (Array.isArray(raw)) {
    const parts = raw.map((entry) => scalarAnswer(entry, options)).filter((p): p is string => p !== null);
    return parts.length > 0 ? parts.join(', ') : null;
  }
  return objectAnswer(raw as Record<string, unknown>, options);
}

/**
 * A stored option key, made readable: `feet_or_ankles` becomes "Feet or
 * ankles". Only applied to something that is plainly a code, so a real
 * sentence, a clock time and an already-worded label are passed through
 * exactly as they were stored. A single lower-case word is only treated as
 * a code when it really was one of the question's own options: an
 * unrecognised value is shown as stored rather than dressed up.
 */
function readableCode(value: string, knownOption = false): string {
  const looksLikeCode = knownOption
    ? /^[a-z0-9]+(_[a-z0-9]+)*$/.test(value)
    : /^[a-z0-9]+(_[a-z0-9]+)+$/.test(value);
  if (!looksLikeCode) return value;
  const words = value.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A shape no branch above recognised. Printed as its own field names and
 * values rather than dropped (a coach seeing a value knows something was
 * answered, and seeing nothing would say it was skipped, which would be
 * false) and rather than as JSON (rule 2 above).
 */
function objectAnswer(raw: Record<string, unknown>, options: unknown): string | null {
  const parts = Object.entries(raw)
    .map(([key, entry]) => {
      const rendered = scalarAnswer(entry, options);
      return rendered === null ? null : `${key.replace(/_/g, ' ')}: ${rendered}`;
    })
    .filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(', ') : null;
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
