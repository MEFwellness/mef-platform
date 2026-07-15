/**
 * Database access for the AI Body Assessment Framework — same shape as
 * lib/narrative/data.ts: pure functions taking a SupabaseClient, RLS
 * (migration 37) decides who may read/write what. Inserts generate their
 * own id client-side and skip `.select()` after writing, for the same
 * reason lib/narrative/data.ts does (an inserting session isn't always
 * guaranteed a matching SELECT policy for every row shape it's allowed to
 * write).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type {
  AnnotationShape,
  BodyAssessment,
  BodyAssessmentAnnotationSet,
  BodyAssessmentCapture,
  BodyAssessmentCaptureType,
  BodyAssessmentComparison,
  BodyAssessmentCoachReview,
  BodyAssessmentFinding,
  BodyAssessmentMediaType,
  BodyAssessmentNote,
  BodyAssessmentProviderStatus,
  BodyAssessmentReviewStatus,
  BodyAssessmentStatus,
  BodyAssessmentType,
  BodyLandmarkPoint,
  BodyLandmarkSet,
  CameraTiltReading,
  CaptureDeviceInfo,
  CaptureValidationSummary,
  ComparisonTrend,
  FindingEvidenceRef,
  FindingSeverity,
  FindingSide,
  PostureFindingType,
} from '@mef/shared-types-contracts';

// ---- body_assessments ----

export async function insertAssessment(
  supabase: SupabaseClient,
  memberId: string,
  assessmentType: BodyAssessmentType,
  timezone: string,
  localDate: string
): Promise<BodyAssessment | null> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const { error } = await supabase.from('body_assessments').insert({
    id,
    member_id: memberId,
    assessment_type: assessmentType,
    status: 'in_progress',
    timezone,
    local_date: localDate,
    started_at: now,
  });

  if (error) {
    console.error('insertAssessment failed', error);
    return null;
  }

  return {
    id,
    member_id: memberId,
    assessment_type: assessmentType,
    status: 'in_progress',
    timezone,
    local_date: localDate,
    started_at: now,
    submitted_at: null,
    completed_at: null,
    provider_name: null,
    provider_status: 'not_configured',
    provider_error: null,
    member_notes: null,
    created_at: now,
    updated_at: now,
  };
}

export type AssessmentPatch = Partial<{
  status: BodyAssessmentStatus;
  submitted_at: string | null;
  completed_at: string | null;
  provider_name: string | null;
  provider_status: BodyAssessmentProviderStatus;
  provider_error: string | null;
  member_notes: string | null;
}>;

export async function updateAssessment(
  supabase: SupabaseClient,
  assessmentId: string,
  patch: AssessmentPatch
): Promise<boolean> {
  const { error } = await supabase
    .from('body_assessments')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', assessmentId);

  if (error) {
    console.error('updateAssessment failed', error);
    return false;
  }
  return true;
}

export async function getAssessment(
  supabase: SupabaseClient,
  assessmentId: string
): Promise<BodyAssessment | null> {
  const { data, error } = await supabase
    .from('body_assessments')
    .select('*')
    .eq('id', assessmentId)
    .maybeSingle();

  if (error) {
    console.error('getAssessment failed', error);
    return null;
  }
  return data as BodyAssessment | null;
}

export async function listAssessments(
  supabase: SupabaseClient,
  memberId: string,
  options: { assessmentType?: BodyAssessmentType; limit?: number } = {}
): Promise<BodyAssessment[]> {
  let query = supabase
    .from('body_assessments')
    .select('*')
    .eq('member_id', memberId)
    .neq('status', 'archived')
    .order('started_at', { ascending: false });

  if (options.assessmentType) query = query.eq('assessment_type', options.assessmentType);
  if (options.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) {
    console.error('listAssessments failed', error);
    return [];
  }
  return data as BodyAssessment[];
}

// ---- body_assessment_captures ----

export type CaptureInput = {
  id?: string;
  assessmentId: string;
  memberId: string;
  captureType: BodyAssessmentCaptureType;
  sequenceIndex: number;
  mediaType: BodyAssessmentMediaType;
  storagePath: string;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  /** Optional — populated once the capturing client sends it (migration 51). Backward-compatible: existing callers that omit this keep working, the column stays null. */
  deviceInfo?: CaptureDeviceInfo | null;
  /** Optional — the device orientation reading at capture time (migration 51). Same backward-compatibility note as deviceInfo. */
  cameraTilt?: CameraTiltReading | null;
  /** Optional — the live capture-validation pipeline's session summary for this step (migration 51). Same backward-compatibility note as deviceInfo. */
  validationSummary?: CaptureValidationSummary | null;
};

