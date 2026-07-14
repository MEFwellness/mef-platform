/**
 * Database access for the MEF Conversation Coach — mirrors
 * lib/narrative/data.ts and lib/safety/data.ts's shape exactly: pure
 * functions taking a SupabaseClient, RLS (migration 33) decides who may
 * read/write what. Inserts generate their own id and skip `.select()`
 * after writing, same defensive discipline established by
 * lib/safety/data.ts's insertReviewQueueEntry.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type {
  ConversationSession,
  ConversationSessionStatus,
  ConversationEntryPoint,
  ConversationMessage,
  ConversationMessageRole,
  ConversationMemoryItem,
  ConversationMemoryType,
  ConversationHandoff,
  ConversationHandoffUrgency,
  ConversationHandoffStatus,
} from '@mef/shared-types-contracts';

// ---- Sessions ----

export async function getActiveSession(
  supabase: SupabaseClient,
  memberId: string
): Promise<ConversationSession | null> {
  const { data, error } = await supabase
    .from('conversation_sessions')
    .select('*')
    .eq('member_id', memberId)
    .eq('status', 'active')
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('getActiveSession failed', error);
    return null;
  }
  return data as ConversationSession | null;
}

export async function createSession(
  supabase: SupabaseClient,
  memberId: string,
  entryPoint: ConversationEntryPoint,
  title: string | null
): Promise<ConversationSession | null> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const { error } = await supabase.from('conversation_sessions').insert({
    id,
    member_id: memberId,
    entry_point: entryPoint,
    status: 'active',
    title,
    started_at: now,
    last_message_at: now,
  });

  if (error) {
    console.error('createSession failed', error);
    return null;
  }

  return {
    id,
    member_id: memberId,
    entry_point: entryPoint,
    status: 'active',
    title,
    started_at: now,
    last_message_at: now,
    created_at: now,
    updated_at: now,
  };
}

export async function getSession(
  supabase: SupabaseClient,
  sessionId: string
): Promise<ConversationSession | null> {
  const { data, error } = await supabase
    .from('conversation_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();

  if (error) {
    console.error('getSession failed', error);
    return null;
  }
  return data as ConversationSession | null;
}

export async function listSessionsForMember(
  supabase: SupabaseClient,
  memberId: string,
  limit = 20
): Promise<ConversationSession[]> {
  const { data, error } = await supabase
    .from('conversation_sessions')
    .select('*')
    .eq('member_id', memberId)
    .order('last_message_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('listSessionsForMember failed', error);
    return [];
  }
  return data as ConversationSession[];
}

export async function touchSession(supabase: SupabaseClient, sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('conversation_sessions')
    .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', sessionId);
  if (error) console.error('touchSession failed', error);
}

export async function setSessionStatus(
  supabase: SupabaseClient,
  sessionId: string,
  status: ConversationSessionStatus
): Promise<boolean> {
  const { error } = await supabase
    .from('conversation_sessions')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', sessionId);
  if (error) {
    console.error('setSessionStatus failed', error);
    return false;
  }
  return true;
}

export async function setSessionTitle(
  supabase: SupabaseClient,
  sessionId: string,
  title: string
): Promise<void> {
  const { error } = await supabase
    .from('conversation_sessions')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', sessionId);
  if (error) console.error('setSessionTitle failed', error);
}

// ---- Messages ----

export type InsertMessageInput = {
  sessionId: string;
  memberId: string;
  role: ConversationMessageRole;
  content: string;
  sourcePage: string | null;
  promptVersion?: string | null;
  safetyClassificationId?: string | null;
  relatedBrainFocus?: string | null;
  relatedInsightId?: string | null;
  memberVisible?: boolean;
};

export async function insertMessage(
  supabase: SupabaseClient,
  input: InsertMessageInput
): Promise<ConversationMessage | null> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const { error } = await supabase.from('conversation_messages').insert({
    id,
    session_id: input.sessionId,
    member_id: input.memberId,
    role: input.role,
    content: input.content,
    source_page: input.sourcePage,
    prompt_version: input.promptVersion ?? null,
    safety_classification_id: input.safetyClassificationId ?? null,
    related_brain_focus: input.relatedBrainFocus ?? null,
    related_insight_id: input.relatedInsightId ?? null,
    member_visible: input.memberVisible ?? true,
    is_archived: false,
  });

  if (error) {
    console.error('insertMessage failed', error);
    return null;
  }

  return {
    id,
    session_id: input.sessionId,
    member_id: input.memberId,
    role: input.role,
    content: input.content,
    source_page: input.sourcePage,
    prompt_version: input.promptVersion ?? null,
    safety_classification_id: input.safetyClassificationId ?? null,
    related_brain_focus: input.relatedBrainFocus ?? null,
    related_insight_id: input.relatedInsightId ?? null,
    member_visible: input.memberVisible ?? true,
    is_archived: false,
    created_at: now,
  };
}

export async function setMessageSafetyClassification(
  supabase: SupabaseClient,
  messageId: string,
  classificationId: string
): Promise<void> {
  const { error } = await supabase
    .from('conversation_messages')
    .update({ safety_classification_id: classificationId })
    .eq('id', messageId);
  if (error) console.error('setMessageSafetyClassification failed', error);
}

export async function listMessages(
  supabase: SupabaseClient,
  sessionId: string,
  limit = 100
): Promise<ConversationMessage[]> {
  const { data, error } = await supabase
    .from('conversation_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('listMessages failed', error);
    return [];
  }
  return data as ConversationMessage[];
}

/** Most recent N messages, oldest first — the short window fed to the prompt, never the full transcript. */
export async function listRecentMessages(
  supabase: SupabaseClient,
  sessionId: string,
  limit: number
): Promise<ConversationMessage[]> {
  const { data, error } = await supabase
    .from('conversation_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('listRecentMessages failed', error);
    return [];
  }
  return (data as ConversationMessage[]).reverse();
}

