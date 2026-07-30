/**
 * lib/lead-capture/data.ts against real local Supabase (no mocks), same
 * testing philosophy as tests/conversation-coach-integration.test.ts.
 * Uses the service-role client throughout, exactly like the real route
 * handler does — there is no authenticated "lead" user for RLS to key
 * off of (migration 123's own docblock).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { serviceRoleClient } from './setup/test-clients';
import {
  createLeadConversation,
  getLeadConversationBySessionToken,
  updateLeadConversation,
  insertLeadMessage,
  listLeadMessages,
  insertCapturedLead,
  markCapturedLeadNotified,
} from '../lib/lead-capture/data';

const createdConversationIds: string[] = [];

afterEach(async () => {
  const supabase = serviceRoleClient();
  if (createdConversationIds.length > 0) {
    await supabase.from('lead_conversations').delete().in('id', createdConversationIds);
  }
  createdConversationIds.length = 0;
});

describe('lead-capture data — conversations', () => {
  it('creates a conversation with the expected defaults', async () => {
    const supabase = serviceRoleClient();
    const conversation = await createLeadConversation(supabase, 'https://example.com/landing');
    expect(conversation).not.toBeNull();
    createdConversationIds.push(conversation!.id);

    expect(conversation!.stage).toBe('opening');
    expect(conversation!.status).toBe('active');
    expect(conversation!.topic).toBeNull();
    expect(conversation!.source_url).toBe('https://example.com/landing');
  });

  it('round-trips through getLeadConversationBySessionToken', async () => {
    const supabase = serviceRoleClient();
    const conversation = await createLeadConversation(supabase, null);
    createdConversationIds.push(conversation!.id);

    const fetched = await getLeadConversationBySessionToken(supabase, conversation!.session_token);
    expect(fetched?.id).toBe(conversation!.id);
  });

  it('updates topic/stage/retryCount/leadTemperature/routedTo/patternName/status', async () => {
    const supabase = serviceRoleClient();
    const conversation = await createLeadConversation(supabase, null);
    createdConversationIds.push(conversation!.id);

    const ok = await updateLeadConversation(supabase, conversation!.id, {
      topic: 'pain',
      stage: 'follow_up_1',
      retryCount: 1,
      leadTemperature: 'hot',
      routedTo: 'discovery_call',
      patternName: 'recovery_deficit',
      status: 'completed',
    });
    expect(ok).toBe(true);

    const fetched = await getLeadConversationBySessionToken(supabase, conversation!.session_token);
    expect(fetched?.topic).toBe('pain');
    expect(fetched?.stage).toBe('follow_up_1');
    expect(fetched?.retry_count).toBe(1);
    expect(fetched?.lead_temperature).toBe('hot');
    expect(fetched?.routed_to).toBe('discovery_call');
    expect(fetched?.pattern_name).toBe('recovery_deficit');
    expect(fetched?.status).toBe('completed');
  });
});

describe('lead-capture data — messages', () => {
  it('inserts lead/agent messages in order and bumps last_message_at', async () => {
    const supabase = serviceRoleClient();
    const conversation = await createLeadConversation(supabase, null);
    createdConversationIds.push(conversation!.id);

    await insertLeadMessage(supabase, conversation!.id, 'agent', 'Hey! What brings you here?');
    await insertLeadMessage(supabase, conversation!.id, 'lead', 'My knee has been hurting');

    const messages = await listLeadMessages(supabase, conversation!.id);
    expect(messages.map((m) => m.role)).toEqual(['agent', 'lead']);
    expect(messages[1]?.content).toBe('My knee has been hurting');

    const fetched = await getLeadConversationBySessionToken(supabase, conversation!.session_token);
    expect(new Date(fetched!.last_message_at).getTime()).toBeGreaterThanOrEqual(
      new Date(conversation!.started_at).getTime()
    );
  });

  it('cascades message deletion when the parent conversation is deleted', async () => {
    const supabase = serviceRoleClient();
    const conversation = await createLeadConversation(supabase, null);
    await insertLeadMessage(supabase, conversation!.id, 'agent', 'hello');

    await supabase.from('lead_conversations').delete().eq('id', conversation!.id);

    const messages = await listLeadMessages(supabase, conversation!.id);
    expect(messages).toHaveLength(0);
  });
});

describe('lead-capture data — captured leads', () => {
  it('inserts a captured lead and marks it notified', async () => {
    const supabase = serviceRoleClient();
    const conversation = await createLeadConversation(supabase, null);
    createdConversationIds.push(conversation!.id);

    const lead = await insertCapturedLead(supabase, {
      conversationId: conversation!.id,
      firstName: 'Jamie',
      email: 'jamie@example.test',
      topic: 'pain',
      leadTemperature: 'hot',
      routedTo: 'discovery_call',
      patternName: 'compensation_pattern',
    });
    expect(lead).not.toBeNull();
    expect(lead!.notified_at).toBeNull();
    expect(lead!.pattern_name).toBe('compensation_pattern');

    const marked = await markCapturedLeadNotified(supabase, lead!.id);
    expect(marked).toBe(true);

    const { data: refetched } = await supabase
      .from('captured_leads')
      .select('*')
      .eq('id', lead!.id)
      .single();
    expect(refetched!.notified_at).not.toBeNull();
  });
});
