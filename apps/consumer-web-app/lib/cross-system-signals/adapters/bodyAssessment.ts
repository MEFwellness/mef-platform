/**
 * The camera posture and movement assessment, as signals.
 *
 * ONE SIGNAL PER ACTIVE FINDING. Forward head, lower cross, uneven hips
 * and the rest arrive already standardized, already sided and already
 * graded by the screening engine, so this adapter is the thinnest of the
 * five: it maps a finding type through the dictionary and carries the
 * severity across as the value.
 *
 * WHAT IS LEFT OUT, AND WHY EACH ONE.
 *
 *   a DISMISSED or SUPERSEDED finding, because a coach dismissing
 *     something is the coach saying it is not there.
 *   a finding whose severity is 'none', because a screening pass reporting
 *     that it looked and saw nothing is not something the member reported.
 *   a finding whose severity is 'unknown', for the same reason: a row
 *     saying "we could not tell" would print as a value on her timeline.
 *   a 'custom' finding type, because a coach defined observation has no
 *     standardized name by definition and the dictionary deliberately
 *     holds no row for one (migration 241).
 *
 * THE SIDE CROSSES OVER. The findings table says 'bilateral' where this
 * library says 'both', and that is the only translation in this file.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BodyAssessmentFinding, FindingSide } from '@mef/shared-types-contracts';
import { listAssessments, listFindings } from '@/lib/body-assessment/data';
import { SOURCE_BODY_ASSESSMENT } from '../constants';
import { resolveMapped, sourceLabel } from '../library';
import { fingerprint, type BuildContext, type IngestibleSitting, type SignalAdapter } from '../registry';
import type { SignalDraft, SignalSide } from '../types';

export type BodyAssessmentAdapterInput = {
  assessmentId: string;
  /** The assessment's own type label, so the coach sees which capture this came from. */
  assessmentTypeLabel: string;
  completedAt: string;
  findings: readonly BodyAssessmentFinding[];
};

/** The findings table's own word for a two sided finding is 'bilateral'. This library's is 'both'. */
export function sideFromFinding(side: FindingSide): SignalSide {
  if (side === 'left' || side === 'right') return side;
  if (side === 'bilateral') return 'both';
  return 'not_applicable';
}

const SEVERITY_LABELS: Record<string, string> = {
  mild: 'Mild',
  moderate: 'Moderate',
  significant: 'Significant',
};

/** Mild, moderate, significant. A whole number so a later pass has a ladder to compare on. */
const SEVERITY_NUMERIC: Record<string, number> = {
  mild: 1,
  moderate: 2,
  significant: 3,
};

export function buildBodyAssessmentSignals(
  input: BodyAssessmentAdapterInput,
  context: BuildContext
): SignalDraft[] {
  const { library, capturedOn } = context;
  const label = sourceLabel(library, SOURCE_BODY_ASSESSMENT);
  const drafts: SignalDraft[] = [];

  for (const finding of input.findings) {
    if (finding.status === 'dismissed' || finding.status === 'superseded') continue;
    const severityLabel = SEVERITY_LABELS[finding.severity];
    if (!severityLabel) continue;

    const resolved = resolveMapped(
      library,
      SOURCE_BODY_ASSESSMENT,
      'finding_type',
      finding.finding_type
    );
    if (!resolved) continue;

    const side = sideFromFinding(finding.side);
    drafts.push({
      ...resolved,
      side,
      valueKind: 'severity',
      valueLabel: severityLabel,
      valueKey: finding.severity,
      valueNumeric: SEVERITY_NUMERIC[finding.severity] ?? null,
      sourceKey: SOURCE_BODY_ASSESSMENT,
      sourceLabel: label,
      sourceSessionId: input.assessmentId,
      sourceQuestionRef: finding.finding_type,
      // The screening engine's own plain language line where it wrote one,
      // so the coach reads what was actually observed rather than a label.
      sourceQuestionPrompt: finding.narrative ?? input.assessmentTypeLabel,
      sourceRecordId: finding.id,
      capturedOn,
      capturedAt: input.completedAt,
      note: null,
      // The FINDING id, not the finding type: one assessment can hold a
      // left and a right row for one type, and a fingerprint on the type
      // alone would silently drop the second.
      ingestFingerprint: fingerprint(SOURCE_BODY_ASSESSMENT, input.assessmentId, `finding:${finding.id}`),
    });
  }

  return drafts;
}

/** Submitted, analyzed or reviewed. An in progress capture has nothing to read yet. */
const INGESTIBLE_STATUSES = new Set(['submitted', 'analyzing', 'analyzed', 'coach_reviewed', 'not_configured']);

export const bodyAssessmentAdapter: SignalAdapter<BodyAssessmentAdapterInput> = {
  sourceKey: SOURCE_BODY_ASSESSMENT,
  description: 'Camera posture and movement assessment findings',

  async listCompleted(supabase: SupabaseClient, memberId: string): Promise<IngestibleSitting[]> {
    const assessments = await listAssessments(supabase, memberId, { limit: 50 });
    return assessments
      .filter((assessment) => INGESTIBLE_STATUSES.has(assessment.status))
      .map((assessment) => ({
        id: assessment.id,
        completedAt: assessment.completed_at ?? assessment.submitted_at ?? assessment.started_at,
      }));
  },

  async load(supabase, memberId, sittingId) {
    const assessments = await listAssessments(supabase, memberId, { limit: 50 });
    const assessment = assessments.find((candidate) => candidate.id === sittingId);
    if (!assessment || !INGESTIBLE_STATUSES.has(assessment.status)) return null;
    const findings = await listFindings(supabase, sittingId, { activeOnly: true });
    return {
      assessmentId: assessment.id,
      assessmentTypeLabel: assessment.assessment_type,
      completedAt: assessment.completed_at ?? assessment.submitted_at ?? assessment.started_at,
      findings,
    };
  },

  build: buildBodyAssessmentSignals,
};
