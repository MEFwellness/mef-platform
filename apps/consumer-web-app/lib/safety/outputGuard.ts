/**
 * Defense-in-depth gate for AI-agent-generated coaching output — called
 * from lib/ai/dispatcher.ts's persistOutputItem, the single choke point
 * every one of the 5 agents' insight/recommendation/action items already
 * passes through before being persisted. This is the "every relevant
 * coaching output should be evaluated before member delivery" integration
 * point the milestone requires.
 *
 * Today's 5 agents only ever produce static, pre-reviewed template copy
 * (see lib/ai/agents/*.ts), so in practice this almost always resolves to
 * STANDARD_COACHING — that's expected, not a sign the wiring is inert.
 * The guard exists so that the moment agent copy becomes more dynamic (or
 * a future LLM-backed agent is added), unsafe generated text is caught
 * here instead of reaching a member. Fast-pathed: the (free, pure,
 * synchronous) classifier runs on every item, but a DB write only happens
 * on the rare non-standard result, so this adds no per-event query volume
 * in the common case.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentKey, AiEvent } from '@mef/shared-types-contracts';
import type { AgentOutputItem } from '../ai/agents/types';
import { classifyConcern } from './classifier';
import { evaluateConcern } from './service';

function outputItemText(item: AgentOutputItem): string {
  return [item.insight?.description, item.recommendation?.description, item.action?.reason]
    .filter(Boolean)
    .join(' ');
}

export type GuardedOutputItem = {
  item: AgentOutputItem | null;
  wasRestricted: boolean;
};

/**
 * Returns the item unchanged (the common case), the item with its action
 * forced to require coach approval (a restricted-but-not-blocked
 * classification), or null (blocked entirely — only for the rare
 * SAFETY_RESPONSE_ONLY case, which today's static agent copy should never
 * actually produce).
 */
export async function guardAgentOutputItem(
  supabase: SupabaseClient,
  memberId: string,
  agentKey: AgentKey,
  event: AiEvent,
  item: AgentOutputItem
): Promise<GuardedOutputItem> {
  const text = outputItemText(item);
  if (!text) return { item, wasRestricted: false };

  const quickCheck = classifyConcern({ text });
  if (quickCheck.classificationLevel === 'standard_coaching') {
    return { item, wasRestricted: false };
  }

  // Non-standard result: persist the full audit trail (classification,
  // message, review queue if warranted) via the same service every other
  // safety-evaluated surface uses.
  const evaluation = await evaluateConcern(supabase, {
    memberId,
    sourceFeature: 'ai_recommendation',
    sourceRecordType: agentKey,
    sourceEventId: event.id,
    text,
    actorType: 'system',
  });

  if (!evaluation || !evaluation.result.coachingAllowed) {
    return { item: null, wasRestricted: true };
  }

  const guardedItem: AgentOutputItem = item.action
    ? { ...item, action: { ...item.action, requiresCoachApproval: true } }
    : item;
  return { item: guardedItem, wasRestricted: true };
}
