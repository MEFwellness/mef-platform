/**
 * Adaptive Coaching Direction — the privacy boundary, in code.
 *
 * This is a health-adjacent app and the outcome ledger is permanent. The
 * rule is identical to the one lib/analytics/track.ts already enforces for
 * analytics payloads, and it is enforced the same way: a closed allowlist
 * of keys, bounded value shapes, and silent dropping of anything else.
 *
 * WHAT MAY BE RECORDED. Which signal fired, identified by the key the
 * system that produced it already uses (a driver id, a correlation pair
 * key, a friction signal type, a flow key), and the numbers behind it
 * (counts, rates, tiers, day spans).
 *
 * WHAT MAY NEVER BE RECORDED, under any key. A check-in answer. A
 * questionnaire response. A pain location. A sleep number. A nutrition
 * detail or food name. A concern category. A safety classification level.
 * The member-facing sentence of a finding. Any free text at all.
 *
 * The safety rule is the sharpest case and worth stating plainly: when the
 * engine fires on an unresolved safety flag, the ONLY thing it records is
 * that a flag was open and which classification row it was. Not the level,
 * not the urgency, not the categories. A grading pass has no business
 * knowing what a member disclosed, and this ledger is not where that
 * question gets asked.
 */

import type { SignalEvidence } from './types';

/**
 * Every key that may ever appear in signal_evidence. Adding one is the
 * deliberate act of deciding a new behavioral fact is worth remembering,
 * and tests/coaching-direction-privacy.test.ts asserts this list contains
 * nothing that could describe a health answer.
 */
export const ALLOWED_EVIDENCE_KEYS = [
  // Which rule and which specific thing within it.
  'rule',
  'signalKey',
  'signalType',

  // Safety. The row id and nothing about what it contains.
  'safetyClassificationId',
  'acknowledgmentPending',

  // Re-engagement.
  'daysSinceLastSignIn',
  'daysSinceLastCheckin',

  // Reset Plan commitment.
  'planId',
  'daysLogged',
  'daysSinceStart',

  // Qualified finding — a driver id or a correlation pair key, both of
  // which are library identifiers, plus the strength numbers behind them.
  'driverId',
  'driverDomain',
  'pairKey',
  'tier',
  'confidence',
  'observationCount',
  'spanDays',

  // Incomplete action — the registry key of what was left open.
  'assessmentKey',

  // Behavioral friction, from the friction signals service.
  'frictionKind',
  'flowKey',
  'featureKey',
  'starts',
  'completions',
  'completionRate',
  'evidenceSufficiency',
  'savedCount',
  'windowDays',

  // Fallback.
  'totalCheckins',
  'checkinDoneToday',
  'hasStatedGoal',
] as const;

export type AllowedEvidenceKey = (typeof ALLOWED_EVIDENCE_KEYS)[number];

const ALLOWED = new Set<string>(ALLOWED_EVIDENCE_KEYS);

/**
 * Longest a string value may be. Every legitimate value is a short slug or
 * a uuid; anything longer is prose, which is the shape health content
 * would arrive in. A uuid is 36 characters, the longest friction signal
 * type is 33, so 48 leaves room without leaving room for a sentence.
 */
export const MAX_EVIDENCE_VALUE_LENGTH = 48;

/**
 * Strings that look like prose rather than a slug are dropped even when
 * short enough. A key/identifier never contains a space; a sentence
 * fragment always will.
 */
function isSlugLike(value: string): boolean {
  return value.length <= MAX_EVIDENCE_VALUE_LENGTH && !/\s/.test(value);
}

/**
 * The one function that builds a stored evidence object. Drops rather
 * than throws, for the same reason the analytics sanitizer does: a
 * mistaken call site must never break the card the member is waiting on,
 * and silently discarding an unexpected field is strictly safer than
 * persisting it.
 */
export function sanitizeSignalEvidence(evidence: Record<string, unknown>): SignalEvidence {
  const clean: SignalEvidence = {};

  for (const [key, value] of Object.entries(evidence)) {
    if (!ALLOWED.has(key)) continue;
    if (value === undefined) continue;

    if (value === null) {
      clean[key] = null;
      continue;
    }
    if (typeof value === 'boolean') {
      clean[key] = value;
      continue;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) continue;
      clean[key] = value;
      continue;
    }
    if (typeof value === 'string') {
      if (!isSlugLike(value)) continue;
      clean[key] = value;
      continue;
    }
    // Objects, arrays and functions never reach the database. Nested
    // structure is exactly how an evidence summary from an upstream
    // engine would smuggle a sentence through.
  }

  return clean;
}
