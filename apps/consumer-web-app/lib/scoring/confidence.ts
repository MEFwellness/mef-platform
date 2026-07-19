/**
 * Shared confidence-level bucketing. A single ratio-to-level mapping used
 * by domain scores, the Root Score itself, and Momentum, so "moderate
 * confidence" means the same thing everywhere in the UI.
 */

import type { ScoreConfidenceLevel } from '@mef/shared-types-contracts';
import { CONFIDENCE_THRESHOLDS, ROOT_SNAPSHOTS_FOR_FULL_HISTORY_CONFIDENCE } from './config';

export function confidenceLevelFromRatio(ratio: number): ScoreConfidenceLevel {
  if (ratio <= 0) return 'building';
  if (ratio >= CONFIDENCE_THRESHOLDS.high) return 'high';
  if (ratio >= CONFIDENCE_THRESHOLDS.moderate) return 'moderate';
  if (ratio >= CONFIDENCE_THRESHOLDS.low) return 'low';
  return 'building';
}

/**
 * Root confidence blends this calculation's domain coverage (70%) with
 * how many prior calculations exist for this member (30%) — so even a
 * member with perfect data coverage today is shown as "building"
 * confidence on their very first score, and only reaches "high" once a
 * real track record backs the smoothing baseline.
 */
export function computeRootConfidence(
  coverageRatio: number,
  priorSnapshotCount: number
): { confidence: number; level: ScoreConfidenceLevel } {
  const historyFactor = Math.min(
    1,
    priorSnapshotCount / ROOT_SNAPSHOTS_FOR_FULL_HISTORY_CONFIDENCE
  );
  const confidence = Math.max(0, Math.min(1, coverageRatio * 0.7 + historyFactor * 0.3));
  return { confidence, level: confidenceLevelFromRatio(confidence) };
}
