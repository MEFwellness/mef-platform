/**
 * One day's answers, in the shape the rule engine reads.
 *
 * A follow-up's `requires` / `excludes` rules are written against
 * `checkin_probe.*` question keys (lib/adaptive-assessment-engine's Rule),
 * but a day's answers live in two places: `daily_checkin_probe_answers`
 * for most questions, and a column on `daily_checkins` for the handful of
 * questions the fixed core already asks. Anything that wants to ask "was
 * this follow-up applicable that day" has to see both, so building that
 * merged view lives here rather than being rebuilt per caller.
 *
 * Pure. No I/O, no client, no React.
 */

import type { AnsweredMap, AnswerValue } from '../adaptive-assessment-engine/types';

/**
 * The `daily_checkins` columns that are also answers a rule can be written
 * against, and the question key each one answers under.
 *
 * The six with `storage = 'daily_checkins_column'` in the question bank,
 * plus `pain_discomfort_level`. Pain has no bank row of its own because the
 * body outline asks it as part of the fixed core rather than as a rotating
 * probe, but it is the parent of the pain follow-ups, so a rule has to be
 * able to name it.
 */
export const CHECKIN_COLUMN_QUESTION_KEYS: Readonly<Record<string, string>> = {
  pain_discomfort_level: 'checkin_probe.pain_discomfort_level',
  morning_soreness: 'checkin_probe.morning_soreness',
  digestion_rating: 'checkin_probe.digestion_rating',
  bowel_movement_status: 'checkin_probe.bowel_movement_status',
  movement_today: 'checkin_probe.movement_today',
  night_waking_count: 'checkin_probe.night_waking_count',
  night_sweats: 'checkin_probe.night_sweats',
};

/**
 * A stored probe value, unwrapped and reduced to something a rule can
 * compare. `{ value: x }` is the shape the check-in writes for most types;
 * anything that says nothing (null, an empty string, an empty list) comes
 * back undefined, because an empty answer must never satisfy a rule that
 * asks what she chose.
 */
export function ruleValue(stored: unknown): AnswerValue | undefined {
  const raw =
    typeof stored === 'object' &&
    stored !== null &&
    !Array.isArray(stored) &&
    'value' in (stored as Record<string, unknown>)
      ? (stored as Record<string, unknown>).value
      : stored;

  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === 'string') return raw.trim() === '' ? undefined : raw;
  if (typeof raw === 'number' || typeof raw === 'boolean') return raw;
  if (Array.isArray(raw)) {
    const entries = raw.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '');
    return entries.length > 0 ? entries : undefined;
  }
  return undefined;
}

/**
 * Everything she answered on one day, keyed the way a rule names it.
 *
 * `checkinColumns` is the day's `daily_checkins` row (any object; only the
 * columns above are read from it), and `probeValues` is that day's
 * `daily_checkin_probe_answers` rows.
 */
export function answeredMapForDay(
  checkinColumns: Record<string, unknown> | null,
  probeValues: Iterable<readonly [string, unknown]>
): AnsweredMap {
  const answered: AnsweredMap = {};

  for (const [column, questionKey] of Object.entries(CHECKIN_COLUMN_QUESTION_KEYS)) {
    const value = ruleValue(checkinColumns?.[column]);
    if (value !== undefined) answered[questionKey] = value;
  }

  for (const [questionKey, stored] of probeValues) {
    const value = ruleValue(stored);
    if (value !== undefined) answered[questionKey] = value;
  }

  return answered;
}
