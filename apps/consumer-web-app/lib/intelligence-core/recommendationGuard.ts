/**
 * Recommendation repeat suppression — "never repeat recommendations that
 * repeatedly fail unless there is new evidence." A Recommendation (unlike
 * a wellness_insight or a daily_feed_item) has no discrete member-facing
 * accept/dismiss action of its own today — recommendations feed into
 * daily_coaching/conversation_prompts/coach_follow_up contexts rather than
 * being their own dismissable UI element. In the absence of that direct
 * signal, the deterministic policy here is: if the exact same
 * recommendation (same domain+title, same evidence) is recomputed again
 * on 3 or more consecutive recalculations with nothing about the
 * underlying evidence having changed, treat that as "this keeps
 * resurfacing without landing" and suppress it — a genuinely different
 * evidence signature (the trend/pattern/hypothesis behind it changed)
 * always resets the counter and gives it a fresh chance immediately, per
 * the milestone's own "unless there is new evidence" carve-out.
 */

import type { Recommendation } from '../intelligence-engine/types';
import type { RecommendationFeedbackState, RecommendationGuardResult } from './types';

const SUPPRESS_AFTER_CONSECUTIVE_REPEATS = 3;

export function recommendationKeyFor(recommendation: Recommendation): string {
  const slug = recommendation.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${recommendation.domain}:${slug}`;
}

export function evidenceSignatureFor(recommendation: Recommendation): string {
  return recommendation.evidence.join('|');
}

export function guardRecommendations(
  recommendations: Recommendation[],
  existingFeedback: RecommendationFeedbackState[]
): RecommendationGuardResult {
  const byKey = new Map(existingFeedback.map((f) => [f.recommendationKey, f]));
  const surfaced: Recommendation[] = [];
  const feedbackUpdates: RecommendationGuardResult['feedbackUpdates'] = [];

  for (const recommendation of recommendations) {
    const key = recommendationKeyFor(recommendation);
    const signature = evidenceSignatureFor(recommendation);
    const existing = byKey.get(key);

    if (!existing) {
      surfaced.push(recommendation);
      feedbackUpdates.push({
        recommendationKey: key,
        domain: recommendation.domain,
        evidenceSignature: signature,
        consecutiveNonActions: 0,
        suppressed: false,
        suppressedReason: null,
      });
      continue;
    }

    if (existing.lastEvidenceSignature !== signature) {
      // New evidence behind the same recommendation_key — always a fresh chance.
      surfaced.push(recommendation);
      feedbackUpdates.push({
        recommendationKey: key,
        domain: recommendation.domain,
        evidenceSignature: signature,
        consecutiveNonActions: 0,
        suppressed: false,
        suppressedReason: null,
      });
      continue;
    }

    const nextConsecutive = existing.consecutiveNonActions + 1;
    const shouldSuppress = nextConsecutive >= SUPPRESS_AFTER_CONSECUTIVE_REPEATS;

    if (!shouldSuppress) {
      surfaced.push(recommendation);
    }

    feedbackUpdates.push({
      recommendationKey: key,
      domain: recommendation.domain,
      evidenceSignature: signature,
      consecutiveNonActions: nextConsecutive,
      suppressed: shouldSuppress,
      suppressedReason: shouldSuppress
        ? `Recurred ${nextConsecutive} times with no new evidence — suppressed until something changes.`
        : null,
    });
  }

  return { surfaced, feedbackUpdates };
}
