/**
 * Member Personality (Prompt 13) — reuses existing member history to adapt
 * tone, never a new engine. Every field here traces to already-fetched
 * MemberRecommendationRow / RecommendationEvent / LifestyleExperiment rows;
 * nothing is computed from a new query or a new confidence formula.
 */

import type { MemberRecommendationRow } from '@/lib/recommendation-engine';
import { categoriesWithNegativeHistory, summarizeOutcomeHistory } from '@/lib/recommendation-engine';
import type { RecommendationEvent } from '@/lib/longitudinal-intelligence';
import type { LifestyleExperiment } from '@/lib/lifestyle-experiments';
import { deriveEffectiveStatus } from '@/lib/lifestyle-experiments';
import type { MemberEngagementProfile } from './types';
import { domainWordsForCategory } from './topicLabel';

/** Below this many resolved items, tone stays neutral rather than over-reading a thin sample. */
const MIN_RESOLVED_FOR_CONSISTENCY_READ = 2;
const HIGH_CONSISTENCY_RATIO = 0.75;
const LOW_CONSISTENCY_RATIO = 0.25;
/** "Starts many, finishes none" — abandoned/expired-without-reflection count at or above this, with zero real completions. */
const UNFINISHED_EXPERIMENT_THRESHOLD = 2;

export function buildMemberEngagementProfile(input: {
  recommendationRows: MemberRecommendationRow[];
  events: RecommendationEvent[];
  experiments: LifestyleExperiment[];
  asOfDate: Date;
}): MemberEngagementProfile {
  const { recommendationRows, events, experiments, asOfDate } = input;

  const resolvedRecommendations = recommendationRows.filter(
    (r) => r.completionTracking && (r.status === 'completed' || r.status === 'ignored')
  );
  const completedRecommendations = resolvedRecommendations.filter((r) => r.status === 'completed').length;

  let completedExperiments = 0;
  let unresolvedNegativeExperiments = 0;
  for (const experiment of experiments) {
    const effectiveStatus = deriveEffectiveStatus(experiment, asOfDate);
    if (effectiveStatus === 'completed') completedExperiments += 1;
    if (effectiveStatus === 'abandoned' || effectiveStatus === 'expired_no_reflection') {
      unresolvedNegativeExperiments += 1;
    }
  }

  const resolvedCount = resolvedRecommendations.length + completedExperiments + unresolvedNegativeExperiments;
  const positiveCount = completedRecommendations + completedExperiments;
  const consistencyLevel =
    resolvedCount < MIN_RESOLVED_FOR_CONSISTENCY_READ
      ? 'mixed'
      : positiveCount / resolvedCount >= HIGH_CONSISTENCY_RATIO
        ? 'high'
        : positiveCount / resolvedCount <= LOW_CONSISTENCY_RATIO
          ? 'low'
          : 'mixed';

  const hasUnfinishedExperimentPattern =
    completedExperiments === 0 && unresolvedNegativeExperiments >= UNFINISHED_EXPERIMENT_THRESHOLD;

  const categoryByRecommendationId = new Map(recommendationRows.map((r) => [r.id, r.category]));
  const outcomeHistory = summarizeOutcomeHistory(events, categoryByRecommendationId);
  const negativeCategories = categoriesWithNegativeHistory(outcomeHistory);
  const deprioritizedTopicWords = new Set<string>();
  for (const category of negativeCategories) {
    for (const word of domainWordsForCategory(category)) deprioritizedTopicWords.add(word);
  }

  return { consistencyLevel, hasUnfinishedExperimentPattern, deprioritizedTopicWords };
}
