/**
 * Member Engagement Agent — daily encouragement, celebrating milestones,
 * recognizing consistency. Positive-reinforcement only; missed-check-in
 * and habit-tracking logic belongs to the Accountability Agent, not here.
 */

import {
  ruleMatchesToOutput,
  mergeAgentOutputs,
  type AgentContext,
  type AgentOutput,
} from './types';
import type { AiAgentDefinition } from './types';

const MEANINGFUL_IMPROVEMENT = 10; // points on the Daily Wellness Index's 0-100 scale

/** A same-day-to-next-day jump this large is a real, worth-noticing improvement — not every small fluctuation warrants an encouragement message (avoids noise). */
async function encouragementFromCheckin(context: AgentContext): Promise<AgentOutput> {
  const { wellnessIndexDelta, wellnessIndexScore } = context.facts;
  if (wellnessIndexDelta === null || wellnessIndexDelta < MEANINGFUL_IMPROVEMENT) {
    return [];
  }

  const supportingData = { wellnessIndexDelta, wellnessIndexScore };
  const description = `Daily Wellness Index rose ${wellnessIndexDelta} points to ${wellnessIndexScore} since the previous check-in.`;

  return [
    {
      insight: {
        insightType: 'wellness_index_improved',
        title: 'Daily Wellness Index improved',
        description,
        supportingData,
        confidence: 0.7,
      },
      action: {
        actionType: 'member_encouragement',
        reason: description,
        supportingData,
        confidence: 0.7,
        requiresCoachApproval: false,
      },
    },
  ];
}

export const memberEngagementAgent: AiAgentDefinition = {
  key: 'member_engagement',
  respondsTo: [
    'member_completed_checkin',
    'member_missed_checkin',
    'pain_decreased',
    'stress_decreased',
    'movement_improved',
    'member_inactive',
    'habit_streak_achieved',
  ],
  async handle(context: AgentContext): Promise<AgentOutput> {
    const outputs = [ruleMatchesToOutput(context.ruleMatches)];

    if (context.event.event_type === 'member_completed_checkin') {
      outputs.push(await encouragementFromCheckin(context));
    }

    return mergeAgentOutputs(outputs);
  },
};
