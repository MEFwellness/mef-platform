/**
 * Momentum Score — the trailing 7 days compared against the 7 days
 * before that. Deliberately reuses lib/scoring/domains.ts's own domain
 * calculators (called twice, once per window) so "momentum" and "Root
 * Score" agree by construction on what each domain means; nothing here
 * re-derives domain math independently.
 */

import type { DomainScore, MomentumState, ScoreConfidenceLevel } from '@mef/shared-types-contracts';
import { computeComposite } from './aggregate';
import { MOMENTUM_MIN_DATA_POINTS_PER_WINDOW } from './config';
import { confidenceLevelFromRatio } from './confidence';

export type MomentumResult = {
  score: number | null;
  state: MomentumState;
  confidenceLevel: ScoreConfidenceLevel;
};

function totalDataPoints(domainScores: DomainScore[]): number {
  return domainScores.reduce((sum, d) => sum + d.data_points, 0);
}

export function computeMomentum(
  recentDomainScores: DomainScore[],
  priorDomainScores: DomainScore[]
): MomentumResult {
  const recent = computeComposite(recentDomainScores);
  const prior = computeComposite(priorDomainScores);

  const recentPoints = totalDataPoints(recentDomainScores);
  const priorPoints = totalDataPoints(priorDomainScores);

  if (
    recent.score === null ||
    prior.score === null ||
    recentPoints < MOMENTUM_MIN_DATA_POINTS_PER_WINDOW ||
    priorPoints < MOMENTUM_MIN_DATA_POINTS_PER_WINDOW
  ) {
    return { score: null, state: 'insufficient_data', confidenceLevel: 'building' };
  }

  const delta = recent.score - prior.score;
  const score = Math.max(0, Math.min(100, Math.round(50 + delta)));
  const state: MomentumState = delta > 2 ? 'improving' : delta < -2 ? 'declining' : 'stable';
  const confidenceLevel = confidenceLevelFromRatio(Math.min(recent.coverageRatio, prior.coverageRatio));

  return { score, state, confidenceLevel };
}
