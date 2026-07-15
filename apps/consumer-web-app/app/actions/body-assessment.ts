'use server';

/**
 * AI Body Assessment Framework — server actions. Same convention as every
 * other action file: a session-scoped Supabase client, RLS (migration 37)
 * as the real authorization boundary, `{ error }`-shaped results for
 * mutations, empty/null for unauthenticated reads.
 *
 * The submit flow mirrors submitDailyCheckin (app/actions/checkin.ts)
 * exactly: the member-authored write (captures, then marking the
 * assessment submitted) always succeeds on its own; AI event emission and
 * the safety check are best-effort afterthoughts that can never roll back
 * or block what the member already did.
 */

import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './auth';
import type {
  AnnotationShape,
  BodyAssessment,
  BodyAssessmentAnnotationSet,
  BodyAssessmentCaptureType,
  BodyAssessmentCoachReview,
  BodyAssessmentComparison,
  BodyAssessmentFinding,
  BodyAssessmentMediaType,
  BodyAssessmentNote,
  BodyAssessmentReviewStatus,
  BodyAssessmentType,
  BodyLandmarkPoint,
  BodyLandmarkSet,
  BodyAssessmentCapture,
  FindingSeverity,
  FindingSide,
  PostureFindingType,
} from '@mef/shared-types-contracts';
import { resolveLocalDate } from './checkin';
import { performCoachIntelligenceAnalysis } from '@/lib/coach-intelligence/analysis';
import { emitAndDispatch } from '@/lib/ai/events';
import { buildRuleFacts } from '@/lib/ai/rules/facts';
import { evaluateConcern } from '@/lib/safety/service';
import { recordSafetyRestrictionNarrative } from '@/lib/narrative/service';
import { getAssessmentTypeConfig } from '@/lib/body-assessment/assessmentTypes';
import { isConcerningFinding } from '@/lib/body-assessment/findings';
import { compareFindingSets, type ComparableFinding } from '@/lib/body-assessment/comparison';
import {
  createSignedCaptureUrl,
  buildCaptureStoragePath,
  deleteCaptureMedia,
  BODY_ASSESSMENT_BUCKET,
} from '@/lib/body-assessment/storage';
import {
  getBodyAssessmentProvider,
  resolveConfiguredBodyAssessmentProvider,
} from '@/lib/body-assessment/providers/registry';
import {
  deleteCaptureRow,
  getAnnotations,
  getAssessment,
  getCapture,
  getFinding,
  getNote,
  insertAssessment,
  insertCapture,
  insertCoachReview,
  insertFinding,
  insertLandmarkSet,
  listAnnotationsForAssessment,
  listAssessments,
  listCaptures,
  listCoachReviews,
  listComparisons,
  listFindings,
  listLandmarkSets,
  setFindingReviewStatus,
  updateAssessment,
  upsertAnnotations,
  upsertComparison,
  upsertNote,
} from '@/lib/body-assessment/data';

async function requireMember(): Promise<{
  supabase: ReturnType<typeof createClient>;
  userId: string;
} | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, userId: user.id };
}

async function memberTimezone(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string> {
  const { data } = await supabase.from('profiles').select('timezone').eq('id', userId).single();
  return data?.timezone ?? 'America/New_York';
}

// ---- Member: start / capture / submit ----

export async function startAssessmentAction(
  assessmentType: BodyAssessmentType
): Promise<ActionResult & { assessment?: BodyAssessment }> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const { supabase, userId } = ctx;

  const timezone = await memberTimezone(supabase, userId);
  const localDate = await resolveLocalDate(
    new Date(new Date().toLocaleString('en-US', { timeZone: timezone })),
    false
  );

  const assessment = await insertAssessment(supabase, userId, assessmentType, timezone, localDate);
  if (!assessment) return { error: 'Could not start assessment.' };
  return { assessment };
}

export type RecordCaptureInput = {
  captureId: string;
  assessmentId: string;
  captureType: BodyAssessmentCaptureType;
  sequenceIndex: number;
  mediaType: BodyAssessmentMediaType;
  storagePath: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
};

