/**
 * Life Signal Check — shared constants for the unified-runtime content
 * authored in supabase/migrations/00000000000138_life_signal_check.sql.
 * Kept in one place so the take flow, scoring, results view, and coach
 * detail view never hand-type the same six signals or question keys
 * independently. Mirrors lib/core-values-snapshot/constants.ts's own role.
 */

export const LSC_KEY = 'life-signal-check' as const;

export const SIGNALS = ['energy', 'sleep', 'tension', 'digestion', 'body', 'mind'] as const;

export type Signal = (typeof SIGNALS)[number];

export const SIGNAL_LABEL: Record<Signal, string> = {
  energy: 'Energy',
  sleep: 'Sleep',
  tension: 'Tension',
  digestion: 'Digestion',
  body: 'Body',
  mind: 'Mind',
};

/** question_key -> the signal it scores into, for the six Screen 2 questions (each question is its own signal, one apiece). */
export const SIGNAL_QUESTION_KEY: Record<Signal, string> = {
  energy: 'lsc_q4',
  sleep: 'lsc_q5',
  tension: 'lsc_q6',
  digestion: 'lsc_q7',
  body: 'lsc_q8',
  mind: 'lsc_q9',
};

export const QUESTION_KEY_SIGNAL: Record<'lsc_q4' | 'lsc_q5' | 'lsc_q6' | 'lsc_q7' | 'lsc_q8' | 'lsc_q9', Signal> = {
  lsc_q4: 'energy',
  lsc_q5: 'sleep',
  lsc_q6: 'tension',
  lsc_q7: 'digestion',
  lsc_q8: 'body',
  lsc_q9: 'mind',
};

export const SCREEN1_QUESTION_KEYS = ['lsc_q1', 'lsc_q2', 'lsc_q3'] as const;
export const SCREEN2_QUESTION_KEYS = ['lsc_q4', 'lsc_q5', 'lsc_q6', 'lsc_q7', 'lsc_q8', 'lsc_q9'] as const;
export const Q10_KEY = 'lsc_q10';
export const Q11_KEY = 'lsc_q11';

export const LSC_EXPERIMENT_DURATION_DAYS = 7;

/**
 * Each Screen 2 question's own option values map to a 0-3 loudness score,
 * in the exact order the build brief specified. Tension is the one
 * asymmetric scale: its five options score 0, 2, 2, 2, 3 (not 0-3 evenly
 * spread across four options like the other five signals) — kept here,
 * per-question, rather than assuming "option index === score" anywhere
 * else in the codebase.
 */
export const SIGNAL_OPTION_SCORES: Record<string, Record<string, number>> = {
  lsc_q4: { never: 0, once_or_twice: 1, most_days: 2, every_day: 3 },
  lsc_q5: { rested: 0, slow_start: 1, needed_more: 2, barely_slept: 3 },
  lsc_q6: { didnt_notice: 0, shoulders_neck: 2, stomach: 2, chest_breathing: 2, everywhere: 3 },
  lsc_q7: { settled: 0, heavy_bloated: 1, unpredictable: 2, uncomfortable: 3 },
  lsc_q8: { no: 0, worked_around_it: 1, most_days: 2, constantly: 3 },
  lsc_q9: { usually: 0, sometimes: 1, rarely: 2, no_quiet_moments: 3 },
};

export type TimeOfDay = 'mornings' | 'midday' | 'evenings' | 'not_much' | 'varies';

export const TIME_OF_DAY_LABEL: Record<TimeOfDay, string> = {
  mornings: 'mornings',
  midday: 'the middle of the day',
  evenings: 'evenings',
  not_much: 'not much of the day',
  varies: 'a day that varies a lot',
};

export type Duration = 'just_this_week' | 'a_few_weeks' | 'months' | 'as_long_as_i_can_remember';

export type BodyText = 'tired' | 'tense' | 'ache' | 'cant_settle' | 'hungry_for_different' | 'okay_actually';

/** A signal is "loud" at score 2 or 3, per the build brief. */
export const LOUD_THRESHOLD = 2;
