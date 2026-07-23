/**
 * Recommendation Engine — the pure builder (Prompt 11). Takes the already-
 * computed `Recommendation[]` (lib/intelligence-engine/recommendations.ts)
 * and the Root Router's already-computed `RootRouterOutcomeView`
 * (lib/investigation-engine/routerOutcome.ts) and produces the richer,
 * persistable `MemberRecommendation[]` this prompt asks for. No I/O, no
 * randomness — every output traces to a real input (see classifier.ts).
 *
 * Safety mirrors `decideNextAction()`'s and `buildRootMap()`'s existing
 * posture exactly: when a restricted topic is open, every recommendation
 * is suppressed except a single coach_review item — never a per-category
 * partial suppression, the same "nothing else rendered, one safety
 * message only" discipline `RootMapDomainView.suppressDetail` already
 * established.
 */

import type { Recommendation } from '../intelligence-engine/types';
import type { RootRouterOutcomeView } from '../investigation-engine/routerOutcome';
import {
  adjustedDurationForCategory,
  buildRecommendationKey,
  classifyRecommendation,
  completionTrackingForCategory,
  reassessmentTriggerForCategory,
  whyThisWasSelected,
} from './classifier';
import type { CategoryOutcomeSummary } from './outcomeHistory';
import type { MemberRecommendation, MemberRecommendationCategory } from './types';

const SAFETY_GATED_EXPLANATION =
  'Your coach is reviewing something with you right now, so new suggestions are paused until that conversation happens.';

const MEDICAL_REFERRAL_EXPLANATION =
  'This kind of concern is best discussed with a healthcare provider — your coach has been notified to follow up with you directly. This app never diagnoses or recommends changing any medication.';

function toMemberRecommendation(
  rec: Recommendation,
  category: ReturnType<typeof classifyRecommendation>,
  outcomeSummary: CategoryOutcomeSummary | undefined
): MemberRecommendation {
  return {
    recommendationId: buildRecommendationKey(rec, category),
    category,
    sourceDomain: rec.domain,
    title: rec.title,
    explanation: rec.detail,
    whyThisWasSelected: whyThisWasSelected(rec, category, outcomeSummary),
    supportingFindings: rec.evidence,
    confidence: rec.confidence,
    priority: rec.priority,
    recommendedDuration: adjustedDurationForCategory(category, outcomeSummary),
    reassessmentTrigger: reassessmentTriggerForCategory(category),
    completionTracking: completionTrackingForCategory(category),
    status: 'shown',
  };
}

export function buildMemberRecommendations(input: {
  recommendations: Recommendation[];
  routerOutcome: RootRouterOutcomeView;
  isCoachAttentionPriority: boolean;
  restrictedTopics: string[];
  /** Whether an open/acknowledged intelligence_coach_alerts row of alert_type 'medical_evaluation_recommended' currently exists for this member — read-only signal, this function never emits that alert itself. */
  hasOpenMedicalEvaluationAlert: boolean;
  /** Prompt 12, Part 4 — this member's real outcome history per category (lib/recommendation-engine/outcomeHistory.ts::summarizeOutcomeHistory), used to explain *why* with real history when it exists and to lighten a category's duration after repeated stopped_early events. Optional so every existing caller/test keeps working unchanged. */
  outcomeHistory?: ReadonlyMap<MemberRecommendationCategory, CategoryOutcomeSummary>;
  /** recommendation_key values with an unresolved dismissed/not-helpful event (lib/recommendation-engine/outcomeHistory.ts::hasUnresolvedNegativeEvent) — never re-surfaced without new evidence. A fresh title/category always produces a different key, so this only ever suppresses a literal repeat. */
  suppressedRecommendationKeys?: ReadonlySet<string>;
}): MemberRecommendation[] {
  if (input.restrictedTopics.length > 0) {
    return [
      {
        recommendationId: 'safety_coach_review_gated',
        category: 'coach_review',
        sourceDomain: 'coach_follow_up',
        title: 'Check in with your coach',
        explanation: SAFETY_GATED_EXPLANATION,
        whyThisWasSelected: 'An open safety review takes priority over every other suggestion.',
        supportingFindings: [],
        confidence: 1,
        priority: 'high',
        recommendedDuration: 'ongoing',
        reassessmentTrigger: 'Your coach will follow up directly.',
        completionTracking: false,
        status: 'shown',
      },
    ];
  }

  const mapped = input.recommendations
    .map((rec) => {
      const category = classifyRecommendation(rec, {
        routerOutcome: input.routerOutcome.outcome,
        isCoachAttentionPriority: input.isCoachAttentionPriority,
      });
      return toMemberRecommendation(rec, category, input.outcomeHistory?.get(category));
    })
    .filter((rec) => !input.suppressedRecommendationKeys?.has(rec.recommendationId));

  if (!input.hasOpenMedicalEvaluationAlert) return mapped;

  return [
    {
      recommendationId: 'medical_referral_flag_alert',
      category: 'medical_referral_flag',
      sourceDomain: 'coach_follow_up',
      title: 'Worth discussing with a healthcare provider',
      explanation: MEDICAL_REFERRAL_EXPLANATION,
      whyThisWasSelected: whyThisWasSelected(
        { domain: 'coach_follow_up', title: '', detail: '', priority: 'high', confidence: 1, evidence: [] },
        'medical_referral_flag'
      ),
      supportingFindings: [],
      confidence: 1,
      priority: 'high',
      recommendedDuration: 'ongoing',
      reassessmentTrigger: reassessmentTriggerForCategory('medical_referral_flag'),
      completionTracking: false,
      status: 'shown',
    },
    ...mapped,
  ];
}