/** Called after the browser has already uploaded the capture's bytes directly to Supabase Storage (see components/body-assessment/CameraCapture.tsx) — this only records the metadata row. captureId must be the same id buildCaptureUploadPathAction generated the storage path from. */
export async function recordCaptureAction(
  input: RecordCaptureInput
): Promise<ActionResult & { capture?: BodyAssessmentCapture }> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const { supabase, userId } = ctx;

  const assessment = await getAssessment(supabase, input.assessmentId);
  if (!assessment || assessment.member_id !== userId) return { error: 'Assessment not found.' };

  const capture = await insertCapture(supabase, {
    id: input.captureId,
    assessmentId: input.assessmentId,
    memberId: userId,
    captureType: input.captureType,
    sequenceIndex: input.sequenceIndex,
    mediaType: input.mediaType,
    storagePath: input.storagePath,
    width: input.width ?? null,
    height: input.height ?? null,
    durationSeconds: input.durationSeconds ?? null,
  });
  if (!capture) return { error: 'Could not save capture.' };
  return { capture };
}

export type RecordLandmarkSetInput = {
  assessmentId: string;
  captureId: string;
  landmarks: BodyLandmarkPoint[];
  modelVersion: string;
};

/**
 * Persists the on-device MediaPipe landmarks for one capture — called
 * client-side right after a validated, stable capture (CameraCapture.tsx
 * already has these landmarks live; there is no second detection pass).
 * Not part of the BodyAssessmentProvider.analyzeAssessment() flow — see
 * lib/body-assessment/postureMeasurements.ts's docblock for why an
 * on-device WASM library doesn't fit that server-callable-API interface.
 * Authorized the same way any member-authored write is: RLS's
 * member_insert_own_body_landmark_sets policy, not a special case here.
 */
export async function recordLandmarkSetAction(
  input: RecordLandmarkSetInput
): Promise<ActionResult & { landmarkSet?: BodyLandmarkSet }> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const { supabase, userId } = ctx;

  const assessment = await getAssessment(supabase, input.assessmentId);
  if (!assessment || assessment.member_id !== userId) return { error: 'Assessment not found.' };

  const landmarkSet = await insertLandmarkSet(
    supabase,
    input.assessmentId,
    input.captureId,
    userId,
    input.landmarks,
    'mediapipe',
    input.modelVersion
  );
  if (!landmarkSet) return { error: 'Could not save landmarks.' };
  return { landmarkSet };
}

export type RecordPostureFindingInput = {
  assessmentId: string;
  captureId: string;
  findingType: PostureFindingType;
  side: FindingSide;
  severity: FindingSeverity;
  confidence: number;
  narrative: string;
  landmarksUsed: string[];
};

/**
 * Persists the screening estimates computed for one capture
 * (lib/body-assessment/postureMeasurements.ts). Every finding is written
 * with status 'pending_review' — a coach reviews and confirms/dismisses/
 * overrides it (existing confirmFindingAction/dismissFindingAction/
 * overrideFindingAction), never auto-confirmed. isConcerningFinding()
 * only ever fires for 'significant' severity, which nothing in
 * postureMeasurements.ts ever assigns (its heuristics only produce
 * none/mild/moderate/unknown) — an automated geometric screening
 * shouldn't be the thing that trips the Safety-restriction pathway, so
 * this check is here for consistency with every other finding-writing
 * path in this file, not because it's expected to trigger today.
 */
export async function recordPostureFindingsAction(
  inputs: RecordPostureFindingInput[]
): Promise<ActionResult> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const { supabase, userId } = ctx;
  if (inputs.length === 0) return {};

  const assessmentId = inputs[0]!.assessmentId;
  const assessment = await getAssessment(supabase, assessmentId);
  if (!assessment || assessment.member_id !== userId) return { error: 'Assessment not found.' };

  for (const input of inputs) {
    const created = await insertFinding(supabase, {
      assessmentId: input.assessmentId,
      memberId: userId,
      findingType: input.findingType,
      side: input.side,
      severity: input.severity,
      confidence: input.confidence,
      narrative: input.narrative,
      evidence: [{ type: 'capture', id: input.captureId, note: input.landmarksUsed.join(', ') }],
      providerName: 'mediapipe',
      status: 'pending_review',
    });

    if (created && isConcerningFinding(created.severity, created.confidence)) {
      const evaluation = await evaluateConcern(supabase, {
        memberId: userId,
        sourceFeature: 'body_assessment',
        sourceRecordType: 'body_assessment_finding',
        sourceRecordId: created.id,
        text: created.narrative ?? '',
      });
      if (evaluation) {
        await recordSafetyRestrictionNarrative(supabase, userId, 'system', null, evaluation.classification);
      }
    }
  }

  // Reflects that on-device screening ran for this assessment — distinct
  // from the still-unconfigured server-side BodyAssessmentProvider
  // pipeline (performAnalysis below), which stays 'not_configured'.
  await updateAssessment(supabase, assessmentId, {
    provider_name: 'mediapipe',
    provider_status: 'completed',
  });

  return {};
}

