/**
 * Coach Assistant Agent — prepares client summaries and surfaces coaching
 * insights for a human coach. Assists judgment, never replaces it: every
 * output here is informational (coach_notification), never an action a
 * coach is asked to blindly approve or that acts on their behalf.
 */

import {
  ruleMatchesToOutput,
  mergeAgentOutputs,
  type AgentContext,
  type AgentOutput,
} from './types';
import type { AiAgentDefinition } from './types';

const NOTABLE_WELLNESS_INDEX_DELTA = 15;

/** Only worth a coach's attention when the change is large enough to actually matter — small day-to-day noise isn't "highlight important changes." */
async function notifyOnSignificantChange(context: AgentContext): Promise<AgentOutput> {
  const { wellnessIndexDelta, wellnessIndexScore } = context.facts;
  if (wellnessIndexDelta === null || Math.abs(wellnessIndexDelta) < NOTABLE_WELLNESS_INDEX_DELTA) {
    return [];
  }

  const direction = wellnessIndexDelta > 0 ? 'improved' : 'declined';
  const supportingData = { wellnessIndexDelta, wellnessIndexScore };
  const description = `Daily Wellness Index ${direction} by ${Math.abs(wellnessIndexDelta)} points to ${wellnessIndexScore}.`;

  return [
    {
      insight: {
        insightType: 'significant_wellness_change',
        title: `Wellness Index ${direction}`,
        description,
        supportingData,
        confidence: 0.7,
      },
      action: {
        actionType: 'coach_notification',
        reason: description,
        supportingData,
        confidence: 0.7,
        requiresCoachApproval: false,
      },
    },
  ];
}

export const coachAssistantAgent: AiAgentDefinition = {
  key: 'coach_assistant',
  respondsTo: [
    'reassessment_completed',
    'pain_increased',
    'stress_increased',
    'sleep_declined',
    'digestion_worsened',
    'coach_added_notes',
    'coach_completed_session',
    'wellness_index_changed_significantly',
  ],
  async handle(context: AgentContext): Promise<AgentOutput> {
    const outputs = [ruleMatchesToOutput(context.ruleMatches)];

    if (
      context.event.event_type === 'member_completed_checkin' ||
      context.event.event_type === 'wellness_index_changed_significantly'
    ) {
      outputs.push(await notifyOnSignificantChange(context));
    }

    return mergeAgentOutputs(outputs);
  },
};
