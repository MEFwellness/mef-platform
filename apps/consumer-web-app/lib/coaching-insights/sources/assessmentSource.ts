/**
 * Coaching Intelligence Engine — Primal Pattern Assessment + Questionnaires
 * data source. Unlike the check-in/Food Lens sources, these are completion
 * events, not daily repeated metrics: a member completes an assessment
 * occasionally, not every day, so this source mostly feeds Level 1
 * ("you just completed X") and gives other levels real context to
 * reference (e.g. a Food Lens pattern statement can note the Primal
 * Pattern result it was compared against) rather than driving its own
 * repeated/trend statements.
 *
 * Reads lib/primal-pattern/store.ts directly (not
 * lib/nutrition-intelligence/service.ts's wrapper) because this source
 * needs each assessment attempt's own row id for evidence_refs, which the
 * Nutrition Intelligence Service's derived profile deliberately doesn't
 * expose (packages/shared-types-contracts/src's NutritionIntelligenceProfile
 * is a summary, not a row). Questionnaires go through
 * lib/assessments/store.ts's already-questionnaire-agnostic
 * listCompletedAssessments, iterated once per lib/assessments/registry.ts
 * entry — a future questionnaire needs zero changes here, same as it needs
 * zero changes anywhere else in lib/assessments/.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PRIMAL_PATTERN_QUESTIONNAIRE,
  PRIMAL_PATTERN_QUESTIONNAIRE_ID,
} from '@/lib/primal-pattern/questionnaire';
import { listCompletedPrimalPatternAssessments } from '@/lib/primal-pattern/store';
import { listAssessmentDefinitions } from '@/lib/assessments/registry';
import { listCompletedAssessments } from '@/lib/assessments/store';
import type { CoachingDataSourceProvider, CoachingDateRange, CoachingObservation } from '../types';

const TOTAL_PRIMAL_PATTERN_QUESTIONS = PRIMAL_PATTERN_QUESTIONNAIRE.questions.length;

/** Same 0/<=30%/>30% skipped-question bands lib/nutrition-intelligence/service.ts's classifyCompletionQuality uses, expressed as a 0-1 confidence instead of a status label — kept independent rather than importing that internal function so this source doesn't take on a dependency for a private helper. */
function primalPatternConfidence(skippedCount: number): number {
  if (skippedCount === 0) return 1;
  if (skippedCount / TOTAL_PRIMAL_PATTERN_QUESTIONS <= 0.3) return 0.7;
  return 0.4;
}

async function fetchPrimalPatternObservations(
  supabase: SupabaseClient,
  memberId: string,
  range: CoachingDateRange
): Promise<CoachingObservation[]> {
  const observations: CoachingObservation[] = [];
  const primalPatternHistory = await listCompletedPrimalPatternAssessments(
    supabase,
    memberId,
    PRIMAL_PATTERN_QUESTIONNAIRE_ID
  );
  for (const attempt of primalPatternHistory) {
    const localDate = attempt.completedAt.slice(0, 10);
    if (localDate < range.from || localDate > range.to) continue;
    observations.push({
      sourceId: 'primal_pattern_assessment',
      localDate,
      metric: 'primal_pattern_assessment_completed',
      direction: 'neutral',
      value: attempt.result,
      confidence: primalPatternConfidence(attempt.skippedCount),
      sourceRecordId: attempt.id,
    });
  }
  return observations;
}

async function fetchQuestionnaireObservations(
  supabase: SupabaseClient,
  memberId: string,
  range: CoachingDateRange
): Promise<CoachingObservation[]> {
  const observations: CoachingObservation[] = [];
  for (const definition of listAssessmentDefinitions()) {
    const history = await listCompletedAssessments(supabase, memberId, definition.questionnaire.id);
    for (const summary of history) {
      const localDate = summary.completedAt.slice(0, 10);
      if (localDate < range.from || localDate > range.to) continue;
      observations.push({
        sourceId: 'questionnaire',
        localDate,
        metric: `questionnaire_completed:${definition.questionnaire.id}`,
        direction: 'neutral',
        value: summary.totalPriority,
        confidence: 1,
        sourceRecordId: summary.id,
      });
    }
  }
  return observations;
}

export const primalPatternSourceProvider: CoachingDataSourceProvider = {
  id: 'primal_pattern_assessment',
  fetchObservations: fetchPrimalPatternObservations,
};

export const questionnaireSourceProvider: CoachingDataSourceProvider = {
  id: 'questionnaire',
  fetchObservations: fetchQuestionnaireObservations,
};