/**
 * The storage path a new capture should upload to — computed server-side
 * so the member id segment (which storage.objects' RLS relies on) is
 * never trusted from the client. The caller generates captureId itself
 * (crypto.randomUUID() in the browser) so the same id can be used both as
 * the storage path segment and, after upload, as recordCaptureAction's
 * captureId.
 */
export async function buildCaptureUploadPathAction(
  assessmentId: string,
  captureId: string,
  extension: string
): Promise<{ bucket: string; path: string } | null> {
  const ctx = await requireMember();
  if (!ctx) return null;
  return {
    bucket: BODY_ASSESSMENT_BUCKET,
    path: buildCaptureStoragePath(ctx.userId, assessmentId, captureId, extension),
  };
}

/** Removes both the Storage object and its metadata row — used when a member retakes a capture during the Review step. */
export async function deleteCaptureAction(captureId: string): Promise<ActionResult> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const { supabase, userId } = ctx;

  const capture = await getCapture(supabase, captureId);
  if (!capture || capture.member_id !== userId) return { error: 'Capture not found.' };

  await deleteCaptureMedia(supabase, [capture.storage_path]);
  const ok = await deleteCaptureRow(supabase, captureId);
  if (!ok) return { error: 'Could not delete capture.' };
  return {};
}

async function runComparisonAgainstPrevious(
  supabase: ReturnType<typeof createClient>,
  memberId: string,
  assessment: BodyAssessment
): Promise<void> {
  const history = await listAssessments(supabase, memberId, {
    assessmentType: assessment.assessment_type,
  });
  const previous = history.find(
    (a) => a.id !== assessment.id && a.started_at < assessment.started_at
  );
  if (!previous) return;

  const [earlierFindings, laterFindings] = await Promise.all([
    listFindings(supabase, previous.id, { activeOnly: true }),
    listFindings(supabase, assessment.id, { activeOnly: true }),
  ]);

  const rows = compareFindingSets(
    earlierFindings as ComparableFinding[],
    laterFindings as ComparableFinding[]
  );

  for (const row of rows) {
    await upsertComparison(supabase, {
      memberId,
      assessmentAId: previous.id,
      assessmentBId: assessment.id,
      dimension: row.dimension,
      trend: row.trend,
      confidence: row.confidence,
      summary: row.summary,
    });
  }
}

/**
 * Runs the configured body-assessment provider (if any) against this
 * assessment's captures. With no provider registered — the expected state
 * for this milestone — this leaves the assessment in 'not_configured'
 * rather than fabricating landmarks or findings. Shared by
 * submitAssessmentAction (auto-attempted right after submit, best-effort)
 * and requestBodyAssessmentAnalysisAction (an explicit re-run a coach or
 * member can trigger later, e.g. once a provider has been connected).
 */
