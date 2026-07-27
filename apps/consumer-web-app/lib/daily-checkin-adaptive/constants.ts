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

/**
 * 60-second-ceiling pass: the "rotating content" budget for a normal day
 * is "six protected core questions plus two or three rotating probes. Not
 * more" — a fixed number of probe *picks* would let a follow-up-bearing
 * pick silently add an uncounted extra question, so this is spent as
 * budget units by selectRotatingProbesWithBudget (probeBank.ts) rather
 * than a plain pick count: a probe with no known local follow-up costs 1
 * unit, a probe that DOES have one (e.g. digestion_rating ->
 * digestive_symptom_type) costs 2 — reserving room for that follow-up
 * whether or not today's answer actually triggers it. A day with no
 * follow-up-bearing picks spends the whole budget on 3 plain rotating
 * probes; a day with one risky pick gets 1-2 rotating probes instead —
 * "two or three," never more, by construction rather than by luck.
 * Previously a flat pick-count of 4 with follow-ups uncounted entirely.
 */
export const ROTATING_PROBE_TARGET_COUNT = 3;

/** Fixed core + the rotating-probe budget above — the single constant the daily check-in's total length is capped by (requirement 6), now inclusive of any local follow-up a rotating probe triggers, not just the probe itself. */
export const MAX_DAILY_QUESTIONS = FIXED_CORE_QUESTION_KEYS.length + ROTATING_PROBE_TARGET_COUNT;

/**
 * The pain follow-up chain (checkin_probe.pain_location ->
 * checkin_probe.pain_aggravating_factor, up to 2 extra questions) hangs
 * off the FIXED core pain question, never off a rotating pick — it is
 * deliberately outside the budget above, the same way it was outside
 * MAX_DAILY_QUESTIONS before this pass. It fires rarely (pain_discomfort_level
 * >= PAIN_FOLLOWUP_THRESHOLD) and is diagnostically worth asking when it
 * does; on that day the true total can exceed MAX_DAILY_QUESTIONS by up to
 * 2. Documented rather than engineered away — see the Daily Check-In
 * optimization BUILD_STATUS entry's tradeoff section.
 */

/** A driver unasked for at least this many days scores as "maximally overdue" rather than growing recency weight without bound. */
export const RECENCY_CAP_DAYS = 14;

/** pain_discomfort_level (0-5 scale) at or above this value triggers the local pain-location follow-up, which in turn (once answered) triggers the aggravating-factor follow-up — both kept local to the pain question, never a global branching tree (requirement 5). */
export const PAIN_FOLLOWUP_THRESHOLD = 3;
