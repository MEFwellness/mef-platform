/**
 * Database access for the Lead Capture Agent (migration 123) — same
 * pure-function-taking-a-client shape as every other data.ts in this
 * codebase (e.g. lib/conversation-coach/data.ts). Every call site passes
 * the service-role client (app/api/lead-capture/route.ts) since a lead
 * has no auth.users row for RLS to key off of — see the migration's own
 * docblock.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type {
  LeadConversation,
  LeadConversationStage,
  LeadMessage,
  LeadMessageRole,
  LeadTopic,
  LeadTemperature,
  LeadRoutingDestination,
  LeadPatternName,
  CapturedLead,
} from '@mef/shared-types-contracts';

export async function createLeadConversation(
  supabase: SupabaseClient,
  sourceUrl: string | null
): Promise<LeadConversation | null> {
  const id = randomUUID();
  const sessionToken = randomUUID();
  const now = new Date().toISOString();

  const { error } = await supabase.from('lead_conversations').insert({
    id,
    session_token: sessionToken,
    topic: null,
    stage: 'opening',
    retry_count: 0,
    lead_temperature: null,
    routed_to: null,
    pattern_name: null,
    source_url: sourceUrl,
    status: 'active',
    started_at: now,
    last_message_at: now,
  });

  if (error) {
    console.error('createLeadConversation failed', error);
    return null;
  }

  return {
    id,
    session_token: sessionToken,
    topic: null,
    stage: 'opening',
    retry_count: 0,
    lead_temperature: null,
    routed_to: null,
    pattern_name: null,
    source_url: sourceUrl,
    status: 'active',
    started_at: now,
    last_message_at: now,
    created_at: now,
    updated_at: now,
  };
}

export async function getLeadConversationBySessionToken(
  supabase: SupabaseClient,
  sessionToken: string
): Promise<LeadConversation | null> {
  const { data, error } = await supabase
    .from('lead_conversations')
    .select('*')
    .eq('session_token', sessionToken)
    .maybeSingle();

  if (error) {
    console.error('getLeadConversationBySessionToken failed', error);
    return null;
  }
  return data as LeadConversation | null;
}

export async function updateLeadConversation(
  supabase: SupabaseClient,
  conversationId: string,
  patch: Partial<{
    topic: LeadTopic;
    stage: LeadConversationStage;
    retryCount: number;
    leadTemperature: LeadTemperature;
    routedTo: LeadRoutingDestination;
    patternName: LeadPatternName;
    status: 'active' | 'completed' | 'abandoned';
  }>
): Promise<boolean> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.topic !== undefined) update.topic = patch.topic;
  if (patch.stage !== undefined) update.stage = patch.stage;
  if (patch.retryCount !== undefined) update.retry_count = patch.retryCount;
  if (patch.leadTemperature !== undefined) update.lead_temperature = patch.leadTemperature;
  if (patch.routedTo !== undefined) update.routed_to = patch.routedTo;
  if (patch.patternName !== undefined) update.pattern_name = patch.patternName;
  if (patch.status !== undefined) update.status = patch.status;

  const { error } = await supabase.from('lead_conversations').update(update).eq('id', conversationId);
  if (error) {
    console.error('updateLeadConversation failed', error);
    return false;
  }
  return true;
}

export async function insertLeadMessage(
  supabase: SupabaseClient,
  conversationId: string,
  role: LeadMessageRole,
  content: string
): Promise<LeadMessage | null> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const { error } = await supabase.from('lead_messages').insert({
    id,
    conversation_id: conversationId,
    role,
    content,
    created_at: now,
  });

  if (error) {
    console.error('insertLeadMessage failed', error);
    return null;
  }

  // Keep the conversation's own last_message_at in sync so a future
  // coach-facing "Leads" list can sort by recency without a join.
  await supabase
    .from('lead_conversations')
    .update({ last_message_at: now })
    .eq('id', conversationId);

  return { id, conversation_id: conversationId, role, content, created_at: now };
}

export async function listLeadMessages(
  supabase: SupabaseClient,
  conversationId: string
): Promise<LeadMessage[]> {
  const { data, error } = await supabase
    .from('lead_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('listLeadMessages failed', error);
    return [];
  }
  return data as LeadMessage[];
}

export async function insertCapturedLead(
  supabase: SupabaseClient,
  input: {
    conversationId: string;
    firstName: string | null;
    email: string;
    topic: LeadTopic | null;
    leadTemperature: LeadTemperature | null;
    routedTo: LeadRoutingDestination | null;
    patternName: LeadPatternName | null;
  }
): Promise<CapturedLead | null> {
  const { data, error } = await supabase
    .from('captured_leads')
    .insert({
      conversation_id: input.conversationId,
      first_name: input.firstName,
      email: input.email,
      topic: input.topic,
      lead_temperature: input.leadTemperature,
      routed_to: input.routedTo,
      pattern_name: input.patternName,
    })
    .select('*')
    .single();

  if (error) {
    console.error('insertCapturedLead failed', error);
    return null;
  }
  return data as CapturedLead;
}

export async function markCapturedLeadNotified(
  supabase: SupabaseClient,
  capturedLeadId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('captured_leads')
    .update({ notified_at: new Date().toISOString() })
    .eq('id', capturedLeadId);

  if (error) {
    console.error('markCapturedLeadNotified failed', error);
    return false;
  }
  return true;
}