async function performAnalysis(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  assessment: BodyAssessment
): Promise<ActionResult> {
  const assessmentId = assessment.id;
  const providerName = resolveConfiguredBodyAssessmentProvider();
  if (!providerName) {
    await updateAssessment(supabase, assessmentId, {
      status: 'not_configured',
      provider_status: 'not_configured',
    });
    return {
      error:
        'No body assessment analysis provider is configured yet. This assessment is saved and ' +
        'will be analyzed automatically once a provider is connected.',
    };
  }

  await updateAssessment(supabase, assessmentId, {
    status: 'analyzing',
    provider_name: providerName,
    provider_status: 'pending',
  });

  try {
    const captures = await listCaptures(supabase, assessmentId);
    const signedCaptures = await Promise.all(
      captures.map(async (capture) => ({
        captureId: capture.id,
        captureType: capture.capture_type,
        mediaType: capture.media_type,
        signedUrl: (await createSignedCaptureUrl(supabase, capture.storage_path)) ?? '',
      }))
    );

    const provider = getBodyAssessmentProvider(providerName);
    const result = await provider.analyzeAssessment({
      assessmentId,
      memberId: userId,
      assessmentType: assessment.assessment_type,
      captures: signedCaptures,
    });

    for (const landmarkSet of result.landmarkSets) {
      await insertLandmarkSet(
        supabase,
        assessmentId,
        landmarkSet.captureId,
        userId,
        landmarkSet.landmarks,
        result.provider,
        result.model
      );
    }

    for (const finding of result.findings) {
      const created = await insertFinding(supabase, {
        assessmentId,
        memberId: userId,
        findingType: finding.findingType,
        side: finding.side,
        severity: finding.severity,
        confidence: finding.confidence,
        narrative: finding.narrative,
        evidence: finding.evidence,
        providerName: result.provider,
      });

      if (created && isConcerningFinding(created.severity, created.confidence)) {
        const evaluation = await evaluateConcern(supabase, {
          memberId: userId,
          sourceFeature: 'body_assessment',
          sourceRecordType: 'body_assessment_finding',
          sourceRecordId: created.id,
          text: created.narrative,
        });
        if (evaluation) {
          await recordSafetyRestrictionNarrative(
            supabase,
            userId,
            'system',
            null,
            evaluation.classification
          );
        }
      }
    }

    await updateAssessment(supabase, assessmentId, {
      status: 'analyzed',
      provider_status: 'completed',
      completed_at: new Date().toISOString(),
    });

    await runComparisonAgainstPrevious(supabase, userId, assessment);

    return {};
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed.';
    await updateAssessment(supabase, assessmentId, {
      status: 'submitted',
      provider_status: 'failed',
      provider_error: message,
    });
    return { error: message };
  }
}

/** Marks the guided flow's captures as final, emits the AI event that feeds Coaching Brain/Narrative/Intelligence Core via the existing dispatcher, best-effort attempts analysis (a no-op-but-safe 'not_configured' outcome today), and runs the comparison engine against the member's previous same-type assessment (if any) — same best-effort discipline as submitDailyCheckin. */
export async function submitAssessmentAction(
  assessmentId: string,
  memberNotes?: string
): Promise<ActionResult> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const { supabase, userId } = ctx;

  const assessment = await getAssessment(supabase, assessmentId);
  if (!assessment || assessment.member_id !== userId) return { error: 'Assessment not found.' };

  const captures = await listCaptures(supabase, assessmentId);
  if (captures.length === 0) return { error: 'Add at least one capture before submitting.' };

  const ok = await updateAssessment(supabase, assessmentId, {
    status: 'submitted',
    submitted_at: new Date().toISOString(),
    member_notes: memberNotes ?? null,
  });
  if (!ok) return { error: 'Could not submit assessment.' };

  const typeConfig = getAssessmentTypeConfig(assessment.assessment_type);

  try {
    const findings = await listFindings(supabase, assessmentId, { activeOnly: true });
    const facts = buildRuleFacts([], assessment.local_date);
    await emitAndDispatch(
      supabase,
      {
        eventType: 'body_assessment_completed',
        memberId: userId,
        source: 'member',
        payload: {
          assessmentId,
          assessmentType: assessment.assessment_type,
          assessmentTypeLabel: typeConfig.label,
          findingsCount: findings.length,
          significantFindingsCount: findings.filter((f) => f.severity === 'significant').length,
        },
      },
      facts
    );
  } catch (aiError) {
    console.error('AI event emission failed for submitAssessmentAction', aiError);
  }

  try {
    // Best-effort: with no provider configured (the expected state for
    // this milestone) this simply marks the assessment 'not_configured'
    // and returns an error we deliberately swallow — submission has
    // already succeeded and must not fail because of this.
    await performAnalysis(supabase, userId, { ...assessment, status: 'submitted' });
  } catch (analysisError) {
    console.error('Analysis attempt failed for submitAssessmentAction', analysisError);
  }

  // Coach Intelligence Workspace: puts the assessment into a durable "pending
  // coach review" state and best-effort runs the (today unconfigured) AI
  // draft-recommendation pipeline behind it — same "never block or fail the
  // submission" discipline as the two blocks above. Unconditional (not
  // gated on a provider being configured) so "pending coach review" is a
  // guaranteed fact of submission, not contingent on AI being wired up.
  try {
    const signedCaptures = await Promise.all(
      captures.map(async (capture) => ({
        captureId: capture.id,
        captureType: capture.capture_type,
        mediaType: capture.media_type,
        signedUrl: (await createSignedCaptureUrl(supabase, capture.storage_path)) ?? '',
      }))
    );
    await performCoachIntelligenceAnalysis(supabase, {
      sourceFeature: 'body_assessment',
      sourceRecordId: assessmentId,
      memberId: userId,
      assessmentTypeLabel: typeConfig.label,
      context: { captures: signedCaptures },
    });
  } catch (coachIntelligenceError) {
    console.error('Coach Intelligence analysis failed for submitAssessmentAction', coachIntelligenceError);
  }

  try {
    await emitAndDispatch(
      supabase,
      {
        eventType: 'assessment_submitted_for_coach_review',
        memberId: userId,
        source: 'member',
        payload: {
          sourceFeature: 'body_assessment',
          sourceRecordId: assessmentId,
          assessmentTypeLabel: typeConfig.label,
        },
      },
      buildRuleFacts([], assessment.local_date)
    );
  } catch (aiError) {
    console.error('assessment_submitted_for_coach_review event emission failed', aiError);
  }

  return {};
}