export async function insertCapture(
  supabase: SupabaseClient,
  input: CaptureInput
): Promise<BodyAssessmentCapture | null> {
  // The id is normally supplied by the caller (it must match the Storage
  // path's own {capture_id} segment the browser already uploaded the
  // media to — see buildCaptureUploadPathAction) rather than generated
  // here, unlike every other insert* function in this file.
  const id = input.id ?? randomUUID();
  const now = new Date().toISOString();
  const deviceInfo = input.deviceInfo ?? null;
  const cameraTilt = input.cameraTilt ?? null;
  const validationSummary = input.validationSummary ?? null;

  const { error } = await supabase.from('body_assessment_captures').insert({
    id,
    assessment_id: input.assessmentId,
    member_id: input.memberId,
    capture_type: input.captureType,
    sequence_index: input.sequenceIndex,
    media_type: input.mediaType,
    storage_bucket: 'body-assessment-media',
    storage_path: input.storagePath,
    width: input.width ?? null,
    height: input.height ?? null,
    duration_seconds: input.durationSeconds ?? null,
    device_info: deviceInfo,
    camera_tilt: cameraTilt,
    validation_summary: validationSummary,
    captured_at: now,
  });

  if (error) {
    console.error('insertCapture failed', error);
    return null;
  }

  return {
    id,
    assessment_id: input.assessmentId,
    member_id: input.memberId,
    capture_type: input.captureType,
    sequence_index: input.sequenceIndex,
    media_type: input.mediaType,
    storage_bucket: 'body-assessment-media',
    storage_path: input.storagePath,
    width: input.width ?? null,
    height: input.height ?? null,
    duration_seconds: input.durationSeconds ?? null,
    device_info: deviceInfo,
    camera_tilt: cameraTilt,
    validation_summary: validationSummary,
    captured_at: now,
    created_at: now,
  };
}

export async function getCapture(
  supabase: SupabaseClient,
  captureId: string
): Promise<BodyAssessmentCapture | null> {
  const { data, error } = await supabase
    .from('body_assessment_captures')
    .select('*')
    .eq('id', captureId)
    .maybeSingle();

  if (error) {
    console.error('getCapture failed', error);
    return null;
  }
  return data as BodyAssessmentCapture | null;
}

/** Deletes the metadata row only — the caller (app/actions/body-assessment.ts) removes the underlying Storage object separately, since Storage deletion needs the bucket client, not the table client. */
export async function deleteCaptureRow(
  supabase: SupabaseClient,
  captureId: string
): Promise<boolean> {
  const { error } = await supabase.from('body_assessment_captures').delete().eq('id', captureId);
  if (error) {
    console.error('deleteCaptureRow failed', error);
    return false;
  }
  return true;
}

export async function listCaptures(
  supabase: SupabaseClient,
  assessmentId: string
): Promise<BodyAssessmentCapture[]> {
  const { data, error } = await supabase
    .from('body_assessment_captures')
    .select('*')
    .eq('assessment_id', assessmentId)
    .order('sequence_index', { ascending: true });

  if (error) {
    console.error('listCaptures failed', error);
    return [];
  }
  return data as BodyAssessmentCapture[];
}

// ---- body_landmark_sets ----

