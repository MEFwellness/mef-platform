/**
 * Proactive AI Coach — the agent behind Part 3/6 of the Wearables +
 * Proactive AI Coach milestone. Never analyzes anything itself: every
 * event this agent responds to already carries a real, already-detected
 * pattern in its payload (lib/wearables/detectProactiveEvents.ts ran the
 * actual trend/threshold detection before the event was ever emitted —
 * see app/actions/wearables.ts and app/api/cron/wearable-daily/route.ts).
 * This agent's only job is turning that already-real pattern into one
 * calm, on-voice message (lib/ai/agents/proactiveCoachCopy.ts) delivered
 * three ways at once: an ai_insight (so it shows up anywhere insights are
 * reviewed), an ai_action (so the dispatcher's existing cooldown logic —
 * ACTION_COOLDOWN_HOURS — prevents the same nudge repeating every sync),
 * and a member-visible notification (so it actually lands in the Coach
 * Messages inbox, the one guaranteed-visible channel this codebase has).
 *
 * Every one of the 7 conditions below uses its own distinct AiActionType,
 * deliberately, even though only 3-4 distinct "kinds" of message exist
 * conceptually — the dispatcher's per-(agent, actionType) cooldown
 * (lib/ai/dispatcher.ts's ACTION_COOLDOWN_HOURS) is coarser than that, and
 * a single wearable sync can legitimately detect *several* of these
 * conditions on the same real day (a first connect that also happens to
 * show excellent recovery is the normal case, not an edge case — an
 * initial provider sync typically backfills a week of history in one
 * call). Two conditions sharing an actionType would silently suppress
 * whichever one the dispatcher processes second, which was caught by
 * tests/wearables-integration.test.ts's real end-to-end run before this
 * fix (recovery_excellent's notification never appeared because
 * wearable_synced's welcome message had just claimed the same
 * member_encouragement/agent-key cooldown slot moments earlier).
 */

import type { AiActionType, WearableProviderName } from '@mef/shared-types-contracts';
import type { AiAgentDefinition, AgentContext, AgentOutput, AgentOutputItem } from './types';
import {
  hrvDecliningMessage,
  sleepDecliningMessage,
  recoveryExcellentMessage,
  activityDeclinedMessage,
  stressRisingMessage,
  stressEasingMessage,
  wearableConnectedMessage,
  type ProactiveCoachMessage,
} from './proactiveCoachCopy';

function toOutputItem(
  message: ProactiveCoachMessage,
  insightType: string,
  actionType: AiActionType,
  supportingData: Record<string, unknown>
): AgentOutputItem {
  return {
    insight: {
      insightType,
      title: message.title,
      description: message.body,
      supportingData,
      confidence: 0.75,
    },
    action: {
      actionType,
      reason: message.body,
      supportingData,
      confidence: 0.75,
      requiresCoachApproval: false,
    },
    notification: {
      notificationType: 'proactive_coach_message',
      title: message.title,
      body: message.body,
    },
  };
}

export const proactiveCoachAgent: AiAgentDefinition = {
  key: 'proactive_coach',
  respondsTo: [
    'wearable_synced',
    'hrv_declining',
    'sleep_declined',
    'activity_declined',
    'stress_increased',
    'stress_decreased',
    'recovery_excellent',
  ],
  async handle(context: AgentContext): Promise<AgentOutput> {
    const payload = context.event.payload as {
      source?: string;
      provider?: WearableProviderName;
      isFirstSync?: boolean;
    };

    switch (context.event.event_type) {
      case 'wearable_synced': {
        if (!payload.isFirstSync || !payload.provider) return [];
        const message = wearableConnectedMessage(payload.provider);
        return [
          toOutputItem(message, 'wearable_connected', 'member_encouragement', {
            provider: payload.provider,
          }),
        ];
      }

      case 'hrv_declining':
        return [toOutputItem(hrvDecliningMessage(), 'hrv_declining', 'risk_alert', payload)];

      case 'sleep_declined':
        // The existing AiEventType is shared with any future check-in-based
        // emitter — only react here when this particular event was raised
        // from wearable data, so a non-wearable source doesn't get a
        // wearable-flavored message.
        if (payload.source !== 'wearable') return [];
        return [
          toOutputItem(
            sleepDecliningMessage(),
            'sleep_declining',
            'reminder_recommendation',
            payload
          ),
        ];

      case 'activity_declined':
        return [
          toOutputItem(activityDeclinedMessage(), 'activity_declined', 'todays_action', payload),
        ];

      case 'stress_increased':
        if (payload.source !== 'wearable') return [];
        return [
          toOutputItem(
            stressRisingMessage(),
            'stress_rising',
            'educational_recommendation',
            payload
          ),
        ];

      case 'stress_decreased':
        if (payload.source !== 'wearable') return [];
        return [
          toOutputItem(stressEasingMessage(), 'stress_easing', 'progress_milestone', payload),
        ];

      case 'recovery_excellent':
        return [
          toOutputItem(
            recoveryExcellentMessage(),
            'recovery_excellent',
            'follow_up_recommendation',
            payload
          ),
        ];

      default:
        return [];
    }
  },
};