// ---- Member: analysis (provider integration point) ----

/** Explicit re-run — e.g. a "Run analysis" button a member or coach can press later, once a provider has been connected. */
export async function requestBodyAssessmentAnalysisAction(
  assessmentId: string
): Promise<ActionResult> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const { supabase, userId } = ctx;

  const assessment = await getAssessment(supabase, assessmentId);
  if (!assessment || assessment.member_id !== userId) return { error: 'Assessment not found.' };

  return performAnalysis(supabase, userId, assessment);
}

// ---- Member: reads ----

export async function getMyAssessmentsAction(
  assessmentType?: BodyAssessmentType
): Promise<BodyAssessment[]> {
  const ctx = await requireMember();
  if (!ctx) return [];
  return listAssessments(ctx.supabase, ctx.userId, assessmentType ? { assessmentType } : {});
}

export type BodyAssessmentDetail = {
  assessment: BodyAssessment;
  captures: BodyAssessmentCapture[];
  landmarkSets: BodyLandmarkSet[];
  findings: BodyAssessmentFinding[];
  coachReviews: BodyAssessmentCoachReview[];
};

export async function getAssessmentDetailAction(
  assessmentId: string
): Promise<BodyAssessmentDetail | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const assessment = await getAssessment(supabase, assessmentId);
  if (!assessment) return null; // RLS already means "not found" covers "not yours/not assigned"

  const [captures, landmarkSets, findings, coachReviews] = await Promise.all([
    listCaptures(supabase, assessmentId),
    listLandmarkSets(supabase, assessmentId),
    listFindings(supabase, assessmentId, { activeOnly: true }),
    listCoachReviews(supabase, assessmentId),
  ]);

  return { assessment, captures, landmarkSets, findings, coachReviews };
}

export async function getSignedCaptureUrlAction(storagePath: string): Promise<string | null> {
  const ctx = await requireMember();
  if (!ctx) return null;
  return createSignedCaptureUrl(ctx.supabase, storagePath);
}

export async function getAssessmentComparisonAction(
  assessmentAId: string,
  assessmentBId: string
): Promise<BodyAssessmentComparison[]> {
  const ctx = await requireMember();
  if (!ctx) return [];
  return listComparisons(ctx.supabase, assessmentAId, assessmentBId);
}

// ---- Coach: reads + review workflow ----

export async function getClientBodyAssessmentsAction(clientId: string): Promise<BodyAssessment[]> {
  const supabase = createClient();
  return listAssessments(supabase, clientId);
}

export async function getClientBodyAssessmentDetailAction(
  assessmentId: string
): Promise<BodyAssessmentDetail | null> {
  return getAssessmentDetailAction(assessmentId);
}

