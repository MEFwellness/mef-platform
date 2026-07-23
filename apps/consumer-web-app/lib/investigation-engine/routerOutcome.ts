/**
 * Investigation Engine — the Root Router's outcome classification (Method
 * §7's branching logic, folded onto real signals that already exist:
 * `decideNextAction()`'s three steps, `buildRecommendations()`
 * (lib/intelligence-engine/recommendations.ts), and domain Confidence
 * (confidence.ts). Root Model and Router §7's own recommendation is
 * explicit — "when the Root Router is finally named as one real service,
 * it should orchestrate these [real fragments], not add a fifth parallel
 * system" — so this file adds no new scoring of its own; it only reads
 * outputs those modules already computed and buckets them into one of the
 * seven outcomes a coach would recognize as "what we're doing next."
 *
 * Precedence, evaluated top to bottom (first match wins):
 *   1. Safety-gated                              -> coach_review
 *   2. Coach attention level is 'priority'        -> coach_review
 *   3. A due reassessment was picked               -> reassessment
 *   4. Any other next-investigation pick, or a
 *      finding-driven suggestion                  -> focused_investigation
 *   5. A high/medium behavioral-domain rec exists  -> lifestyle_experiment
 *   6. A reflection/education rec exists           -> reflection
 *   7. Most domains are still 'building'           -> continue_observation
 *   8. Otherwise                                   -> no_action_needed
 */

import { describeRecommendation } from './rootRouter';
import type { RecommendedInvestigationView, RootRouterDecision } from './rootRouter';
import { getAssessmentRegistryEntry } from '../assessment-registry/registry';
import type { Recommendation as IntelligenceRecommendation, CoachingPriorities } from '../intelligence-engine/types';
import type { DomainConfidence } from './confidence';

export type RootRouterOutcome =
  | 'focused_investigation'
  | 'lifestyle_experiment'
  | 'reflection'
  | 'reassessment'
  | 'continue_observation'
  | 'no_action_needed'
  | 'coach_review';

export type RootRouterOutcomeView = {
  outcome: RootRouterOutcome;
  /** One plain-language, member-safe sentence — never internal terminology, never a formula. */
  memberMessage: string;
  investigation: RecommendedInvestigationView | null;
};

const EXPERIMENT_DOMAINS = new Set(['movement', 'recovery', 'nutrition', 'sleep', 'stress', 'breathing', 'hydration']);
const REFLECTION_DOMAINS = new Set(['reflection', 'education']);

const MEMBER_MESSAGE: Record<RootRouterOutcome, string> = {
  coach_review:
    "Your coach is taking a closer look at something with you right now — new suggestions are paused until that conversation happens.",
  reassessment: "It's a good time to revisit one of your assessments so we can see what's changed.",
  focused_investigation: "There's a specific area worth exploring further with a short assessment.",
  lifestyle_experiment:
    'Based on what we\'re noticing, a small change to a daily habit could help.',
  reflection: 'Worth a quick moment of reflection on how things have been going.',
  continue_observation:
    "We're still gathering information across your domains — keep checking in and we'll keep learning.",
  no_action_needed: 'Nothing urgent right now — things look steady.',
};

function investigationFromTopSuggestion(
  decision: RootRouterDecision
): RecommendedInvestigationView | null {
  const suggestion = decision.findingBasedSuggestions[0];
  if (!suggestion) return null;
  const definition = getAssessmentRegistryEntry(suggestion.assessmentKey);
  return {
    key: suggestion.assessmentKey,
    displayName: definition.displayName,
    reason: 'recommended_next',
    route: definition.route,
  };
}

export function classifyRouterOutcome(
  decision: RootRouterDecision,
  coachAttentionLevel: CoachingPriorities['recommendedCoachAttentionLevel'],
  recommendations: IntelligenceRecommendation[],
  domainConfidences: DomainConfidence[]
): RootRouterOutcomeView {
  if (decision.safetyGated) {
    return { outcome: 'coach_review', memberMessage: MEMBER_MESSAGE.coach_review, investigation: null };
  }

  if (coachAttentionLevel === 'priority') {
    return { outcome: 'coach_review', memberMessage: MEMBER_MESSAGE.coach_review, investigation: null };
  }

  if (decision.recommendation.key && decision.recommendation.reason === 'required_reassessment') {
    return {
      outcome: 'reassessment',
      memberMessage: MEMBER_MESSAGE.reassessment,
      investigation: describeRecommendation(decision),
    };
  }

  if (decision.recommendation.key) {
    return {
      outcome: 'focused_investigation',
      memberMessage: MEMBER_MESSAGE.focused_investigation,
      investigation: describeRecommendation(decision),
    };
  }

  if (decision.findingBasedSuggestions.length > 0) {
    return {
      outcome: 'focused_investigation',
      memberMessage: MEMBER_MESSAGE.focused_investigation,
      investigation: investigationFromTopSuggestion(decision),
    };
  }

  const hasExperimentRec = recommendations.some(
    (r) => EXPERIMENT_DOMAINS.has(r.domain) && (r.priority === 'high' || r.priority === 'medium')
  );
  if (hasExperimentRec) {
    return {
      outcome: 'lifestyle_experiment',
      memberMessage: MEMBER_MESSAGE.lifestyle_experiment,
      investigation: null,
    };
  }

  const hasReflectionRec = recommendations.some((r) => REFLECTION_DOMAINS.has(r.domain));
  if (hasReflectionRec) {
    return { outcome: 'reflection', memberMessage: MEMBER_MESSAGE.reflection, investigation: null };
  }

  const buildingCount = domainConfidences.filter((c) => c.label === 'building').length;
  if (domainConfidences.length > 0 && buildingCount > domainConfidences.length / 2) {
    return {
      outcome: 'continue_observation',
      memberMessage: MEMBER_MESSAGE.continue_observation,
      investigation: null,
    };
  }

  return { outcome: 'no_action_needed', memberMessage: MEMBER_MESSAGE.no_action_needed, investigation: null };
}
