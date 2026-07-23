/**
 * Reassessment Intelligence — persistence against reassessment_schedules
 * (migration 72, extended by migration 84 with trigger_source/
 * trigger_context). Every function here takes an already-authenticated
 * client, same trust boundary as every other data.ts in this codebase.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getAssessmentRegistryEntry, listAssessmentRegistryEntries } from '../assessment-registry/registry';
import type { AssessmentKey } from '../assessment-registry/types';
import type {
  CalendarReassessmentSuggestion,
  ExperimentOutcomeReassessmentSuggestion,
  ReassessmentSuggestion,
  RecommendationSequenceReassessmentSuggestion,
} from './service';

/** Every assessmentKey with an existing pending schedule for this member, regardless of trigger_source — the dedup set evaluateReassessmentTriggers needs. */
export async function listPendingReassessmentAssessmentKeys(
  supabase: SupabaseClient,
  memberId: string
): Promise<Set<AssessmentKey>> {
  const { data, error } = await supabase
    .from('reassessment_schedules')
    .select('assessment_definition_id')
    .eq('member_id', memberId)
    .eq('status', 'pending');

  if (error) {
    console.error('listPendingReassessmentAssessmentKeys failed', error);
    return new Set();
  }

  const idByKey = new Map<string, AssessmentKey>();
  for (const key of [
    'onboarding-health-history',
    'chek-hlc1-nutrition-lifestyle',
    'four-doctors',
    'primal-pattern-diet-type',
    'body-assessment',
  ] as AssessmentKey[]) {
    idByKey.set(getAssessmentRegistryEntry(key).databaseId, key);
  }

  const keys = new Set<AssessmentKey>();
  for (const row of (data ?? []) as { assessment_definition_id: string }[]) {
    const key = idByKey.get(row.assessment_definition_id);
    if (key) keys.add(key);
  }
  return keys;
}

export type PendingReassessmentRow = {
  assessmentKey: AssessmentKey;
  displayName: string;
  stage: string;
  triggerSource: string;
  dueAt: string;
};

/** Every pending schedule for a member, resolved back to its assessment's display name — the Root Cause Signals panel's "suggested reassessment" list. */
export async function listPendingReassessments(
  supabase: SupabaseClient,
  memberId: string
): Promise<PendingReassessmentRow[]> {
  const { data, error } = await supabase
    .from('reassessment_schedules')
    .select('assessment_definition_id, stage, trigger_source, due_at')
    .eq('member_id', memberId)
    .eq('status', 'pending')
    .order('due_at', { ascending: true });

  if (error) {
    console.error('listPendingReassessments failed', error);
    return [];
  }

  const keys: AssessmentKey[] = [
    'onboarding-health-history',
    'chek-hlc1-nutrition-lifestyle',
    'four-doctors',
    'primal-pattern-diet-type',
    'body-assessment',
  ];
  const keyById = new Map(keys.map((key) => [getAssessmentRegistryEntry(key).databaseId, key]));

  return (
    data as {
      assessment_definition_id: string;
      stage: string;
      trigger_source: string;
      due_at: string;
    }[]
  )
    .map((row) => {
      const key = keyById.get(row.assessment_definition_id);
      if (!key) return null;
      return {
        assessmentKey: key,
        displayName: getAssessmentRegistryEntry(key).displayName,
        stage: row.stage,
        triggerSource: row.trigger_source,
        dueAt: row.due_at,
      };
    })
    .filter((r): r is PendingReassessmentRow => r !== null);
}

export async function insertFindingTriggeredReassessmentSchedule(
  supabase: SupabaseClient,
  memberId: string,
  suggestion: ReassessmentSuggestion
): Promise<void> {
  const definition = getAssessmentRegistryEntry(suggestion.assessmentKey);
  const now = new Date().toISOString();

  const { error } = await supabase.from('reassessment_schedules').insert({
    member_id: memberId,
    assessment_definition_id: definition.databaseId,
    stage: 'finding_triggered',
    due_at: now,
    status: 'pending',
    trigger_source: suggestion.triggerSource,
    trigger_context: suggestion.triggerContext,
  });

  if (error) console.error('insertFindingTriggeredReassessmentSchedule failed', error);
}

