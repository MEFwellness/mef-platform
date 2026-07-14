/**
 * The event dispatcher — the one place that turns "an event happened"
 * into persisted insights/recommendations/actions. Runs synchronously,
 * inline, right after an event is emitted (lib/ai/events.ts) because no
 * background worker exists in this stack yet; ai_events.processed_at
 * still gets set at the end, so a future async worker can poll
 * `where processed_at is null` and this function's logic barely changes
 * — only who calls it does.
 *
 * Every DB write in here goes through the same SupabaseClient the
 * triggering server action already has (the calling user's own session)
 * — RLS on the AI tables (migration 27) is what actually authorizes each
 * write, exactly like every other write path in this app.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiEvent } from '@mef/shared-types-contracts';
import type { RuleFacts } from './rules/facts';
import { evaluateRules } from './rules/engine';
import { agentsRespondingTo } from './agents/registry';
import {
  getActiveRules,
  getEnabledAgents,
  insertAction,
  insertInsight,
  insertLog,
  insertRecommendation,
} from './data';
import { wasRecentlyActioned, recordHistoryEntry } from './memory';
import type { AgentOutputItem } from './agents/types';
import { guardAgentOutputItem } from '../safety/outputGuard';
import { insertNotification } from '../notifications/data';
import { updateNarrativeForEvent } from '../narrative/service';
import { recalculateIntelligenceCore } from '../intelligence-core/service';

/** How long to wait before this exact agent+action_type combination can fire again for the same member — keeps a chatty check-in streak from generating the same insight every single day. */
const ACTION_COOLDOWN_HOURS: Record<string, number> = {
  todays_priority: 20,
  member_encouragement: 20,
  educational_recommendation: 24 * 3,
  coach_notification: 12,
  progress_milestone: 24, // streak milestones are naturally spaced by the streak itself, but this guards against re-dispatch of the same event
  reminder_recommendation: 24,
  risk_alert: 24,
  follow_up_recommendation: 24 * 3,
};
const DEFAULT_COOLDOWN_HOURS = 20;

/**
 * Not every event's payload carries an explicit local_date (only the
 * check-in flow's does, via payload.checkin) — the same "fall back to
 * today's UTC date" convention app/actions/coach.ts already uses for its
 * own rule-facts computation when no check-in-derived date exists.
 * Recalculation only needs an approximate anchor date for window
 * boundaries; the exact member-local calendar day is re-resolved
 * precisely wherever a human actually looks at the result (coach
 * dashboard, member surfaces), same "recomputation is cheap" posture as
 * the rest of this layer.
 */
function resolveAsOfLocalDate(event: AiEvent): string {
  const payload = event.payload as { checkin?: { local_date?: string } } | null;
  return payload?.checkin?.local_date ?? new Date().toISOString().slice(0, 10);
}

async function persistOutputItem(
  supabase: SupabaseClient,
  memberId: string,
  agentKey: import('@mef/shared-types-contracts').AgentKey,
  sourceEventId: string,
  item: AgentOutputItem
): Promise<void> {
  if (item.action) {
    const cooldown = ACTION_COOLDOWN_HOURS[item.action.actionType] ?? DEFAULT_COOLDOWN_HOURS;
    const alreadyRecent = await wasRecentlyActioned(
      supabase,
      memberId,
      agentKey,
      item.action.actionType,
      cooldown
    );
    if (alreadyRecent) {
      await insertLog(
        supabase,
        'debug',
        `Skipped duplicate ${item.action.actionType} — already generated within the last ${cooldown}h.`,
        { actionType: item.action.actionType },
        { agentKey, memberId, sourceEventId }
      );
      return;
    }
  }

  let insightId: string | null = null;
  if (item.insight) {
    insightId = await insertInsight(supabase, memberId, agentKey, sourceEventId, item.insight);
  }

  let recommendationId: string | null = null;
  if (item.recommendation) {
    recommendationId = await insertRecommendation(
      supabase,
      memberId,
      agentKey,
      insightId,
      item.recommendation
    );
  }

  if (item.action) {
    const actionId = await insertAction(
      supabase,
      memberId,
      agentKey,
      recommendationId,
      item.action
    );
    if (actionId) {
      await recordHistoryEntry(supabase, {
        memberId,
        agentKey,
        sourceActionId: actionId,
        memoryType: 'recommendation_given',
        actorType: 'system',
        summary: item.action.reason,
        metadata: { actionType: item.action.actionType },
      });
    }
  }

  if (item.notification) {
    await insertNotification(supabase, {
      memberId,
      type: item.notification.notificationType,
      title: item.notification.title,
      body: item.notification.body ?? null,
      sourceFeature: agentKey,
      sourceRecordId: sourceEventId,
    });
  }
}