export async function insertLandmarkSet(
  supabase: SupabaseClient,
  assessmentId: string,
  captureId: string,
  memberId: string,
  landmarks: BodyLandmarkPoint[],
  providerName: string | null,
  modelVersion: string | null
): Promise<BodyLandmarkSet | null> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const { error } = await supabase.from('body_landmark_sets').insert({
    id,
    assessment_id: assessmentId,
    capture_id: captureId,
    member_id: memberId,
    provider_name: providerName,
    model_version: modelVersion,
    landmarks,
    detected_at: now,
  });

  if (error) {
    console.error('insertLandmarkSet failed', error);
    return null;
  }

  return {
    id,
    assessment_id: assessmentId,
    capture_id: captureId,
    member_id: memberId,
    provider_name: providerName,
    model_version: modelVersion,
    landmarks,
    detected_at: now,
    created_at: now,
  };
}

export async function listLandmarkSets(
  supabase: SupabaseClient,
  assessmentId: string
): Promise<BodyLandmarkSet[]> {
  const { data, error } = await supabase
    .from('body_landmark_sets')
    .select('*')
    .eq('assessment_id', assessmentId);

  if (error) {
    console.error('listLandmarkSets failed', error);
    return [];
  }
  return data as BodyLandmarkSet[];
}

// ---- body_assessment_findings ----

export type FindingInput = {
  assessmentId: string;
  memberId: string;
  findingType: PostureFindingType;
  side?: FindingSide;
  severity?: FindingSeverity;
  confidence?: number;
  narrative?: string | null;
  evidence?: FindingEvidenceRef[];
  providerName?: string | null;
  supersedesId?: string | null;
  /** A coach-authored override sets these directly at insert time rather than through the separate setFindingReviewStatus update, since it's a new (superseding) row, not a mutation of the original. */
  status?: 'pending_review' | 'coach_overridden';
  coachReviewedBy?: string | null;
  coachOverrideNotes?: string | null;
  /** Optional — which version of the on-device screening threshold constants produced this finding (migration 51). Backward-compatible: existing callers that omit these keep working, the columns stay null. */
  thresholdConfigVersion?: string | null;
  /** Optional — the raw measured degree/ratio behind `narrative` (migration 51). */
  rawValue?: number | null;
  /** Optional — the unit rawValue is expressed in, e.g. 'degrees' or 'ratio'. */
  unit?: string | null;
  /** Optional — a left/right differential for findings that measure an asymmetry (migration 51). */
  sideDiff?: number | null;
};

export async function insertFinding(
  supabase: SupabaseClient,
  input: FindingInput
): Promise<BodyAssessmentFinding | null> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const coachReviewed = Boolean(input.coachReviewedBy);
  const row = {
    id,
    assessment_id: input.assessmentId,
    member_id: input.memberId,
    finding_type: input.findingType,
    side: input.side ?? 'not_applicable',
    severity: input.severity ?? 'unknown',
    confidence: input.confidence ?? 0,
    narrative: input.narrative ?? null,
    evidence: input.evidence ?? [],
    provider_name: input.providerName ?? null,
    status: input.status ?? 'pending_review',
    coach_reviewed_by: input.coachReviewedBy ?? null,
    coach_reviewed_at: coachReviewed ? now : null,
    coach_override_notes: input.coachOverrideNotes ?? null,
    supersedes_id: input.supersedesId ?? null,
    threshold_config_version: input.thresholdConfigVersion ?? null,
    raw_value: input.rawValue ?? null,
    unit: input.unit ?? null,
    side_diff: input.sideDiff ?? null,
  };

  const { error } = await supabase.from('body_assessment_findings').insert(row);
  if (error) {
    console.error('insertFinding failed', error);
    return null;
  }

  if (input.supersedesId) {
    await supabase
      .from('body_assessment_findings')
      .update({ status: 'superseded', superseded_by_id: id, updated_at: now })
      .eq('id', input.supersedesId);
  }

  return {
    ...row,
    superseded_by_id: null,
    created_at: now,
    updated_at: now,
  };
}

export async function listFindings(
  supabase: SupabaseClient,
  assessmentId: string,
  options: { activeOnly?: boolean } = {}
): Promise<BodyAssessmentFinding[]> {
  let query = supabase
    .from('body_assessment_findings')
    .select('*')
    .eq('assessment_id', assessmentId)
    .order('created_at', { ascending: false });

  if (options.activeOnly) query = query.neq('status', 'superseded');

  const { data, error } = await query;
  if (error) {
    console.error('listFindings failed', error);
    return [];
  }
  return data as BodyAssessmentFinding[];
}

