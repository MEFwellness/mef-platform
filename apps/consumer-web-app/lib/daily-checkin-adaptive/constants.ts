/**
 * Daily check-in adaptive picker — the fixed core / rotating probe split.
 * "checkin.*" keys mirror lib/correlation-engine/variables.ts's naming
 * convention (for auditability against the same source data), but this
 * is a separate, independent constant — nothing here imports from
 * lib/correlation-engine/.
 */

/** Asked every single day, never rotated, never touched by the adaptive layer. Kept fast on purpose. */
export const FIXED_CORE_QUESTION_KEYS = [
  'checkin.pain',
  'checkin.energy',
  'checkin.sleep_quality',
  'checkin.sleep_duration',
  'checkin.stress',
  'checkin.mood',
] as const;

export type FixedCoreQuestionKey = (typeof FIXED_CORE_QUESTION_KEYS)[number];

/** How many rotating driver probes the picker tries to fill each day — "two to four per day" (requirement 4). selectBatch stops early once eligible candidates run out (e.g. several drivers ruled out), which is what naturally shortens the check-in over time; this is only the ceiling it aims for. */
export const ROTATING_PROBE_TARGET_COUNT = 4;

/** Fixed core + the rotating-probe ceiling above — the single constant the daily check-in's total length is capped by (requirement 6). */
export const MAX_DAILY_QUESTIONS = FIXED_CORE_QUESTION_KEYS.length + ROTATING_PROBE_TARGET_COUNT;

/** A driver unasked for at least this many days scores as "maximally overdue" rather than growing recency weight without bound. */
export const RECENCY_CAP_DAYS = 14;

/** pain_discomfort_level (0-5 scale) at or above this value triggers the local pain-location follow-up, which in turn (once answered) triggers the aggravating-factor follow-up — both kept local to the pain question, never a global branching tree (requirement 5). */
export const PAIN_FOLLOWUP_THRESHOLD = 3;
