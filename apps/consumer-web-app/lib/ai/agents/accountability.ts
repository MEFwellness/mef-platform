/**
 * Accountability Agent — streaks, missed check-ins, habit consistency,
 * long-term follow-through. "Schedule reminders" (a future scheduled
 * check for members who go quiet without ever taking an action to
 * trigger an event) needs a background job this milestone doesn't build
 * — see lib/ai/README.md. What CAN run synchronously today — the missed-
 * checkins rule and a real check-in-streak milestone check — is real.
 */

import type { DailyCheckin } from '@mef/shared-types-contracts';
import {
  ruleMatchesToOutput,
  mergeAgentOutputs,
  type AgentContext,
  type AgentOutput,
} from './types';
import type { AiAgentDefinition } from './types';
import { recordTimelineEvent } from '../../timeline/data';

const STREAK_MILESTONES = [7, 14, 30, 60, 90, 180, 365];

/** Consecutive most-recent days (ending at the latest check-in) with no calendar-day gap — a real count from real local_date values, not an estimate. Exported for lib/narrative/service.ts to reuse the exact same streak calculation for its own recent_wins narrative item, rather than a second, possibly-diverging count. */
export function currentStreakLength(checkinsOldestFirst: DailyCheckin[]): number {
  if (checkinsOldestFirst.length === 0) return 0;

  let streak = 1;
  for (let i = checkinsOldestFirst.length - 1; i > 0; i--) {
    const current = new Date(checkinsOldestFirst[i]!.local_date);
    const previous = new Date(checkinsOldestFirst[i - 1]!.local_date);
    const dayDiff = Math.round((current.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24));
    if (dayDiff !== 1) break;
    streak += 1;
  }
  return streak;
}

async function streakMilestoneFromCheckin(context: AgentContext): Promise<AgentOutput> {
  const payload = context.event.payload as { recentCheckins?: DailyCheckin[] };
  const checkins = payload.recentCheckins ?? [];
  const streak = currentStreakLength(checkins);

  if (!STREAK_MILESTONES.includes(streak)) {
    return [];
  }

  const supportingData = { streak };

  // Coach Timeline (section 3): "30-day streak" is one of the milestone's
  // own worked examples — best-effort, never blocks the insight/action
  // above from being produced if this write fails.
  const latestCheckin = checkins[checkins.length - 1];
  if (latestCheckin) {
    await recordTimelineEvent(context.supabase, {
      memberId: context.memberId,
      eventType: 'streak_milestone',
      localDate: latestCheckin.local_date,
      title: `${streak}-day check-in streak`,
      detail: `${streak} consecutive days of check-ins.`,
      sourceFeature: 'accountability',
    });
  }

  return [
    {
      insight: {
        insightType: 'streak_milestone',
        title: `${streak}-day check-in streak`,
        description: `${streak} consecutive days of check-ins.`,
        supportingData,
        confidence: 1,
      },
      action: {
        actionType: 'progress_milestone',
        reason: `Reached a ${streak}-day consecutive check-in streak.`,
        supportingData,
        confidence: 1,
        requiresCoachApproval: false,
      },
    },
  ];
}

export const accountabilityAgent: AiAgentDefinition = {
  key: 'accountability',
  respondsTo: [
    'member_completed_checkin',
    'member_missed_checkin',
    'coach_added_notes',
    'coach_completed_session',
    'member_inactive',
    'habit_streak_achieved',
  ],
  async handle(context: AgentContext): Promise<AgentOutput> {
    const outputs = [ruleMatchesToOutput(context.ruleMatches)];

    if (context.event.event_type === 'member_completed_checkin') {
      outputs.push(await streakMilestoneFromCheckin(context));
    }

    return mergeAgentOutputs(outputs);
  },
};