/**
 * Every finding of one type across a member's ENTIRE assessment history
 * (not scoped to a single assessment_id, unlike listFindings above) —
 * ascending by created_at so a caller can plot it left-to-right as a trend
 * without re-sorting. Backs the multi-point trend chart
 * (RightPanel/TrendChart.tsx): a coach dashboard needs "how has forward
 * head posture changed across this member's last N assessments," which no
 * existing query answers since listFindings is scoped to one assessment.
 */
export async function listFindingsByType(
  supabase: SupabaseClient,
  memberId: string,
  findingType: PostureFindingType,
  options: { activeOnly?: boolean } = {}
): Promise<BodyAssessmentFinding[]> {
  let query = supabase
    .from('body_assessment_findings')
    .select('*')
    .eq('member_id', memberId)
    .eq('finding_type', findingType)
    .order('created_at', { ascending: true });

  if (options.activeOnly) query = query.neq('status', 'superseded');

  const { data, error } = await query;
  if (error) {
    console.error('listFindingsByType failed', error);
    return [];
  }
  return data as BodyAssessmentFinding[];
}

export async function getFinding(
  supabase: SupabaseClient,
  findingId: string
): Promise<BodyAssessmentFinding | null> {
  const { data, error } = await supabase
    .from('body_assessment_findings')
    .select('*')
    .eq('id', findingId)
    .maybeSingle();

  if (error) {
    console.error('getFinding failed', error);
    return null;
  }
  return data as BodyAssessmentFinding | null;
}

export async function setFindingReviewStatus(
  supabase: SupabaseClient,
  findingId: string,
  status: 'confirmed' | 'dismissed',
  coachId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('body_assessment_findings')
    .update({
      status,
      coach_reviewed_by: coachId,
      coach_reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', findingId);

  if (error) {
    console.error('setFindingReviewStatus failed', error);
    return false;
  }
  return true;
}

// ---- body_assessment_comparisons ----

export type ComparisonInput = {
  memberId: string;
  assessmentAId: string;
  assessmentBId: string;
  dimension: PostureFindingType | 'overall';
  trend: ComparisonTrend;
  confidence: number;
  summary: string;
  details?: unknown[];
};

export async function upsertComparison(
  supabase: SupabaseClient,
  input: ComparisonInput
): Promise<BodyAssessmentComparison | null> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const { error } = await supabase.from('body_assessment_comparisons').upsert(
    {
      id,
      member_id: input.memberId,
      assessment_a_id: input.assessmentAId,
      assessment_b_id: input.assessmentBId,
      dimension: input.dimension,
      trend: input.trend,
      confidence: input.confidence,
      summary: input.summary,
      details: input.details ?? [],
    },
    { onConflict: 'assessment_a_id,assessment_b_id,dimension' }
  );

  if (error) {
    console.error('upsertComparison failed', error);
    return null;
  }

  return {
    id,
    member_id: input.memberId,
    assessment_a_id: input.assessmentAId,
    assessment_b_id: input.assessmentBId,
    dimension: input.dimension,
    trend: input.trend,
    confidence: input.confidence,
    summary: input.summary,
    details: input.details ?? [],
    created_at: now,
  };
}

export async function listComparisons(
  supabase: SupabaseClient,
  assessmentAId: string,
  assessmentBId: string
): Promise<BodyAssessmentComparison[]> {
  const { data, error } = await supabase
    .from('body_assessment_comparisons')
    .select('*')
    .eq('assessment_a_id', assessmentAId)
    .eq('assessment_b_id', assessmentBId);

  if (error) {
    console.error('listComparisons failed', error);
    return [];
  }
  return data as BodyAssessmentComparison[];
}

// ---- body_assessment_coach_reviews ----

export type CoachReviewInput = {
  assessmentId: string;
  memberId: string;
  coachId: string;
  reviewStatus: BodyAssessmentReviewStatus;
  observations?: string | null;
  recommendations?: string | null;
  findingsApproved?: boolean;
  reassessmentMarkedComplete?: boolean;
};

export async function insertCoachReview(
  supabase: SupabaseClient,
  input: CoachReviewInput
): Promise<BodyAssessmentCoachReview | null> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const { error } = await supabase.from('body_assessment_coach_reviews').insert({
    id,
    assessment_id: input.assessmentId,
    member_id: input.memberId,
    coach_id: input.coachId,
    review_status: input.reviewStatus,
    observations: input.observations ?? null,
    recommendations: input.recommendations ?? null,
    findings_approved: input.findingsApproved ?? false,
    reassessment_marked_complete: input.reassessmentMarkedComplete ?? false,
  });

  if (error) {
    console.error('insertCoachReview failed', error);
    return null;
  }

  return {
    id,
    assessment_id: input.assessmentId,
    member_id: input.memberId,
    coach_id: input.coachId,
    review_status: input.reviewStatus,
    observations: input.observations ?? null,
    recommendations: input.recommendations ?? null,
    findings_approved: input.findingsApproved ?? false,
    reassessment_marked_complete: input.reassessmentMarkedComplete ?? false,
    created_at: now,
  };
}

