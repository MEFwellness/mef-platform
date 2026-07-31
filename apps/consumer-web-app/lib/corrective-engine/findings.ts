/**
 * Reads a member's latest completed posture assessment and its active
 * findings — the real input to detectCorrectivePatterns (patternMapping.ts).
 * "Completed" = body_assessments.status 'analyzed' or 'coach_reviewed'
 * (the two statuses set only after findings have actually been written —
 * see app/actions/body-assessment.ts's performAnalysis/
 * recordPostureFindingsAction, both of which set status: 'analyzed' only
 * once findings exist).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BodyAssessmentFinding } from '@mef/shared-types-contracts';

export interface LatestPostureAssessment {
  assessmentId: string;
  completedAt: string | null;
  findings: BodyAssessmentFinding[];
}

const COMPLETED_STATUSES = ['analyzed', 'coach_reviewed'];

export async function getLatestCompletedPostureAssessment(
  supabase: SupabaseClient,
  memberId: string
): Promise<LatestPostureAssessment | null> {
  const { data: assessment, error: assessmentError } = await supabase
    .from('body_assessments')
    .select('id, completed_at')
    .eq('member_id', memberId)
    .eq('assessment_type', 'static_posture')
    .in('status', COMPLETED_STATUSES)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (assessmentError) {
    throw new Error(`getLatestCompletedPostureAssessment (assessment) failed: ${assessmentError.message}`);
  }
  if (!assessment) return null;

  const { data: findings, error: findingsError } = await supabase
    .from('body_assessment_findings')
    .select('*')
    .eq('assessment_id', assessment.id);

  if (findingsError) {
    throw new Error(`getLatestCompletedPostureAssessment (findings) failed: ${findingsError.message}`);
  }

  return {
    assessmentId: assessment.id,
    completedAt: assessment.completed_at,
    findings: (findings ?? []) as BodyAssessmentFinding[],
  };
}
