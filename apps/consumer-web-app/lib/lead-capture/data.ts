/**
 * Database access for the Lead Capture Agent (migration 123) — same
 * pure-function-taking-a-client shape as every other data.ts in this
 * codebase (e.g. lib/conversation-coach/data.ts). Every call site passes
 * the service-role client (app/api/lead-capture/route.ts) since a lead
 * has no auth.users row for RLS to key off of — see the migration's own
 * docblock.
 *
 * `pattern_name` (migration 123/124) gets a deliberate resilience wrapper
 * on every write below: PostgREST (Supabase's REST layer, what
 * @supabase/supabase-js actually talks to) keeps its own cached
 * reflection of the schema, and that cache can lag behind a just-applied
 * migration for reasons outside this app's control — a `NOTIFY pgrst,
 * 'reload schema'` migration (00000000000124) is the standard fix, but
 * isn't guaranteed to land instantly (or at all, if PostgREST wasn't
 * actively listening at that exact moment). Rather than let that make the
 * *entire* Lead Capture Agent unusable over one non-essential column, a
 * write that fails specifically because PostgREST doesn't yet recognize
 * `pattern_name` retries once with that field omitted — the conversation,
 * routing, and notification all still work; only the pattern name itself
 * fails to persist on that particular row until the cache catches up.
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

/** PostgREST's "this column isn't in my schema cache" error — distinct from the column genuinely not existing in Postgres. */
function isMissingFromSchemaCache(error: unknown, column: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === 'PGRST204' && typeof message === 'string' && message.includes(`'${column}'`);
}

/** Shallow-clones a write payload with `pattern_name` removed, for the retry-without-it path above. */
function withoutPatternName<T extends Record<string, unknown>>(payload: T): Omit<T, 'pattern_name'> {
  const clone: Record<string, unknown> = { ...payload };
  delete clone.pattern_name;
  return clone as Omit<T, 'pattern_name'>;
}

export async function createLeadConversation(
  supabase: SupabaseClient,
  sourceUrl: string | null
): Promise<LeadConversation | null> {
  const id = randomUUID();
  const sessionToken = randomUUID();
  const now = new Date().toISOString();

  const payload = {
    id,
    session_token: sessionToken,
    topic: null,
    stage: 'opening',
    retry_count: 0,
    lead_temperature: null,
    routed_to: null,
    pattern_name: null as LeadPatternName | null,
    source_url: sourceUrl,
    status: 'active',
    started_at: now,
    last_message_at: now,
  };

  let { error } = await supabase.from('lead_conversations').insert(payload);

  if (error && isMissingFromSchemaCache(error, 'pattern_name')) {
    console.error('createLeadConversation: pattern_name missing from PostgREST schema cache, retrying without it', error);
    ({ error } = await supabase.from('lead_conversations').insert(withoutPatternName(payload)));
  }

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

  let { error } = await supabase.from('lead_conversations').update(update).eq('id', conversationId);

  if (error && isMissingFromSchemaCache(error, 'pattern_name') && 'pattern_name' in update) {
    console.error('updateLeadConversation: pattern_name missing from PostgREST schema cache, retrying without it', error);
    ({ error } = await supabase.from('lead_conversations').update(withoutPatternName(update)).eq('id', conversationId));
  }

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
  const payload = {
    conversation_id: input.conversationId,
    first_name: input.firstName,
    email: input.email,
    topic: input.topic,
    lead_temperature: input.leadTemperature,
    routed_to: input.routedTo,
    pattern_name: input.patternName,
  };

  let { data, error } = await supabase.from('captured_leads').insert(payload).select('*').single();

  if (error && isMissingFromSchemaCache(error, 'pattern_name')) {
    console.error('insertCapturedLead: pattern_name missing from PostgREST schema cache, retrying without it', error);
    ({ data, error } = await supabase.from('captured_leads').insert(withoutPatternName(payload)).select('*').single());
  }

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
