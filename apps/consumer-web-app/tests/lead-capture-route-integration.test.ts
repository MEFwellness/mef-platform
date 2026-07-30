/**
 * End-to-end integration test for the Lead Capture Agent's public API
 * route (app/api/lead-capture/route.ts) against real local Supabase — no
 * mocked Supabase client, same testing philosophy as
 * tests/conversation-coach-integration.test.ts. The route is a plain Next
 * Route Handler (no cookies()/next/headers usage), so — unlike a server
 * action — it can be imported and invoked directly with a constructed
 * Request, which is what every test below does.
 *
 * ANTHROPIC_API_KEY/ANTHROPIC_MODEL/LEAD_AGENT_ANTHROPIC_MODEL are
 * cleared before every test so the LLM provider is always unconfigured
 * here — this proves the deterministic scaffolding (stage machine, pattern
 * assignment, email capture, routing, CORS, rate limiting, coach
 * notification) independent of whatever real credentials happen to be
 * present in a given environment, exactly like the Conversation Coach's
 * own integration suite does for the same reason.
 *
 * The flow under test is now button-first and four follow-ups deep:
 * opening (topic) -> follow_up_1 (where/when) -> follow_up_2 (how long) ->
 * follow_up_3 (what they've tried) -> follow_up_4 (goal) -> insight_capture
 * (PART ONE of the insight + email ask) -> routed (PART TWO + the
 * deterministic routing link).
 */
import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { resetLeadCaptureProviderForTests } from '../lib/lead-capture/provider';
import { resetRateLimitForTests } from '../lib/lead-capture/rateLimit';
import { POST, OPTIONS } from '../app/api/lead-capture/route';

const ALLOWED_ORIGIN = 'https://example-leadpages.net';
const createdConversationIds: string[] = [];

function makeRequest(body: unknown, init: { origin?: string; ip?: string } = {}): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (init.origin) headers.origin = init.origin;
  if (init.ip) headers['x-forwarded-for'] = init.ip;
  return new Request('http://localhost/api/lead-capture', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function postJson(body: unknown, init: { origin?: string; ip?: string } = {}) {
  const res = await POST(makeRequest(body, init));
  const json = await res.json();
  return { status: res.status, json, headers: res.headers };
}

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_MODEL;
  delete process.env.LEAD_AGENT_ANTHROPIC_MODEL;
  process.env.LEAD_WIDGET_ALLOWED_ORIGINS = ALLOWED_ORIGIN;
  resetLeadCaptureProviderForTests();
  resetRateLimitForTests();
});

afterEach(async () => {
  const supabase = serviceRoleClient();
  if (createdConversationIds.length > 0) {
    await supabase.from('lead_conversations').delete().in('id', createdConversationIds);
  }
  createdConversationIds.length = 0;
});

afterAll(async () => {
  const supabase = serviceRoleClient();
  await supabase
    .from('notifications')
    .delete()
    .eq('source_feature', 'lead_capture')
    .eq('member_id', TEST_USERS.coachOne.id);
});

async function startConversation(ip: string): Promise<string> {
  const { json } = await postJson({}, { ip });
  createdConversationIds.push(json.conversationId);
  return json.conversationId;
}

/** The API's own `conversationId` is the opaque session_token (what the widget stores) — captured_leads.conversation_id is the real lead_conversations.id, so tests asserting on captured_leads need this lookup. */
async function getConversationDbId(sessionToken: string): Promise<string> {
  const supabase = serviceRoleClient();
  const { data } = await supabase
    .from('lead_conversations')
    .select('id')
    .eq('session_token', sessionToken)
    .single();
  return data!.id;
}

describe('lead-capture route — opening turn', () => {
  it('starts a new conversation with the static opening message and four quick replies', async () => {
    const { status, json } = await postJson({}, { ip: '10.0.0.1' });
    expect(status).toBe(200);
    expect(json.stage).toBe('opening');
    expect(json.reply).toMatch(/bothering you most lately/i);
    expect(json.quickReplies).toEqual(['Pain', 'Energy', 'Sleep', 'Stress']);
    createdConversationIds.push(json.conversationId);
  });
});

