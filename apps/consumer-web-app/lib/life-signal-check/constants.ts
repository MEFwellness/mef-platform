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

/** Reverse of SIGNAL_LABEL — a lifestyle_experiments row started from Life Signal Check stores exactly SIGNAL_LABEL[signal] as its title (see startLscExperimentAction), so this is the one place anything reading that row back (the daily prompt, the dashboard's Active Experiments section) recovers the real Signal instead of re-deriving it a second way. */
export const SIGNAL_BY_LABEL: Partial<Record<string, Signal>> = Object.fromEntries(
  (SIGNALS as readonly Signal[]).map((s) => [SIGNAL_LABEL[s], s])
);

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

/** Question 1/2's option labels exactly as shown on screen (migration 138), for coach "what they actually said" views — distinct from TIME_OF_DAY_LABEL above, which is a sentence-embeddable phrase, not the raw option text. */
export const TIME_OF_DAY_RAW_LABEL: Record<TimeOfDay, string> = {
  mornings: 'Mornings',
  midday: 'The middle of the day',
  evenings: 'Evenings',
  not_much: 'Honestly, not much of the day',
  varies: 'It varies a lot',
};

/** Question 3's option labels exactly as shown on screen (migration 138) — reused both for coach "what they actually said" views and for Root's own honest quote-back of the member's early guess (see scoring.ts's q3Comparison). */
export const BODY_TEXT_LABEL: Record<BodyText, string> = {
  tired: "I'm tired",
  tense: "I'm tense",
  ache: 'I ache',
  cant_settle: "I can't settle down",
  hungry_for_different: "I'm hungry for something different",
  okay_actually: "I'm okay, actually",
};

/**
 * Question 3's five real body-text options each name, in the member's own
 * words, a guess at which of the six signals will turn out loudest — "I'm
 * okay, actually" is deliberately excluded (it isn't a guess at a signal,
 * it's a claim that nothing is loud, already covered by the separate
 * surprise-beat mechanism in scoring.ts). Root compares this early guess to
 * what the Screen 2 signals actually found, in both directions (scoring.ts's
 * q3Comparison) — the generalized form of the surprise beat beyond the
 * "okay actually" case.
 */
export const BODY_TEXT_SIGNAL_GUESS: Partial<Record<BodyText, Signal>> = {
  tired: 'energy',
  tense: 'tension',
  ache: 'body',
  cant_settle: 'mind',
  hungry_for_different: 'digestion',
};
