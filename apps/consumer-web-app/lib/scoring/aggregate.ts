/**
 * Weighted composite over the five domain scores, plus the Root Score's
 * daily-change cap — the two pieces of math the product spec calls out
 * most directly ("a single meal or workout should not produce a large
 * score increase"). Kept separate from domains.ts (which only ever knows
 * about one domain at a time) and from calculate.ts (which orchestrates
 * the whole snapshot) so this file can be unit-tested in isolation.
 */

import type { DomainScore } from '@mef/shared-types-contracts';
import { DOMAIN_WEIGHTS, MAX_ROOT_SCORE_DAILY_CHANGE } from './config';

export type CompositeResult = {
  /** Raw weighted composite over domains with data, or null if no domain has any data at all. */
  score: number | null;
  /** Fraction of total domain weight actually covered by real data this calculation (0-1). */
  coverageRatio: number;
};

export function computeComposite(domainScores: DomainScore[]): CompositeResult {
  const available = domainScores.filter(
    (d): d is DomainScore & { score: number } => d.score !== null
  );
  if (available.length === 0) return { score: null, coverageRatio: 0 };

  const totalWeight = available.reduce((sum, d) => sum + DOMAIN_WEIGHTS[d.domain], 0);
  const weightedSum = available.reduce((sum, d) => sum + d.score * DOMAIN_WEIGHTS[d.domain], 0);

  return {
    score: Math.round(weightedSum / totalWeight),
    // Weights sum to 1.0 across all domains, so totalWeight already IS the
    // covered fraction of the whole — no separate division needed.
    coverageRatio: totalWeight,
  };
}

/**
 * Applies the anti-jump rule: the stored Root Score can move at most
 * MAX_ROOT_SCORE_DAILY_CHANGE points per calculation, regardless of how
 * far the raw 30-day composite has moved. On a member's very first
 * calculation (no previous score to smooth against) the raw composite is
 * used directly — there is nothing to jump from yet.
 */
export function applySmoothingCap(rawComposite: number, previousRootScore: number | null): number {
  if (previousRootScore === null) return rawComposite;
  const delta = rawComposite - previousRootScore;
  const cappedDelta = Math.max(
    -MAX_ROOT_SCORE_DAILY_CHANGE,
    Math.min(MAX_ROOT_SCORE_DAILY_CHANGE, delta)
  );
  return Math.max(0, Math.min(100, previousRootScore + cappedDelta));
}