describe('lead-capture route — full hot-lead conversation (pain + readiness)', () => {
  it('walks through all four button-first follow-ups, each with quick replies, then insight+capture, email capture, and routes to the discovery call', async () => {
    const ip = '10.0.0.2';
    const conversationId = await startConversation(ip);

    const step1 = await postJson({ conversationId, quickReply: 'Pain' }, { ip });
    expect(step1.json.stage).toBe('follow_up_1');
    expect(step1.json.reply.length).toBeGreaterThan(0);
    expect(step1.json.quickReplies).toContain('Lower Back');

    const step2 = await postJson({ conversationId, message: 'Lower Back' }, { ip });
    expect(step2.json.stage).toBe('follow_up_2');
    expect(step2.json.quickReplies).toEqual(['Weeks', 'Months', 'Years', 'As Long As I Can Remember']);

    const step3 = await postJson({ conversationId, message: 'About 3 weeks now' }, { ip });
    expect(step3.json.stage).toBe('follow_up_3');
    expect(step3.json.quickReplies).toContain('Nothing Yet');

    const step4 = await postJson({ conversationId, message: 'Tried stretching, not much luck' }, { ip });
    expect(step4.json.stage).toBe('follow_up_4');
    expect(step4.json.quickReplies?.length).toBeGreaterThanOrEqual(3);

    const step5 = await postJson({ conversationId, message: "I'm ready to book something and fix this" }, { ip });
    expect(step5.json.stage).toBe('insight_capture');
    expect(step5.json.reply.toLowerCase()).toMatch(/name|email/);
    expect(step5.json.quickReplies).toBeUndefined();
    // PART ONE names the pattern and opens the loop, but must not yet give
    // the full driver/first-step explanation reserved for PART TWO.
    expect(step5.json.reply.toLowerCase()).not.toMatch(/usually comes down to|first step|first thing to try/);
    expect(step5.json.reply).not.toContain('calendly');

    const step6 = await postJson({ conversationId, message: 'Jamie, jamie@example.test' }, { ip });
    expect(step6.json.stage).toBe('routed');
    expect(step6.json.done).toBe(true);
    expect(step6.json.routing.destination).toBe('discovery_call');
    expect(step6.json.reply).toContain('Jamie');
    // PART TWO (the payoff) plus the practitioner-voice hot-lead line and
    // the real routing link only appear once the email has been captured.
    expect(step6.json.reply.toLowerCase()).toMatch(/usually comes down to|first step|first thing to try/);
    expect(step6.json.reply.toLowerCase()).toMatch(/worth a real conversation/);
    expect(step6.json.reply).toContain('calendly.com/mefwellness/discovery-assessment');

    const supabase = serviceRoleClient();
    const { data: lead } = await supabase
      .from('captured_leads')
      .select('*')
      .eq('conversation_id', await getConversationDbId(conversationId))
      .single();
    expect(lead.email).toBe('jamie@example.test');
    expect(lead.first_name).toBe('Jamie');
    expect(lead.lead_temperature).toBe('hot');
    expect(lead.routed_to).toBe('discovery_call');
    // "Lower Back" (a specific spot) + something already tried -> a
    // compensation pattern per lib/lead-capture/pattern.ts's rules.
    expect(lead.pattern_name).toBe('compensation_pattern');
    expect(lead.notified_at).not.toBeNull();

    const { data: notification } = await supabase
      .from('notifications')
      .select('*')
      .eq('source_feature', 'lead_capture')
      .eq('source_record_id', lead.id)
      .eq('member_id', TEST_USERS.coachOne.id)
      .maybeSingle();
    expect(notification).not.toBeNull();
    expect(notification!.type).toBe('new_lead_captured');
    expect(notification!.body).toContain('jamie@example.test');
    expect(notification!.body).toContain('a compensation pattern');
  });
});

