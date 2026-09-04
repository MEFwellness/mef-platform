/**
 * What the Quick Wellness Check is allowed to store, as data.
 *
 * ONE GATE BETWEEN A REQUEST BODY AND THE FENCED TABLE. /api/guest-preview
 * is unauthenticated by necessity: the visitor it serves has no account,
 * which is the entire point. So a caller can send anything, and this file
 * is what decides that a key this experience does not ask, or an option
 * that question does not offer, is simply dropped. The database's own regex
 * checks on guest_wellness_check_answers refuse it a second time. Same
 * shape and same reasoning as lib/public-entry/questions.ts's
 * sanitizeAnswers.
 *
 * EVERY ANSWER IS A SLUG, INCLUDING THE NUMBERS. A level of 4 is stored as
 * the text '4'. That is deliberate: it keeps the fenced table impossible to
 * join to a scoring column by accident, and it means nothing can average
 * these values without somebody first writing the code that decides they
 * mean a level. tests/guest-preview-questions.test.ts holds this file and
 * the screen's own option list to the same list, so the two cannot drift.
 */

import type { GuestPreviewAnswers } from './types';

export interface GuestQuestionConfig {
  field: keyof GuestPreviewAnswers;
  prompt: string;
  options: { value: number | string; label: string }[];
}

/**
 * The seven questions, their wording and their options, in one place.
 *
 * THE SCREEN READS THIS, AND SO DOES THE ALLOWLIST BELOW. It used to live
 * inside app/wellness-check/GuestPreviewFlow.tsx, which was fine while the
 * answers went nowhere but a browser. Now that a route handler has to
 * decide whether an incoming answer is one this experience actually offers,
 * two lists would be two sources of truth for one set of options, and the
 * day they disagreed the screen would show a choice the server silently
 * dropped. One list, derived once.
 */
export const GUEST_WELLNESS_CHECK_QUESTIONS: Record<
  keyof GuestPreviewAnswers,
  GuestQuestionConfig
> = {
  energy_level: {
    field: 'energy_level',
    prompt: 'How has your energy been lately?',
    options: ['Very low', 'Low', 'Okay', 'Good', 'Very good'].map((label, i) => ({
      value: i + 1,
      label,
    })),
  },
  stress_level: {
    field: 'stress_level',
    prompt: 'How would you describe your stress?',
    options: ['Very calm', 'Calm', 'Moderate', 'High', 'Overwhelmed'].map((label, i) => ({
      value: i + 1,
      label,
    })),
  },
  sleep_quality: {
    field: 'sleep_quality',
    prompt: 'How has your sleep quality been?',
    options: ['Poor', 'Below average', 'Okay', 'Good', 'Great'].map((label, i) => ({
      value: i + 1,
      label,
    })),
  },
  digestion_rating: {
    field: 'digestion_rating',
    prompt: 'How has your digestion felt?',
    options: ['Poor', 'Somewhat off', 'Fair', 'Good', 'Excellent'].map((label, i) => ({
      value: i + 1,
      label,
    })),
  },
  movement_today: {
    field: 'movement_today',
    prompt: 'How much have you been moving lately?',
    options: [
      { value: 'none', label: 'None' },
      { value: 'light', label: 'Light' },
      { value: 'moderate', label: 'Moderate' },
      { value: 'full_session', label: 'Full sessions' },
    ],
  },
  pain_discomfort_level: {
    field: 'pain_discomfort_level',
    prompt: 'Any pain or discomfort lately?',
    options: ['None', 'Mild', 'Noticeable', 'Uncomfortable', 'Significant', 'Severe'].map(
      (label, i) => ({ value: i, label })
    ),
  },
  mood_level: {
    field: 'mood_level',
    prompt: 'Overall, how have you been feeling?',
    options: ['Rough', 'Below average', 'Okay', 'Good', 'Great'].map((label, i) => ({
      value: i + 1,
      label,
    })),
  },
};

/** Every option each question offers, as the slug it is stored as. Derived, never hand-written. */
export const GUEST_WELLNESS_CHECK_OPTIONS = (
  Object.keys(GUEST_WELLNESS_CHECK_QUESTIONS) as (keyof GuestPreviewAnswers)[]
).reduce(
  (accumulated, key) => {
    accumulated[key] = GUEST_WELLNESS_CHECK_QUESTIONS[key].options.map((option) =>
      String(option.value)
    );
    return accumulated;
  },
  {} as Record<keyof GuestPreviewAnswers, readonly string[]>
);

export const GUEST_WELLNESS_CHECK_QUESTION_KEYS = Object.keys(
  GUEST_WELLNESS_CHECK_OPTIONS
) as (keyof GuestPreviewAnswers)[];

function isKnownKey(key: string): key is keyof GuestPreviewAnswers {
  return Object.prototype.hasOwnProperty.call(GUEST_WELLNESS_CHECK_OPTIONS, key);
}

/** Drops anything that is not a real key/option pair, silently. A hand-made request gets nothing past this. */
export function sanitizeGuestAnswers(raw: unknown): Record<string, string> {
  const clean: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return clean;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'string') continue;
    if (!isKnownKey(key)) continue;
    if (!GUEST_WELLNESS_CHECK_OPTIONS[key].includes(value)) continue;
    clean[key] = value;
  }
  return clean;
}

/**
 * The screen's own answer shape, turned into the slugs the fenced table
 * stores. A question she has not answered yet is absent rather than null,
 * because an unanswered question has no row.
 */
export function toAnswerSlugs(answers: Partial<GuestPreviewAnswers>): Record<string, string> {
  const slugs: Record<string, string> = {};
  for (const key of GUEST_WELLNESS_CHECK_QUESTION_KEYS) {
    const value = answers[key];
    if (value === null || value === undefined) continue;
    slugs[key] = String(value);
  }
  return sanitizeGuestAnswers(slugs);
}

/** One answer, as the slug it is stored as. An unanswered question yields nothing to write. */
export function toAnswerSlug<K extends keyof GuestPreviewAnswers>(
  key: K,
  value: GuestPreviewAnswers[K]
): Record<string, string> {
  if (value === null || value === undefined) return {};
  return sanitizeGuestAnswers({ [key]: String(value) });
}

/** True once every question holds a value this experience actually offers. */
export function isGuestQuizComplete(answers: Partial<GuestPreviewAnswers>): boolean {
  const slugs = toAnswerSlugs(answers);
  return GUEST_WELLNESS_CHECK_QUESTION_KEYS.every((key) => slugs[key] !== undefined);
}
