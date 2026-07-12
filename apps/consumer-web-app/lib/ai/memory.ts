/**
 * AI Memory — "avoid repeating the same coaching recommendations
 * unnecessarily," and the feedback loop (member responses, coach
 * overrides) a future UI will write into once one exists to write from.
 *
 * Two distinct concerns, deliberately not conflated:
 *  - wasRecentlyActioned() checks ai_actions directly — it already has
 *    member_id/agent_key/action_type/created_at, so this is the simplest
 *    correct dedup check; the dispatcher calls it before creating a new
 *    action of the same type for the same member within a cooldown.
 *  - recordHistoryEntry() writes to ai_history — the record of what
 *    happened to an action AFTER it was created (acknowledged, dismissed,
 *    overridden). Nothing calls this yet, because there is no UI a member
 *    or coach can respond through — the table staying empty right now is
 *    the honest state, not a gap. It's here, typed, and tested so the
 *    first future feature that needs it doesn't have to design it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AgentKey,
  AiActionType,
  AiHistoryMemoryType,
  AiActorType,
} from '@mef/shared-types-contracts';

/** True if this exact agent+action_type combination was already created for this member within the cooldown window — the dispatcher skips creating a duplicate when this is true. */
export async function wasRecentlyActioned(
  supabase: SupabaseClient,
  memberId: string,
  agentKey: AgentKey,
  actionType: AiActionType,
  withinHours: number
): Promise<boolean> {
  const sinceIso = new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('ai_actions')
    .select('id')
    .eq('member_id', memberId)
    .eq('agent_key', agentKey)
    .eq('action_type', actionType)
    .gte('created_at', sinceIso)
    .limit(1);

  if (error) {
    // Fail closed toward "don't know, so don't skip it" would risk spamming
    // the member; fail toward "assume it was already sent" instead — a
    // missed one-off insight is a far smaller problem than a duplicate one.
    console.error('wasRecentlyActioned check failed', error);
    return true;
  }

  return (data?.length ?? 0) > 0;
}

export type HistoryEntryInput = {
  memberId: string;
  agentKey: AgentKey;
  sourceActionId?: string;
  memoryType: AiHistoryMemoryType;
  actorType: AiActorType;
  actorId?: string;
  summary: string;
  metadata?: Record<string, unknown>;
};

export async function recordHistoryEntry(
  supabase: SupabaseClient,
  entry: HistoryEntryInput
): Promise<void> {
  const { error } = await supabase.from('ai_history').insert({
    member_id: entry.memberId,
    agent_key: entry.agentKey,
    source_action_id: entry.sourceActionId ?? null,
    memory_type: entry.memoryType,
    actor_type: entry.actorType,
    actor_id: entry.actorId ?? null,
    summary: entry.summary,
    metadata: entry.metadata ?? {},
  });

  if (error) {
    console.error('recordHistoryEntry failed', error);
  }
}