export async function listCoachReviews(
  supabase: SupabaseClient,
  assessmentId: string
): Promise<BodyAssessmentCoachReview[]> {
  const { data, error } = await supabase
    .from('body_assessment_coach_reviews')
    .select('*')
    .eq('assessment_id', assessmentId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('listCoachReviews failed', error);
    return [];
  }
  return data as BodyAssessmentCoachReview[];
}

// ---- body_assessment_notes ----

export async function getNote(
  supabase: SupabaseClient,
  assessmentId: string
): Promise<BodyAssessmentNote | null> {
  const { data, error } = await supabase
    .from('body_assessment_notes')
    .select('*')
    .eq('assessment_id', assessmentId)
    .maybeSingle();

  if (error) {
    console.error('getNote failed', error);
    return null;
  }
  return data as BodyAssessmentNote | null;
}

export async function upsertNote(
  supabase: SupabaseClient,
  input: { assessmentId: string; memberId: string; coachId: string; content: string }
): Promise<BodyAssessmentNote | null> {
  const { data, error } = await supabase
    .from('body_assessment_notes')
    .upsert(
      {
        assessment_id: input.assessmentId,
        member_id: input.memberId,
        content: input.content,
        updated_by: input.coachId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'assessment_id' }
    )
    .select('*')
    .single();

  if (error) {
    console.error('upsertNote failed', error);
    return null;
  }
  return data as BodyAssessmentNote;
}

// ---- body_assessment_annotations ----

export async function getAnnotations(
  supabase: SupabaseClient,
  captureId: string
): Promise<BodyAssessmentAnnotationSet | null> {
  const { data, error } = await supabase
    .from('body_assessment_annotations')
    .select('*')
    .eq('capture_id', captureId)
    .maybeSingle();

  if (error) {
    console.error('getAnnotations failed', error);
    return null;
  }
  return data as BodyAssessmentAnnotationSet | null;
}

export async function listAnnotationsForAssessment(
  supabase: SupabaseClient,
  assessmentId: string
): Promise<BodyAssessmentAnnotationSet[]> {
  const { data, error } = await supabase
    .from('body_assessment_annotations')
    .select('*')
    .eq('assessment_id', assessmentId);

  if (error) {
    console.error('listAnnotationsForAssessment failed', error);
    return [];
  }
  return data as BodyAssessmentAnnotationSet[];
}

export async function upsertAnnotations(
  supabase: SupabaseClient,
  input: {
    captureId: string;
    assessmentId: string;
    memberId: string;
    coachId: string;
    shapes: AnnotationShape[];
  }
): Promise<BodyAssessmentAnnotationSet | null> {
  const { data, error } = await supabase
    .from('body_assessment_annotations')
    .upsert(
      {
        capture_id: input.captureId,
        assessment_id: input.assessmentId,
        member_id: input.memberId,
        shapes: input.shapes,
        updated_by: input.coachId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'capture_id' }
    )
    .select('*')
    .single();

  if (error) {
    console.error('upsertAnnotations failed', error);
    return null;
  }
  return data as BodyAssessmentAnnotationSet;
}