describe('lead-capture route — quick-reply buttons and typed free text are equivalent', () => {
  it('produces the same stage progression and the same assigned pattern whether every answer is a tapped button or an equivalent typed message', async () => {
    const buttonIp = '10.0.0.20';
    const buttonConversationId = await startConversation(buttonIp);
    await postJson({ conversationId: buttonConversationId, quickReply: 'Pain' }, { ip: buttonIp });
    await postJson({ conversationId: buttonConversationId, quickReply: 'Lower Back' }, { ip: buttonIp });
    await postJson({ conversationId: buttonConversationId, quickReply: 'Weeks' }, { ip: buttonIp });
    await postJson({ conversationId: buttonConversationId, quickReply: 'Stretching/Foam Rolling' }, { ip: buttonIp });
    const buttonFinal = await postJson(
      { conversationId: buttonConversationId, quickReply: 'Keep Up With Life' },
      { ip: buttonIp }
    );
    expect(buttonFinal.json.stage).toBe('insight_capture');

    const typedIp = '10.0.0.21';
    const typedConversationId = await startConversation(typedIp);
    await postJson({ conversationId: typedConversationId, message: 'my lower back really hurts' }, { ip: typedIp });
    await postJson({ conversationId: typedConversationId, message: 'lower back' }, { ip: typedIp });
    await postJson({ conversationId: typedConversationId, message: 'been a few weeks' }, { ip: typedIp });
    await postJson({ conversationId: typedConversationId, message: 'tried some stretching' }, { ip: typedIp });
    const typedFinal = await postJson(
      { conversationId: typedConversationId, message: 'just want to keep up with life' },
      { ip: typedIp }
    );
    expect(typedFinal.json.stage).toBe('insight_capture');

    const supabase = serviceRoleClient();
    const [{ data: buttonConv }, { data: typedConv }] = await Promise.all([
      supabase.from('lead_conversations').select('pattern_name, topic').eq('id', await getConversationDbId(buttonConversationId)).single(),
      supabase.from('lead_conversations').select('pattern_name, topic').eq('id', await getConversationDbId(typedConversationId)).single(),
    ]);
    expect(buttonConv!.topic).toBe('pain');
    expect(typedConv!.topic).toBe('pain');
    expect(buttonConv!.pattern_name).toBe('compensation_pattern');
    expect(typedConv!.pattern_name).toBe(buttonConv!.pattern_name);
  });
});

describe('lead-capture route — warm lead (no readiness signal) routes to quiz/guide', () => {
  it('routes a sleep-topic lead with no readiness keywords to quiz_guide', async () => {
    const ip = '10.0.0.3';
    const conversationId = await startConversation(ip);

    await postJson({ conversationId, quickReply: 'Sleep' }, { ip });
    await postJson({ conversationId, message: 'Staying Asleep' }, { ip });
    await postJson({ conversationId, message: 'A few months now' }, { ip });
    await postJson({ conversationId, message: 'Tried cutting caffeine' }, { ip });
    const step5 = await postJson({ conversationId, message: 'Just want to feel rested again' }, { ip });
    expect(step5.json.stage).toBe('insight_capture');

    const step6 = await postJson({ conversationId, message: 'Sam sam@example.test' }, { ip });
    expect(step6.json.routing.destination).toBe('quiz_guide');
    expect(step6.json.reply).toContain('mefwellness.com/quiz');

    const supabase = serviceRoleClient();
    const { data: lead } = await supabase
      .from('captured_leads')
      .select('*')
      .eq('conversation_id', await getConversationDbId(conversationId))
      .single();
    expect(lead.lead_temperature).toBe('warm');
    expect(lead.routed_to).toBe('quiz_guide');
    // "Staying Asleep" isn't the falling-asleep-specific case -> a rhythm disruption.
    expect(lead.pattern_name).toBe('rhythm_disruption');
  });
});

