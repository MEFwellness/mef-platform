/**
 * Deterministic bookkeeping agent for the AI Body Assessment Framework —
 * responds to 'body_assessment_completed'. Like accountability.ts and
 * wellness-analysis.ts, this never interprets what a finding means (that's
 * a future dedicated posture/movement analysis provider's job — see
 * lib/body-assessment/providers/); it only turns an already-computed
 * findingsCount into a member-facing acknowledgement and a coach
 * notification, so the existing insight -> recommendation -> action chain
 * and coach-notification pathway work end to end for this event type with
 * zero dispatcher changes.
 */

import type { AiAgentDefinition, AgentOutput } from './types';

type BodyAssessmentEventPayload = {
  assessmentId?: string;
  assessmentTypeLabel?: string;
  findingsCount?: number;
  significantFindingsCount?: number;
};

export const bodyAssessmentAgent: AiAgentDefinition = {
  key: 'body_assessment',
  respondsTo: ['body_assessment_completed'],
  async handle(context): Promise<AgentOutput> {
    const payload = context.event.payload as BodyAssessmentEventPayload;
    const findingsCount = payload.findingsCount ?? 0;

    // No provider has produced findings for this assessment yet (the
    // expected state for this milestone) — nothing to tell the member or
    // coach about beyond what the narrative service already records.
    if (findingsCount <= 0) return [];

    const assessmentLabel = payload.assessmentTypeLabel ?? 'body';
    const supportingData = {
      assessmentId: payload.assessmentId,
      assessmentTypeLabel: assessmentLabel,
      findingsCount,
    };
    const confidence = 0.7;
    const significant = (payload.significantFindingsCount ?? 0) > 0;

    return [
      {
        insight: {
          insightType: 'body_assessment_findings_ready',
          title: 'New body assessment findings',
          description: `Your recent ${assessmentLabel} assessment produced ${findingsCount} finding${findingsCount === 1 ? '' : 's'} for your coach to review.`,
          supportingData,
          confidence,
        },
        recommendation: {
          recommendationType: 'body_assessment_findings_ready',
          title: 'Review your assessment findings with your coach',
          description: 'Your coach will review these findings and follow up with guidance.',
          supportingData,
          confidence,
          priority: significant ? 'high' : 'medium',
        },
        action: {
          actionType: 'coach_notification',
          reason: `${findingsCount} new body assessment finding(s) ready for review.`,
          supportingData,
          confidence,
          requiresCoachApproval: false,
        },
      },
    ];
  },
};