/**
 * Every registered investigation's most recent completed-attempt date for
 * this member, keyed by AssessmentKey — what
 * `evaluateCalendarReassessmentTriggers` needs to know whether a declared
 * calendar cadence has elapsed. Reads the same `assessment_status_by_member`
 * view `lib/assessment-registry/facts.ts` already queries for the same
 * reason (one small view read, never per-assessment).
 */
export async function listLastCompletedAtByAssessmentKey(
  supabase: SupabaseClient,
  memberId: string
): Promise<Map<AssessmentKey, string>> {
  const { data, error } = await supabase
    .from('assessment_status_by_member')
    .select('assessment_definition_id, latest_completed_at')
    .eq('member_id', memberId);

  if (error) {
    console.error('listLastCompletedAtByAssessmentKey failed', error);
    return new Map();
  }

  const keyByDefinitionId = new Map(
    listAssessmentRegistryEntries().map((entry) => [entry.databaseId, entry.key])
  );

  const result = new Map<AssessmentKey, string>();
  for (const row of (data ?? []) as {
    assessment_definition_id: string;
    latest_completed_at: string | null;
  }[]) {
    const key = keyByDefinitionId.get(row.assessment_definition_id);
    if (key && row.latest_completed_at) result.set(key, row.latest_completed_at);
  }
  return result;
}

export async function insertCalendarTriggeredReassessmentSchedule(
  supabase: SupabaseClient,
  memberId: string,
  suggestion: CalendarReassessmentSuggestion
): Promise<void> {
  const definition = getAssessmentRegistryEntry(suggestion.assessmentKey);
  const now = new Date().toISOString();

  const { error } = await supabase.from('reassessment_schedules').insert({
    member_id: memberId,
    assessment_definition_id: definition.databaseId,
    stage: 'calendar_cadence',
    due_at: now,
    status: 'pending',
    trigger_source: suggestion.triggerSource,
    trigger_context: suggestion.triggerContext,
  });

  if (error) console.error('insertCalendarTriggeredReassessmentSchedule failed', error);
}

export async function insertExperimentOutcomeReassessmentSchedule(
  supabase: SupabaseClient,
  memberId: string,
  suggestion: ExperimentOutcomeReassessmentSuggestion
): Promise<void> {
  const definition = getAssessmentRegistryEntry(suggestion.assessmentKey);
  const now = new Date().toISOString();

  const { error } = await supabase.from('reassessment_schedules').insert({
    member_id: memberId,
    assessment_definition_id: definition.databaseId,
    stage: 'experiment_outcome_triggered',
    due_at: now,
    status: 'pending',
    trigger_source: suggestion.triggerSource,
    trigger_context: suggestion.triggerContext,
  });

  if (error) console.error('insertExperimentOutcomeReassessmentSchedule failed', error);
}

export async function insertRecommendationSequenceReassessmentSchedule(
  supabase: SupabaseClient,
  memberId: string,
  suggestion: RecommendationSequenceReassessmentSuggestion
): Promise<void> {
  const definition = getAssessmentRegistryEntry(suggestion.assessmentKey);
  const now = new Date().toISOString();

  const { error } = await supabase.from('reassessment_schedules').insert({
    member_id: memberId,
    assessment_definition_id: definition.databaseId,
    stage: 'recommendation_sequence_triggered',
    due_at: now,
    status: 'pending',
    trigger_source: suggestion.triggerSource,
    trigger_context: suggestion.triggerContext,
  });

  if (error) console.error('insertRecommendationSequenceReassessmentSchedule failed', error);
}

/**
 * Part 7's coach-requested trigger — writes the already-reserved
 * 'coach_action' trigger_source (migration 84; never written until now).
 * `stage` is 'coach_requested' rather than reusing 'finding_triggered' /
 * 'calendar_cadence' so a coach's explicit ask is always visibly distinct
 * from an automated evaluator's own suggestion in the schedule list.
 */
export async function insertCoachRequestedReassessmentSchedule(
  supabase: SupabaseClient,
  memberId: string,
  assessmentKey: AssessmentKey,
  reason: string
): Promise<void> {
  const definition = getAssessmentRegistryEntry(assessmentKey);
  const now = new Date().toISOString();

  const { error } = await supabase.from('reassessment_schedules').insert({
    member_id: memberId,
    assessment_definition_id: definition.databaseId,
    stage: 'coach_requested',
    due_at: now,
    status: 'pending',
    trigger_source: 'coach_action',
    trigger_context: { reason },
  });

  if (error) console.error('insertCoachRequestedReassessmentSchedule failed', error);
}
