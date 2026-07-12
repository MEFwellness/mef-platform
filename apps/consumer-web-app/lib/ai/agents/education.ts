/**
 * Education Agent — matches educational content to a member's weakest
 * real wellness area. Reuses the exact same "priority" metric
 * calculateWellnessIndex already derives from real check-in data (the
 * same metric the member's own dashboard names as "Today's Priority") so
 * this agent's recommendation is always about the same real weak area,
 * never a second, independently-guessed one.
 *
 * No actual content is recommended — supabase/migrations/…_ai_infrastructure.sql's
 * ai_prompt_templates table is intentionally empty this milestone ("do not
 * populate prompt templates yet"), so this only names the target area and
 * explains why, honestly, without inventing an article/video that doesn't
 * exist yet.
 */

import {
  calculateWellnessIndex,
  inputsFromCheckin,
  WELLNESS_METRIC_LABEL,
} from '../../wellness/wellness-index';
import {
  ruleMatchesToOutput,
  mergeAgentOutputs,
  type AgentContext,
  type AgentOutput,
} from './types';
import type { AiAgentDefinition } from './types';
import type { DailyCheckin } from '@mef/shared-types-contracts';

async function matchEducationToWeakestArea(context: AgentContext): Promise<AgentOutput> {
  const payload = context.event.payload as { checkin?: DailyCheckin };
  const checkin = payload.checkin;
  if (!checkin) return [];

  const index = calculateWellnessIndex(inputsFromCheckin(checkin));
  if (!index || !index.priority || index.priority.status === 'good') {
    return [];
  }

  const label = WELLNESS_METRIC_LABEL[index.priority.key];
  const supportingData = { matchedMetric: index.priority.key, matchedScore: index.priority.score };
  const description = `${label} is the current lowest-scoring area (${index.priority.score}/100) — educational content on ${label.toLowerCase()} would be most relevant right now.`;

  return [
    {
      insight: {
        insightType: 'education_match',
        title: `${label} matched for education`,
        description,
        supportingData,
        confidence: 0.6,
      },
      recommendation: {
        recommendationType: 'educational_match',
        title: `${label} matched for education`,
        description,
        supportingData,
        confidence: 0.6,
        priority: 'low',
      },
      action: {
        actionType: 'educational_recommendation',
        reason: description,
        supportingData,
        confidence: 0.6,
        requiresCoachApproval: false,
      },
    },
  ];
}

export const educationAgent: AiAgentDefinition = {
  key: 'education',
  respondsTo: ['member_completed_checkin', 'reassessment_completed'],
  async handle(context: AgentContext): Promise<AgentOutput> {
    const outputs = [ruleMatchesToOutput(context.ruleMatches)];

    if (context.event.event_type === 'member_completed_checkin') {
      outputs.push(await matchEducationToWeakestArea(context));
    }

    return mergeAgentOutputs(outputs);
  },
};