export type AddCoachReviewInput = {
  assessmentId: string;
  clientId: string;
  reviewStatus: BodyAssessmentReviewStatus;
  observations?: string;
  recommendations?: string;
  findingsApproved?: boolean;
  reassessmentMarkedComplete?: boolean;
};

export async function addCoachReviewAction(input: AddCoachReviewInput): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const review = await insertCoachReview(supabase, {
    assessmentId: input.assessmentId,
    memberId: input.clientId,
    coachId: user.id,
    reviewStatus: input.reviewStatus,
    observations: input.observations ?? null,
    recommendations: input.recommendations ?? null,
    findingsApproved: input.findingsApproved ?? false,
    reassessmentMarkedComplete: input.reassessmentMarkedComplete ?? false,
  });
  if (!review) return { error: 'Could not save review.' };

  if (input.reassessmentMarkedComplete || input.reviewStatus === 'completed') {
    await updateAssessment(supabase, input.assessmentId, { status: 'coach_reviewed' });
  }

  return {};
}

export async function confirmFindingAction(findingId: string): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const ok = await setFindingReviewStatus(supabase, findingId, 'confirmed', user.id);
  if (!ok) return { error: 'Could not confirm finding.' };
  return {};
}

export async function dismissFindingAction(findingId: string): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const ok = await setFindingReviewStatus(supabase, findingId, 'dismissed', user.id);
  if (!ok) return { error: 'Could not dismiss finding.' };
  return {};
}

export type OverrideFindingInput = {
  findingId: string;
  severity: BodyAssessmentFinding['severity'];
  narrative?: string;
  coachOverrideNotes: string;
};

/** A coach override never edits the original finding row — it inserts a new one carrying the coach's corrected severity/narrative and supersedes the original, preserving a full audit trail (same discipline as narrative_items/wellness_identity_observations). */
export async function overrideFindingAction(input: OverrideFindingInput): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const original = await getFinding(supabase, input.findingId);
  if (!original) return { error: 'Finding not found.' };

  const created = await insertFinding(supabase, {
    assessmentId: original.assessment_id,
    memberId: original.member_id,
    findingType: original.finding_type,
    side: original.side,
    severity: input.severity,
    confidence: original.confidence,
    narrative: input.narrative ?? original.narrative,
    evidence: original.evidence,
    providerName: original.provider_name,
    supersedesId: original.id,
    status: 'coach_overridden',
    coachReviewedBy: user.id,
    coachOverrideNotes: input.coachOverrideNotes,
  });

  if (!created) return { error: 'Could not save override.' };
  return {};
}

// ---- Coach: review workspace (notes + annotations) ----

export async function getAssessmentNoteAction(
  assessmentId: string
): Promise<BodyAssessmentNote | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return getNote(supabase, assessmentId);
}

export type SaveAssessmentNoteInput = {
  assessmentId: string;
  clientId: string;
  content: string;
};

/** Last-write-wins autosave for the Coach Notes scratchpad — not an audit entry, unlike addCoachReviewAction. */
export async function saveAssessmentNoteAction(
  input: SaveAssessmentNoteInput
): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const note = await upsertNote(supabase, {
    assessmentId: input.assessmentId,
    memberId: input.clientId,
    coachId: user.id,
    content: input.content,
  });
  if (!note) return { error: 'Could not save note.' };
  return {};
}

export async function getCaptureAnnotationsAction(
  captureId: string
): Promise<AnnotationShape[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const set = await getAnnotations(supabase, captureId);
  return set?.shapes ?? [];
}

export async function listAssessmentAnnotationsAction(
  assessmentId: string
): Promise<BodyAssessmentAnnotationSet[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  return listAnnotationsForAssessment(supabase, assessmentId);
}

export type SaveCaptureAnnotationsInput = {
  captureId: string;
  assessmentId: string;
  clientId: string;
  shapes: AnnotationShape[];
};

export async function saveCaptureAnnotationsAction(
  input: SaveCaptureAnnotationsInput
): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const set = await upsertAnnotations(supabase, {
    captureId: input.captureId,
    assessmentId: input.assessmentId,
    memberId: input.clientId,
    coachId: user.id,
    shapes: input.shapes,
  });
  if (!set) return { error: 'Could not save annotations.' };
  return {};
}
