/**
 * Conversation Memory Layer (Prompt 13) — persistence over
 * member_coaching_messages (migration 96). The only I/O in this module;
 * everything else (selector, composer, templates) is pure. Mirrors
 * lib/longitudinal-intelligence/data.ts's own upsert/list discipline:
 * recompute is cheap, this is the durable record of what was actually said.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CoachingMessageRow, ConversationType } from './types';

function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return hash.toString(16);
}

type CoachingMessageDbRow = {
  id: string;
  member_id: string;
  topic_key: string;
  conversation_type: ConversationType;
  message_text: string;
  message_hash: string;
  source_state: string | null;
  shown_at: string;
  created_at: string;
};

function toRow(row: CoachingMessageDbRow): CoachingMessageRow {
  return {
    id: row.id,
    memberId: row.member_id,
    topicKey: row.topic_key,
    conversationType: row.conversation_type,
    messageText: row.message_text,
    messageHash: row.message_hash,
    sourceState: row.source_state,
    shownAt: row.shown_at,
    createdAt: row.created_at,
  };
}

/** Most recent first — the selector's own de-dup/rotation window. */
export async function listRecentCoachingMessages(
  supabase: SupabaseClient,
  memberId: string,
  sinceDays = 60
): Promise<CoachingMessageRow[]> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('member_coaching_messages')
    .select('id, member_id, topic_key, conversation_type, message_text, message_hash, source_state, shown_at, created_at')
    .eq('member_id', memberId)
    .gte('shown_at', since)
    .order('shown_at', { ascending: false });

  if (error) {
    console.error('listRecentCoachingMessages failed', error);
    return [];
  }
  return ((data ?? []) as CoachingMessageDbRow[]).map(toRow);
}

/** Appends one row — never mutates or replaces a prior message, matching migration 96's append-only design. */
export async function recordCoachingMessage(
  supabase: SupabaseClient,
  memberId: string,
  params: { topicKey: string; conversationType: ConversationType; messageText: string; sourceState: string }
): Promise<void> {
  const { error } = await supabase.from('member_coaching_messages').insert({
    member_id: memberId,
    topic_key: params.topicKey,
    conversation_type: params.conversationType,
    message_text: params.messageText,
    message_hash: hashText(params.messageText),
    source_state: params.sourceState,
  });

  if (error) console.error('recordCoachingMessage failed', error);
}