// ---- Memory ----

export type InsertMemoryInput = {
  memberId: string;
  sessionId: string;
  memoryType: ConversationMemoryType;
  content: string;
  sourceMessageId: string | null;
};

export async function insertMemory(
  supabase: SupabaseClient,
  input: InsertMemoryInput
): Promise<ConversationMemoryItem | null> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const { error } = await supabase.from('conversation_memory').insert({
    id,
    member_id: input.memberId,
    session_id: input.sessionId,
    memory_type: input.memoryType,
    content: input.content,
    source_message_id: input.sourceMessageId,
    is_active: true,
  });

  if (error) {
    console.error('insertMemory failed', error);
    return null;
  }

  return {
    id,
    member_id: input.memberId,
    session_id: input.sessionId,
    memory_type: input.memoryType,
    content: input.content,
    source_message_id: input.sourceMessageId,
    is_active: true,
    created_at: now,
    updated_at: now,
  };
}

export async function listActiveMemory(
  supabase: SupabaseClient,
  memberId: string,
  limit = 20
): Promise<ConversationMemoryItem[]> {
  const { data, error } = await supabase
    .from('conversation_memory')
    .select('*')
    .eq('member_id', memberId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('listActiveMemory failed', error);
    return [];
  }
  return data as ConversationMemoryItem[];
}

/** A near-duplicate already-active memory of the same type — the dedup check that keeps extraction from writing the same barrier/preference every turn. */
export async function findSimilarActiveMemory(
  supabase: SupabaseClient,
  memberId: string,
  memoryType: ConversationMemoryType,
  content: string
): Promise<ConversationMemoryItem | null> {
  const { data, error } = await supabase
    .from('conversation_memory')
    .select('*')
    .eq('member_id', memberId)
    .eq('memory_type', memoryType)
    .eq('is_active', true);

  if (error) {
    console.error('findSimilarActiveMemory failed', error);
    return null;
  }

  const normalized = content.trim().toLowerCase();
  const match = (data as ConversationMemoryItem[]).find((item) => {
    const existing = item.content.trim().toLowerCase();
    return (
      existing === normalized || existing.includes(normalized) || normalized.includes(existing)
    );
  });
  return match ?? null;
}

// ---- Handoffs ----

export type InsertHandoffInput = {
  sessionId: string;
  memberId: string;
  assignedCoachId: string | null;
  memberNote: string | null;
  urgency: ConversationHandoffUrgency;
};

export async function insertHandoff(
  supabase: SupabaseClient,
  input: InsertHandoffInput
): Promise<ConversationHandoff | null> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const { error } = await supabase.from('conversation_handoffs').insert({
    id,
    session_id: input.sessionId,
    member_id: input.memberId,
    assigned_coach_id: input.assignedCoachId,
    member_note: input.memberNote,
    urgency: input.urgency,
    status: 'pending',
  });

  if (error) {
    console.error('insertHandoff failed', error);
    return null;
  }

  return {
    id,
    session_id: input.sessionId,
    member_id: input.memberId,
    assigned_coach_id: input.assignedCoachId,
    member_note: input.memberNote,
    urgency: input.urgency,
    status: 'pending',
    coach_response_note: null,
    created_at: now,
    updated_at: now,
    resolved_at: null,
  };
}

export async function listHandoffsForMember(
  supabase: SupabaseClient,
  memberId: string
): Promise<ConversationHandoff[]> {
  const { data, error } = await supabase
    .from('conversation_handoffs')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('listHandoffsForMember failed', error);
    return [];
  }
  return data as ConversationHandoff[];
}

export async function listHandoffsForSession(
  supabase: SupabaseClient,
  sessionId: string
): Promise<ConversationHandoff[]> {
  const { data, error } = await supabase
    .from('conversation_handoffs')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('listHandoffsForSession failed', error);
    return [];
  }
  return data as ConversationHandoff[];
}

export async function updateHandoff(
  supabase: SupabaseClient,
  handoffId: string,
  update: { status?: ConversationHandoffStatus; coachResponseNote?: string }
): Promise<boolean> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (update.status !== undefined) {
    patch.status = update.status;
    if (update.status === 'resolved') patch.resolved_at = new Date().toISOString();
  }
  if (update.coachResponseNote !== undefined) patch.coach_response_note = update.coachResponseNote;

  const { error } = await supabase.from('conversation_handoffs').update(patch).eq('id', handoffId);
  if (error) {
    console.error('updateHandoff failed', error);
    return false;
  }
  return true;
}
