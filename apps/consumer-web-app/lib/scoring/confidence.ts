/**
 * Root Score — how much evidence is behind the number.
 *
 * RETIRED (Member Interpretation Layer, 2026-08-17): `computeRootConfidence`.
 *
 * It was `coverageRatio × 0.7 + min(1, priorSnapshotCount / 5) × 0.3`, and
 * `priorSnapshotCount` counts how many times the score has been CALCULATED,
 * not how much evidence the member has produced. Snapshots accrue daily
 * from a cron whether or not she logs anything, so after five days every
 * member's history term was maxed. That is how Home came to read
 * "27 /100 · Steady · HIGH CONFIDENCE" on the same load where all five
 * domains underneath read "Building".
 *
 * The replacement is the interpretation layer's evidence tier, computed
 * from the member's own logged days and nothing else. Same idea, one
 * unbreakable rule: a background run cannot move it, because a background
 * run produces no check-in days.
 *
 * `root_confidence` and `root_confidence_level` still exist on the
 * snapshot, because 150-plus days of stored snapshots have them and
 * dropping a column would break comparability with every one of those
 * rows. They are AUDIT fields now. No member screen and no coach screen
 * renders either one; `root_confidence_level === 'building'` is still read
 * in one place, on Root Score, purely to decide whether to show the plain
 * "still building your baseline" note, which is a statement about data
 * volume and not a certainty claim.
 */

import type { ScoreConfidenceLevel } from '@mef/shared-types-contracts';
import { CHECKIN_DAYS_FOR_SUPPORTED, EVENTS_FOR_EMERGING_PATTERN } from '../member-interpretation/config';
import type { EvidenceTier } from '../member-interpretation/types';
import { CONFIDENCE_THRESHOLDS } from './config';

export function confidenceLevelFromRatio(ratio: number): ScoreConfidenceLevel {
  if (ratio <= 0) return 'building';
  if (ratio >= CONFIDENCE_THRESHOLDS.high) return 'high';
  if (ratio >= CONFIDENCE_THRESHOLDS.moderate) return 'moderate';
  if (ratio >= CONFIDENCE_THRESHOLDS.low) return 'low';
  return 'building';
}

/**
 * The Root Score's own evidence tier, from the member's real logged days.
 *
 * Note what is NOT a parameter: the number of times the score has been
 * calculated. There is no argument to this function a cron could supply
 * that would change its answer, which is the whole point.
 */
export function rootEvidenceTier(loggedDays: number): EvidenceTier {
  if (loggedDays >= CHECKIN_DAYS_FOR_SUPPORTED) return 'supported_by_checkins';
  if (loggedDays >= EVENTS_FOR_EMERGING_PATTERN) return 'emerging_pattern';
  return 'early_indication';
}

/** The legacy audit fields, mapped from the tier so the two can never disagree. */
const LEVEL_FOR_TIER: Record<EvidenceTier, ScoreConfidenceLevel> = {
  early_indication: 'building',
  emerging_pattern: 'low',
  supported_by_checkins: 'moderate',
  coach_verified: 'high',
};

const NUMERIC_FOR_TIER: Record<EvidenceTier, number> = {
  early_indication: 0,
  emerging_pattern: 0.25,
  supported_by_checkins: 0.5,
  coach_verified: 0.75,
};

/**
 * The snapshot's stored confidence fields, derived from real logged days.
 *
 * `coverageRatio` is still taken because a member with plenty of logged days
 * but only one domain covered genuinely has less behind her score than one
 * with the same days across five domains. It can only ever LOWER the tier,
 * never raise it: coverage is a fact about the calculation, not evidence
 * the member produced.
 */
export function computeRootEvidence(
  coverageRatio: number,
  loggedDays: number
): { confidence: number; level: ScoreConfidenceLevel; tier: EvidenceTier } {
  const tier = rootEvidenceTier(loggedDays);
  const cappedByCoverage: EvidenceTier =
    coverageRatio < CONFIDENCE_THRESHOLDS.moderate && tier === 'supported_by_checkins'
      ? 'emerging_pattern'
      : tier;

  return {
    confidence: NUMERIC_FOR_TIER[cappedByCoverage],
    level: LEVEL_FOR_TIER[cappedByCoverage],
    tier: cappedByCoverage,
  };
}
