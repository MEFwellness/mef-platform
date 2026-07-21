/**
 * Coach Intelligence — Root Cause Signals (Prompt 6). A coach-only
 * composite view over things this engine and the Universal Assessment
 * Intelligence Engine already compute — nothing new is derived here beyond
 * re-shaping and cross-referencing:
 *
 *   - hypotheses            already-computed RootCauseHypothesis[]
 *                            (lib/intelligence-engine/hypotheses.ts),
 *                            enriched with which real assessment
 *                            source(s) back each one
 *   - correlations           the cross_assessment_correlation-kind
 *                            PatternInsight[] already folded into
 *                            report.patterns (crossAssessmentCorrelations.ts)
 *   - findingTimeline        lib/registry/timeline.ts over the member's
 *                            whole registry_entries history
 *   - suggestedAssessments   lib/assessment-registry/findingRecommendations.ts
 *   - suggestedReassessments pending reassessment_schedules rows
 *   - suggestedCoachingPriorities  report.priorities, unchanged
 *
 * Pure — every input already fetched by the calling server action
 * (app/actions/rootCauseSignals.ts), same split as every other engine
 * module in this directory.
 */

import type { RegistryEntry, RegistrySourceFeature } from '@mef/shared-types-contracts';
import type { AssessmentKey } from '../assessment-registry/types';
import {
  suggestAssessmentsFromFindings,
  type FindingBasedSuggestion,
} from '../assessment-registry/findingRecommendations';
import { buildFindingTimeline, type FindingTimelineEntry } from '../registry/timeline';
import type {
  CoachingPriorities,
  MemberIntelligenceReport,
  PatternInsight,
  RootCauseHypothesis,
} from './types';

const SOURCE_FEATURE_LABEL: Record<RegistrySourceFeature, string> = {
  body_assessment_finding: 'Body Assessment',
  assessment_ai_observation: 'Coach Assessment Review',
  wearable_daily_metric: 'Wearable Data',
  food_lens_pattern_comparison: 'Food Lens',
  movement_session_completed: 'Movement Session',
  food_analysis_result: 'Food Lens',
  questionnaire_category_finding: 'Questionnaire',
  onboarding_baseline_finding: 'Onboarding Assessment',
  primal_pattern_classification: 'Primal Pattern Diet Type',
};

export type EnrichedRootCauseSignal = {
  hypothesis: RootCauseHypothesis;
  supportingAssessments: string[];
  relatedFindingLabels: string[];
};

export type PendingReassessmentSuggestion = {
  assessmentKey: AssessmentKey;
  displayName: string;
  reason: string;
};

export type RootCauseSignalsView = {
  signals: EnrichedRootCauseSignal[];
  correlations: PatternInsight[];
  findingTimeline: FindingTimelineEntry[];
  suggestedAssessments: FindingBasedSuggestion[];
  suggestedReassessments: PendingReassessmentSuggestion[];
  suggestedCoachingPriorities: CoachingPriorities;
};

function enrichHypothesis(
  hypothesis: RootCauseHypothesis,
  registryEntryById: Map<string, RegistryEntry>
): EnrichedRootCauseSignal {
  const matchedEntries = hypothesis.supportingEvidence
    .filter((ref) => ref.type === 'registry_entry')
    .map((ref) => registryEntryById.get(ref.id))
    .filter((e): e is RegistryEntry => e !== undefined);

  const supportingAssessments = [
    ...new Set(matchedEntries.map((e) => SOURCE_FEATURE_LABEL[e.source_feature])),
  ];
  const relatedFindingLabels = [...new Set(matchedEntries.map((e) => e.label))];

  return { hypothesis, supportingAssessments, relatedFindingLabels };
}

export function buildRootCauseSignalsView(
  report: MemberIntelligenceReport,
  allRegistryEntries: RegistryEntry[],
  activeRegistryEntries: RegistryEntry[],
  pendingReassessments: { assessmentKey: AssessmentKey; displayName: string; reason: string }[]
): RootCauseSignalsView {
  const registryEntryById = new Map(allRegistryEntries.map((e) => [e.id, e]));

  return {
    signals: report.hypotheses.map((h) => enrichHypothesis(h, registryEntryById)),
    correlations: report.patterns.filter((p) => p.kind === 'cross_assessment_correlation'),
    findingTimeline: buildFindingTimeline(allRegistryEntries),
    suggestedAssessments: suggestAssessmentsFromFindings(activeRegistryEntries),
    suggestedReassessments: pendingReassessments,
    suggestedCoachingPriorities: report.priorities,
  };
}
