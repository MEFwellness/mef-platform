'use server';

/**
 * Coach Intelligence Workspace — server actions. Same convention as
 * app/actions/body-assessment.ts: a session-scoped Supabase client, RLS
 * (migration 39) as the real authorization boundary, `{ error }`-shaped
 * results for mutations, empty/null for unauthenticated reads. No role
 * check in app code anywhere here — exactly like getClientBodyAssessmentDetailAction,
 * RLS alone decides whether a given caller (member vs. their assigned coach)
 * can see/write a given row, and the same read action naturally serves both
 * (a member's own read is narrowed to published+accepted by RLS itself).
 */

import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './auth';
import type {
  AiObservationStatus,
  AssessmentAiSourceFeature,
} from '@mef/shared-types-contracts';
import { performCoachIntelligenceAnalysis } from '@/lib/coach-intelligence/analysis';
import {
  deleteReportExercise,
  getAnalysisById,
  getAnalysisBySource,
  insertReportExercise,
  listObservations,
  listReportExercises,
  updateAnalysis,
  updateObservation,
} from '@/lib/coach-intelligence/data';
import { insertNotification } from '@/lib/notifications/data';
import { onAssessmentPublished } from '@/lib/health-profile/orchestration';
import type {
  AssessmentAiAnalysis,
  AssessmentAiObservation,
  AssessmentReportExercise,
} from '@mef/shared-types-contracts';

export type CoachIntelligenceWorkspace = {
  analysis: AssessmentAiAnalysis;
  observations: AssessmentAiObservation[];
  exercises: AssessmentReportExercise[];
};

export async function getAiAnalysisForAssessmentAction(
  sourceFeature: AssessmentAiSourceFeature,
  sourceRecordId: string
): Promise<CoachIntelligenceWorkspace | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const analysis = await getAnalysisBySource(supabase, sourceFeature, sourceRecordId);
  if (!analysis) return null;

  const [observations, exercises] = await Promise.all([
    listObservations(supabase, analysis.id),
    listReportExercises(supabase, analysis.id),
  ]);

  return { analysis, observations, exercises };
}

/** Explicit re-run/backfill — mirrors requestBodyAssessmentAnalysisAction. A coach can trigger this from the AI Assistant panel's empty state, or to retry after a provider failure. */
export async function runAiAnalysisAction(input: {
  sourceFeature: AssessmentAiSourceFeature;
  sourceRecordId: string;
  memberId: string;
  assessmentTypeLabel: string;
}): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const result = await performCoachIntelligenceAnalysis(supabase, {
    sourceFeature: input.sourceFeature,
    sourceRecordId: input.sourceRecordId,
    memberId: input.memberId,
    assessmentTypeLabel: input.assessmentTypeLabel,
    context: {},
  });
  return result.error ? { error: result.error } : {};
}

export type UpdateAiObservationInput = {
  observationId: string;
  status?: AiObservationStatus;
  coachText?: string | null;
};

/** Covers Accept, Reject, and Edit wording — a status change and a text edit can land in the same call (e.g. "accept, but reworded"). */
export async function updateAiObservationAction(
  input: UpdateAiObservationInput
): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const patch: Parameters<typeof updateObservation>[2] = {};
  if (input.status) {
    patch.status = input.status;
    patch.coach_reviewed_by = user.id;
    patch.coach_reviewed_at = new Date().toISOString();
  }
  if (input.coachText !== undefined) patch.coach_text = input.coachText;

  const ok = await updateObservation(supabase, input.observationId, patch);
  if (!ok) return { error: 'Could not update observation.' };
  return {};
}

export async function updateAiAnalysisSummaryAction(input: {
  analysisId: string;
  coachSummary: string;
}): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const ok = await updateAnalysis(supabase, input.analysisId, { coach_summary: input.coachSummary });
  if (!ok) return { error: 'Could not save summary.' };
  return {};
}

export async function updateAiAnalysisPersonalNotesAction(input: {
  analysisId: string;
  notes: string;
}): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const ok = await updateAnalysis(supabase, input.analysisId, { coach_personal_notes: input.notes });
  if (!ok) return { error: 'Could not save notes.' };
  return {};
}

export async function saveAiAnalysisDraftAction(analysisId: string): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const ok = await updateAnalysis(supabase, analysisId, {
    status: 'draft_saved',
    coach_reviewed_by: user.id,
    coach_reviewed_at: new Date().toISOString(),
  });
  if (!ok) return { error: 'Could not save draft.' };
  return {};
}

/** Publishing is the one action in this file that reaches beyond assessment_ai_* rows — it also writes a notifications row, which is what "notify the member" (and "make the report available inside the member portal") actually means for this milestone: the member's own RLS-narrowed read of these same tables (migration 39) unlocks the moment status flips to 'published'; nothing else needs to change on the member side. */
export async function publishAiAnalysisReportAction(input: {
  analysisId: string;
  memberId: string;
  assessmentTypeLabel: string;
}): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const analysis = await getAnalysisById(supabase, input.analysisId);
  if (!analysis) return { error: 'Could not find the analysis to publish.' };

  const now = new Date().toISOString();
  const ok = await updateAnalysis(supabase, input.analysisId, {
    status: 'published',
    published_by: user.id,
    published_at: now,
    coach_reviewed_by: user.id,
    coach_reviewed_at: now,
  });
  if (!ok) return { error: 'Could not publish report.' };

  // source_record_id here is the underlying assessment id (what /assessment/[id]
  // routes on) — deliberately not analysisId, so a future "tap notification"
  // UI can link straight to it.
  await insertNotification(supabase, {
    memberId: input.memberId,
    type: 'assessment_report_published',
    title: 'Your coach reviewed your assessment',
    body: `Your ${input.assessmentTypeLabel} report is ready to view.`,
    sourceFeature: analysis.source_feature,
    sourceRecordId: analysis.source_record_id,
  });

  // Universal Registry / Health Profile cascade — updates the Universal
  // Registry, Wellness Insights, the MEF Intelligence Engine, the
  // Intelligence Core, and the persisted health profile. Best-effort,
  // never allowed to affect the publish result already committed above —
  // same discipline as every other AI-layer call in this codebase.
  try {
    await onAssessmentPublished(supabase, {
      memberId: input.memberId,
      assessmentId: analysis.source_record_id,
      analysisId: input.analysisId,
      asOfLocalDate: now.slice(0, 10),
    });
  } catch (err) {
    console.error('onAssessmentPublished failed for publishAiAnalysisReportAction', err);
  }

  return {};
}

export async function addReportExerciseAction(input: {
  analysisId: string;
  memberId: string;
  name: string;
  description?: string | undefined;
  category?: string | undefined;
  sortOrder: number;
}): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const exercise = await insertReportExercise(
    supabase,
    {
      analysisId: input.analysisId,
      memberId: input.memberId,
      name: input.name,
      description: input.description ?? null,
      category: input.category ?? null,
      addedBy: user.id,
    },
    input.sortOrder
  );
  if (!exercise) return { error: 'Could not add exercise.' };
  return {};
}

export async function removeReportExerciseAction(exerciseId: string): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const ok = await deleteReportExercise(supabase, exerciseId);
  if (!ok) return { error: 'Could not remove exercise.' };
  return {};
}
