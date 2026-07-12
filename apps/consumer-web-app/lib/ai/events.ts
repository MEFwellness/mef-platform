/**
 * The only entry point the rest of the app should use to make the AI
 * layer aware that something happened. Existing server actions
 * (submitDailyCheckin, submitOnboarding, addCoachNote) call
 * emitAndDispatch() with a small, explicit payload — this file owns
 * writing the durable ai_events row and (for now, synchronously) running
 * it through the dispatcher.
 *
 * Every call is wrapped so a failure here can never break the calling
 * action: a member's check-in must always succeed even if the AI system
 * is down, mid-migration, or simply errors on bad input.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiEvent, AiEventSource, AiEventType } from '@mef/shared-types-contracts';
import type { RuleFacts } from './rules/facts';
import { dispatchEvent } from './dispatcher';

export type EmitAiEventInput = {
  eventType: AiEventType;
  memberId: string;
  source: AiEventSource;
  payload?: Record<string, unknown>;
};

export async function emitAiEvent(
  supabase: SupabaseClient,
  input: EmitAiEventInput
): Promise<AiEvent | null> {
  const { data, error } = await supabase
    .from('ai_events')
    .insert({
      event_type: input.eventType,
      member_id: input.memberId,
      source: input.source,
      payload: input.payload ?? {},
    })
    .select('*')
    .single();

  if (error) {
    console.error('emitAiEvent failed', error);
    return null;
  }
  return data as AiEvent;
}

/**
 * Emits the event, then immediately dispatches it. `facts` is supplied by
 * the caller rather than computed here — the caller (e.g.
 * submitDailyCheckin) already has the check-in history loaded in whatever
 * shape is contextually correct (see lib/ai/rules/facts.ts's asOfLocalDate
 * doc comment), so recomputing it here would mean a redundant query with
 * a real risk of subtly different semantics.
 *
 * Never throws — every failure is caught, logged, and swallowed. Calling
 * code should not (and does not need to) await this for its result; it's
 * only awaited so the dispatch reliably completes before the request
 * ends, not because its outcome matters to the caller.
 */
export async function emitAndDispatch(
  supabase: SupabaseClient,
  input: EmitAiEventInput,
  facts: RuleFacts
): Promise<void> {
  try {
    const event = await emitAiEvent(supabase, input);
    if (!event) return;
    await dispatchEvent(supabase, event, facts);
  } catch (err) {
    console.error('emitAndDispatch failed', err instanceof Error ? err.message : err);
  }
}