describe('lead-capture route — email retry then forced routing', () => {
  it('re-asks up to MAX_EMAIL_RETRIES times, then routes without a captured email', async () => {
    const ip = '10.0.0.4';
    const conversationId = await startConversation(ip);
    await postJson({ conversationId, quickReply: 'Stress' }, { ip });
    await postJson({ conversationId, message: 'All Of It' }, { ip });
    await postJson({ conversationId, message: 'A few months' }, { ip });
    await postJson({ conversationId, message: 'Tried meditation apps' }, { ip });
    await postJson({ conversationId, message: 'Just want to feel calmer' }, { ip });

    const retry1 = await postJson({ conversationId, message: 'no email for you' }, { ip });
    expect(retry1.json.stage).toBe('insight_capture');
    expect(retry1.json.reply).toMatch(/email/i);

    const retry2 = await postJson({ conversationId, message: 'still not giving it' }, { ip });
    expect(retry2.json.stage).toBe('insight_capture');

    const forced = await postJson({ conversationId, message: 'nope' }, { ip });
    expect(forced.json.stage).toBe('routed');
    expect(forced.json.done).toBe(true);
    // Even without a captured email, the lead is still routed with the full payoff + link.
    expect(forced.json.reply).toContain('mefwellness.com/quiz');

    const supabase = serviceRoleClient();
    const { data: lead } = await supabase
      .from('captured_leads')
      .select('*')
      .eq('conversation_id', await getConversationDbId(conversationId))
      .maybeSingle();
    expect(lead).toBeNull();
  });
});

describe('lead-capture route — a routed conversation is idempotent on further calls', () => {
  it('returns the closing message without re-processing once routed', async () => {
    const ip = '10.0.0.5';
    const conversationId = await startConversation(ip);
    await postJson({ conversationId, quickReply: 'Pain' }, { ip });
    await postJson({ conversationId, message: 'Hips/Knees' }, { ip });
    await postJson({ conversationId, message: 'Weeks' }, { ip });
    await postJson({ conversationId, message: 'nothing yet' }, { ip });
    await postJson({ conversationId, message: 'pain-free' }, { ip });
    await postJson({ conversationId, message: 'Alex alex@example.test' }, { ip });

    const after = await postJson({ conversationId, message: 'thanks' }, { ip });
    expect(after.json.stage).toBe('routed');
    expect(after.json.done).toBe(true);
  });
});

describe('lead-capture route — CORS', () => {
  it('rejects a disallowed origin with 403 and no CORS header', async () => {
    const { status, headers } = await postJson({}, { origin: 'https://not-allowed.example', ip: '10.0.0.6' });
    expect(status).toBe(403);
    expect(headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('accepts an allowed origin and echoes it back in the CORS header', async () => {
    const { status, headers, json } = await postJson({}, { origin: ALLOWED_ORIGIN, ip: '10.0.0.7' });
    expect(status).toBe(200);
    expect(headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
    createdConversationIds.push(json.conversationId);
  });

  it('OPTIONS preflight returns 204 with CORS headers for an allowed origin', async () => {
    const req = new Request('http://localhost/api/lead-capture', {
      method: 'OPTIONS',
      headers: { origin: ALLOWED_ORIGIN },
    });
    const res = await OPTIONS(req);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
  });
});

describe('lead-capture route — rate limiting', () => {
  it('blocks a single IP after MAX_REQUESTS_PER_WINDOW requests', async () => {
    const ip = '10.0.0.8';
    let sawTooManyRequests = false;
    for (let i = 0; i < 25; i++) {
      const { status, json } = await postJson({}, { ip });
      if (status === 429) {
        sawTooManyRequests = true;
      } else if (json.conversationId) {
        createdConversationIds.push(json.conversationId);
      }
    }
    expect(sawTooManyRequests).toBe(true);
  });
});