export async function dispatchEvent(
  supabase: SupabaseClient,
  event: AiEvent,
  facts: RuleFacts
): Promise<void> {
  try {
    const [enabledAgents, activeRules] = await Promise.all([
      getEnabledAgents(supabase),
      getActiveRules(supabase),
    ]);

    const enabledKeys = new Set(enabledAgents.map((a) => a.agent_key));
    const respondingAgents = agentsRespondingTo(event.event_type).filter((agent) =>
      enabledKeys.has(agent.key)
    );

    if (respondingAgents.length === 0) {
      await insertLog(
        supabase,
        'debug',
        `No enabled agent responds to ${event.event_type}.`,
        {},
        { memberId: event.member_id, sourceEventId: event.id }
      );
      return;
    }

    for (const agent of respondingAgents) {
      const agentRules = activeRules.filter((rule) => rule.agent_key === agent.key);
      const ruleMatches = evaluateRules(agentRules, event.event_type, facts);

      const output = await agent.handle({
        supabase,
        memberId: event.member_id,
        event,
        facts,
        ruleMatches,
      });

      for (const item of output) {
        // Milestone 1 safety layer: every agent-generated item passes
        // through the guard before it can be persisted. See
        // lib/safety/outputGuard.ts — fast-pathed, so this is a no-op cost
        // in the common (STANDARD_COACHING) case.
        const { item: guardedItem } = await guardAgentOutputItem(
          supabase,
          event.member_id,
          agent.key,
          event,
          item
        );
        if (guardedItem) {
          await persistOutputItem(supabase, event.member_id, agent.key, event.id, guardedItem);
        }
      }

      if (output.length > 0) {
        await insertLog(
          supabase,
          'info',
          `${agent.key} produced ${output.length} item(s) for ${event.event_type}.`,
          { itemCount: output.length, ruleMatchCount: ruleMatches.length },
          { agentKey: agent.key, memberId: event.member_id, sourceEventId: event.id }
        );
      }
    }

    // Milestone 2: update the member's longitudinal narrative from this
    // same event/facts, after agents have had their turn. See
    // lib/narrative/service.ts — reuses this event, never a second
    // parallel pipeline.
    await updateNarrativeForEvent(supabase, event, facts);

    // Milestone 9: recalculate the Wellness Intelligence Core from this
    // same event — every check-in, assessment, and coach note (every
    // event type this dispatcher handles) keeps the member's identity
    // observations/profile dimensions/coaching style current. See
    // lib/intelligence-core/service.ts; never throws, mirrors
    // updateNarrativeForEvent's own best-effort discipline.
    await recalculateIntelligenceCore(supabase, event.member_id, resolveAsOfLocalDate(event));

    await supabase
      .from('ai_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('id', event.id);
  } catch (err) {
    // A dispatch failure must never propagate to the caller — the
    // triggering server action (a check-in, an onboarding submission)
    // has already succeeded and must not be rolled back or surfaced as
    // an error to the member because the AI layer hiccuped.
    const message = err instanceof Error ? err.message : String(err);
    console.error('dispatchEvent failed', message);
    await insertLog(
      supabase,
      'error',
      `dispatchEvent failed: ${message}`,
      {},
      { memberId: event.member_id, sourceEventId: event.id }
    );
  }
}
