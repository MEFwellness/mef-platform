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
 * ten outcomes a coach would recognize as "what we're doing next."
 *
 * Extended for Prompt 12 (Longitudinal Coaching Intelligence) from the
 * original seven outcomes to ten: `education` split out of `reflection`
 * into its own `educational_insight` outcome, a non-urgent
 * `suggest_coaching_conversation` split out from `coach_review` for
 * `coach_follow_up`-domain recommendations that aren't safety/priority
 * escalations, and a new `adjust_active_experiment` outcome for when the
 * two-active-experiment guardrail is already at capacity. All still pure —
 * `adaptiveContext` below is data the caller (app/actions/rootMap.ts)
 * already gathers, never fetched here.
 *
 * Precedence, evaluated top to bottom (first match wins):
 *   1. Safety-gated                                -> coach_review
 *   2. Coach attention level is 'priority'          -> coach_review
 *   3. A coach explicitly requested a reassessment  -> reassessment
 *   4. A due reassessment was picked                -> reassessment
 *   5. Any other next-investigation pick, or a
 *      finding-driven suggestion                    -> focused_investigation
 *   6. A high/medium behavioral-domain rec exists    -> lifestyle_experiment
 *      (or adjust_active_experiment if at the 2-active cap)
 *   7. A coach_follow_up-domain rec exists           -> suggest_coaching_conversation
 *   8. An education-domain rec exists                -> educational_insight
 *   9. A reflection-domain rec exists                -> reflection
 *  10. Most domains are still 'building'              -> continue_observation
 *  11. Otherwise                                      -> no_action_needed
 */

import { describeRecommendation } from './rootRouter';
import type { RecommendedInvestigationView, RootRouterDecision } from './rootRouter';
import { getAssessmentRegistryEntry } from '../assessment-registry/registry';
import type { Recommendation as IntelligenceRecommendation, CoachingPriorities, RecommendationDomain } from '../intelligence-engine/types';
import type { DomainConfidence } from './confidence';
import { MAX_ACTIVE_EXPERIMENTS } from '../lifestyle-experiments/lifecycle';

export { MAX_ACTIVE_EXPERIMENTS };

export type RootRouterOutcome =
  | 'focused_investigation'
  | 'lifestyle_experiment'
  | 'adjust_active_experiment'
  | 'reflection'
  | 'educational_insight'
  | 'suggest_coaching_conversation'
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

/** Exported for reuse by lib/recommendation-engine/ — which specific recommendations are experiment-eligible, not just whether the member-wide outcome is 'lifestyle_experiment'. */
export const EXPERIMENT_DOMAINS = new Set(['movement', 'recovery', 'nutrition', 'sleep', 'stress', 'breathing', 'hydration']);

const MEMBER_MESSAGE: Record<RootRouterOutcome, string> = {
  coach_review:
    "Your coach is taking a closer look at something with you right now — new suggestions are paused until that conversation happens.",
  reassessment: "It's a good time to revisit one of your assessments so we can see what's changed.",
  focused_investigation: "There's a specific area worth exploring further with a short assessment.",
  lifestyle_experiment:
    'Based on what we\'re noticing, a small change to a daily habit could help.',
  adjust_active_experiment:
    "You're already working on a couple of small changes — worth adjusting one of those rather than starting something new.",
  reflection: 'Worth a quick moment of reflection on how things have been going.',
  educational_insight: 'There\'s something worth learning about that connects to what we\'re noticing.',
  suggest_coaching_conversation: 'This could be a good thing to bring up with your coach when you next connect.',
  continue_observation:
    "We're still gathering information across your domains — keep checking in and we'll keep learning.",
  no_action_needed: 'Nothing urgent right now — things look steady.',
};

