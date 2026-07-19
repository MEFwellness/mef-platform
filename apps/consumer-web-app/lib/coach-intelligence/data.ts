/**
 * Database access for the Coach Intelligence Workspace — same shape as
 * lib/body-assessment/data.ts: pure functions taking a SupabaseClient, RLS
 * (migration 39) decides who may read/write what.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type {
  AiObservationStatus,
  AssessmentAiAnalysis,
  AssessmentAiObservation,
  AssessmentAiProviderStatus,
  AssessmentAiSourceFeature,
  AssessmentReportExercise,
} from '@mef/shared-types-contracts';
import type { CoachIntelligenceObservationResult } from './providers/types';

// ---- assessment_ai_analyses ----

/**
 * Generates its own id and skips `.select()` after writing — same reason
 * lib/body-assessment/data.ts's insertAssessment/insertCapture do: the
 * member's own session, which is who calls this at submit time, can only
 * SELECT a *published* assessment_ai_analyses row (migration 39's RLS), so a
 * freshly-inserted 'pending_coach_review' row would come back as `null` from
 * a `.select()` even though the INSERT itself succeeded — not a duplicate,
 * just RLS hiding a row that session isn't allowed to read yet. Returning a
 * constructed object instead sidesteps that entirely.
 */
export async function insertAnalysis(
  supabase: SupabaseClient,
  input: { sourceFeature: AssessmentAiSourceFeature; sourceRecordId: string; memberId: string }
): Promise<AssessmentAiAnalysis | null> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const { error } = await supabase.from('assessment_ai_analyses').insert({
    id,
    source_feature: input.sourceFeature,
    source_record_id: input.sourceRecordId,
    member_id: input.memberId,
  });

  if (error) {
    console.error('insertAnalysis failed', error);
    return null;
  }

  return {
    id,
    source_feature: input.sourceFeature,
    source_record_id: input.sourceRecordId,
    member_id: input.memberId,
    provider_name: null,
    provider_status: 'not_configured',
    provider_error: null,
    status: 'pending_coach_review',
    ai_summary: null,
    coach_summary: null,
    overall_confidence: null,
    coach_personal_notes: null,
    voice_message_url: null,
    coach_reviewed_by: null,
    coach_reviewed_at: null,
    published_by: null,
    published_at: null,
    created_at: now,
    updated_at: now,
  };
}

export async function getAnalysisBySource(
  supabase: SupabaseClient,
  sourceFeature: AssessmentAiSourceFeature,
  sourceRecordId: string
): Promise<AssessmentAiAnalysis | null> {
  const { data, error } = await supabase
    .from('assessment_ai_analyses')
    .select('*')
    .eq('source_feature', sourceFeature)
    .eq('source_record_id', sourceRecordId)
    .maybeSingle();

  if (error) {
    console.error('getAnalysisBySource failed', error);
    return null;
  }
  return data as AssessmentAiAnalysis | null;
}

export async function getAnalysisById(
  supabase: SupabaseClient,
  analysisId: string
): Promise<AssessmentAiAnalysis | null> {
  const { data, error } = await supabase
    .from('assessment_ai_analyses')
    .select('*')
    .eq('id', analysisId)
    .maybeSingle();

  if (error) {
    console.error('getAnalysisById failed', error);
    return null;
  }
  return data as AssessmentAiAnalysis | null;
}

export type AnalysisPatch = Partial<{
  provider_name: string | null;
  provider_status: AssessmentAiProviderStatus;
  provider_error: string | null;
  status: AssessmentAiAnalysis['status'];
  ai_summary: string | null;
  coach_summary: string | null;
  overall_confidence: number | null;
  coach_personal_notes: string | null;
  voice_message_url: string | null;
  coach_reviewed_by: string | null;
  coach_reviewed_at: string | null;
  published_by: string | null;
  published_at: string | null;
}>;

export async function updateAnalysis(
  supabase: SupabaseClient,
  analysisId: string,
  patch: AnalysisPatch
): Promise<boolean> {
  const { error } = await supabase
    .from('assessment_ai_analyses')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', analysisId);

  if (error) {
    console.error('updateAnalysis failed', error);
    return false;
  }
  return true;
}

// ---- assessment_ai_observations ----

export async function insertObservations(
  supabase: SupabaseClient,
  analysisId: string,
  memberId: string,
  observations: CoachIntelligenceObservationResult[]
): Promise<AssessmentAiObservation[]> {
  if (observations.length === 0) return [];

  const rows = observations.map((obs, index) => ({
    id: randomUUID(),
    analysis_id: analysisId,
    member_id: memberId,
    category: obs.category,
    ai_text: obs.text,
    confidence: obs.confidence ?? null,
    severity: obs.severity ?? null,
    evidence: obs.evidence ?? [],
    sort_order: index,
  }));

  const { data, error } = await supabase
    .from('assessment_ai_observations')
    .insert(rows)
    .select('*');
  if (error) {
    console.error('insertObservations failed', error);
    return [];
  }
  return data as AssessmentAiObservation[];
}

export async function listObservations(
  supabase: SupabaseClient,
  analysisId: string
): Promise<AssessmentAiObservation[]> {
  const { data, error } = await supabase
    .from('assessment_ai_observations')
    .select('*')
    .eq('analysis_id', analysisId)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('listObservations failed', error);
    return [];
  }
  return data as AssessmentAiObservation[];
}

export type ObservationPatch = Partial<{
  status: AiObservationStatus;
  coach_text: string | null;
  coach_reviewed_by: string | null;
  coach_reviewed_at: string | null;
}>;

export async function updateObservation(
  supabase: SupabaseClient,
  observationId: string,
  patch: ObservationPatch
): Promise<boolean> {
  const { error } = await supabase
    .from('assessment_ai_observations')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', observationId);

  if (error) {
    console.error('updateObservation failed', error);
    return false;
  }
  return true;
}

// ---- assessment_report_exercises ----

export type ReportExerciseInput = {
  analysisId: string;
  memberId: string;
  name: string;
  description?: string | null;
  category?: string | null;
  addedBy: string;
};

export async function insertReportExercise(
  supabase: SupabaseClient,
  input: ReportExerciseInput,
  sortOrder: number
): Promise<AssessmentReportExercise | null> {
  const { data, error } = await supabase
    .from('assessment_report_exercises')
    .insert({
      analysis_id: input.analysisId,
      member_id: input.memberId,
      name: input.name,
      description: input.description ?? null,
      category: input.category ?? null,
      added_by: input.addedBy,
      sort_order: sortOrder,
    })
    .select('*')
    .single();

  if (error) {
    console.error('insertReportExercise failed', error);
    return null;
  }
  return data as AssessmentReportExercise;
}

export async function listReportExercises(
  supabase: SupabaseClient,
  analysisId: string
): Promise<AssessmentReportExercise[]> {
  const { data, error } = await supabase
    .from('assessment_report_exercises')
    .select('*')
    .eq('analysis_id', analysisId)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('listReportExercises failed', error);
    return [];
  }
  return data as AssessmentReportExercise[];
}

export async function deleteReportExercise(
  supabase: SupabaseClient,
  exerciseId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('assessment_report_exercises')
    .delete()
    .eq('id', exerciseId);
  if (error) {
    console.error('deleteReportExercise failed', error);
    return false;
  }
  return true;
}
