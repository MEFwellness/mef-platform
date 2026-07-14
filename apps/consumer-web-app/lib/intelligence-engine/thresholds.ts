/**
 * Numeric thresholds shared across lib/intelligence-engine/{recommendations,
 * alerts}.ts — centralized so "overdue," "quiet too long," and "repeated"
 * mean the same number of days/occurrences everywhere in this engine,
 * same discipline lib/intelligence/confidence.ts already established for
 * the Personal Wellness Intelligence Engine.
 */

/** No reassessment/baseline update in this many days — flagged as overdue for both a recommendation and a coach alert. */
export const ASSESSMENT_OVERDUE_DAYS = 90;

/** No check-in at all in this many days — enough to be a real gap, not a single missed day. */
export const NO_CHECKIN_ALERT_DAYS = 5;

/** This many or more concurrently-open safety review cases is treated as "repeated," not isolated. */
export const REPEATED_SAFETY_FLAGS_MIN = 2;

/** A 30-day average score swing of at least this many points (0-100 scale) counts as "rapid" improvement, not gradual. */
export const RAPID_IMPROVEMENT_MIN_DELTA = 20;