/** Data the caller has already gathered (member_pattern_states-adjacent reads, active experiments, dismissal history) — this module stays a pure classifier, never fetching any of it itself. */
export type AdaptiveRouterContext = {
  /** Count of the member's currently-active (non-expired) Lifestyle Experiments. */
  activeExperimentCount: number;
  /** RecommendationDomain values covered by a currently-active experiment — used to decide whether a would-be new experiment is "related" to one already running. */
  activeExperimentDomains: ReadonlySet<RecommendationDomain>;
  /** Domains with an unresolved dismissed/not-helpful signal (no new evidence since) — suppresses re-surfacing the same kind of suggestion. */
  recentlyDismissedDomains: ReadonlySet<RecommendationDomain>;
  /** A pending reassessment_schedules row exists with trigger_source='coach_action' — guarantees the reassessment branch fires even if the auto-evaluator wouldn't have picked it. */
  hasCoachRequestedReassessment: boolean;
};

export const DEFAULT_ADAPTIVE_CONTEXT: AdaptiveRouterContext = {
  activeExperimentCount: 0,
  activeExperimentDomains: new Set(),
  recentlyDismissedDomains: new Set(),
  hasCoachRequestedReassessment: false,
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
  domainConfidences: DomainConfidence[],
  adaptiveContext: AdaptiveRouterContext = DEFAULT_ADAPTIVE_CONTEXT
): RootRouterOutcomeView {
  if (decision.safetyGated) {
    return { outcome: 'coach_review', memberMessage: MEMBER_MESSAGE.coach_review, investigation: null };
  }

  if (coachAttentionLevel === 'priority') {
    return { outcome: 'coach_review', memberMessage: MEMBER_MESSAGE.coach_review, investigation: null };
  }

  if (adaptiveContext.hasCoachRequestedReassessment) {
    return {
      outcome: 'reassessment',
      memberMessage: MEMBER_MESSAGE.reassessment,
      investigation: describeRecommendation(decision),
    };
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

  const experimentCandidates = recommendations.filter(
    (r) =>
      EXPERIMENT_DOMAINS.has(r.domain) &&
      (r.priority === 'high' || r.priority === 'medium') &&
      !adaptiveContext.recentlyDismissedDomains.has(r.domain)
  );
  if (experimentCandidates.length > 0) {
    const atCap = adaptiveContext.activeExperimentCount >= MAX_ACTIVE_EXPERIMENTS;
    if (!atCap) {
      return {
        outcome: 'lifestyle_experiment',
        memberMessage: MEMBER_MESSAGE.lifestyle_experiment,
        investigation: null,
      };
    }
    const hasRelatedActiveExperiment = experimentCandidates.some((r) =>
      adaptiveContext.activeExperimentDomains.has(r.domain)
    );
    if (hasRelatedActiveExperiment) {
      return {
        outcome: 'adjust_active_experiment',
        memberMessage: MEMBER_MESSAGE.adjust_active_experiment,
        investigation: null,
      };
    }
    // At cap with no related active experiment to adjust — never exceed the
    // cap by starting an unrelated third experiment; fall through instead.
  }

  const hasCoachFollowUpRec = recommendations.some(
    (r) => r.domain === 'coach_follow_up' && !adaptiveContext.recentlyDismissedDomains.has(r.domain)
  );
  if (hasCoachFollowUpRec) {
    return {
      outcome: 'suggest_coaching_conversation',
      memberMessage: MEMBER_MESSAGE.suggest_coaching_conversation,
      investigation: null,
    };
  }

  const hasEducationRec = recommendations.some(
    (r) => r.domain === 'education' && !adaptiveContext.recentlyDismissedDomains.has(r.domain)
  );
  if (hasEducationRec) {
    return {
      outcome: 'educational_insight',
      memberMessage: MEMBER_MESSAGE.educational_insight,
      investigation: null,
    };
  }

  const hasReflectionRec = recommendations.some(
    (r) => r.domain === 'reflection' && !adaptiveContext.recentlyDismissedDomains.has(r.domain)
  );
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
