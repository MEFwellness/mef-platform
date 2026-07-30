/**
 * Public, unauthenticated API route powering the Lead Capture Agent
 * widget (public/lead-widget.js) — a prospect-intake chat embedded on
 * external Leadpages landing pages. Entirely separate from the
 * member-facing Conversation Coach (Root, lib/conversation-coach/*): no
 * import from that feature, no shared tables, no shared prompt.
 *
 * Uses the service-role Supabase client (same pattern as
 * app/api/cron/wearable-daily/route.ts) since there is no per-visitor
 * session — a lead is anonymous and has no auth.users row. RLS on
 * lead_conversations/lead_messages/captured_leads (migration 123) has no
 * public policies at all; every write happens here, server-side, gated by
 * this route's own CORS allowlist + rate limit instead of RLS.
 *
 * The LLM (or its deterministic fallback, lib/lead-capture/fallback.ts)
 * only ever generates the reply text for the current turn — which stage
 * comes next, when an email is actually captured, and where a lead is
 * routed are all decided deterministically by lib/lead-capture/flow.ts,
 * never left to model output.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from '@/lib/supabase/env';
import { corsHeaders, isOriginAllowed, getSelfOrigin } from '@/lib/lead-capture/cors';
import { checkRateLimit, getClientIp } from '@/lib/lead-capture/rateLimit';
import {
  classifyTopic,
  nextStage,
  extractNameAndEmail,
  determineLeadTemperature,
  determineRoutingDestination,
  shouldRetryEmailCapture,
} from '@/lib/lead-capture/flow';
import {
  createLeadConversation,
  getLeadConversationBySessionToken,
  updateLeadConversation,
  insertLeadMessage,
  listLeadMessages,
  insertCapturedLead,
  markCapturedLeadNotified,
} from '@/lib/lead-capture/data';
import { notifyCoachesOfNewLead } from '@/lib/lead-capture/notify';
import { generateFollowUpReply, generateInsightAndCaptureReply } from '@/lib/lead-capture/reply';
import {
  OPENING_MESSAGE,
  QUICK_REPLY_OPTIONS,
  EMAIL_RETRY_MESSAGE,
  buildRoutingMessage,
  CLOSING_MESSAGE,
} from '@/lib/lead-capture/fallback';
import type { LeadConversationStage } from '@mef/shared-types-contracts';

export const dynamic = 'force-dynamic';

function serviceRoleClient() {
  const { url } = getSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is missing — set it in your hosting provider's project " +
        'environment variables, then redeploy.'
    );
  }
  return createClient(url, serviceRoleKey);
}

type LeadCaptureRequestBody = {
  conversationId?: string;
  message?: string;
  quickReply?: string;
  sourceUrl?: string;
};

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin');
  const selfOrigin = getSelfOrigin(request);
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin, selfOrigin) });
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const selfOrigin = getSelfOrigin(request);
  const headers = corsHeaders(origin, selfOrigin);

  // A present-but-disallowed Origin is rejected explicitly — defense in
  // depth, not reliance on the browser alone to enforce CORS. A missing
  // Origin (same-origin requests often omit it, as do non-browser
  // callers) is allowed through to the rate limit / logic below.
  if (origin && !isOriginAllowed(origin, selfOrigin)) {
    return NextResponse.json({ error: 'Origin not allowed' }, { status: 403, headers });
  }

  const ip = getClientIp(request);
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Too many requests — please try again in a few minutes.' },
      { status: 429, headers }
    );
  }

  let body: LeadCaptureRequestBody;
  try {
    body = (await request.json()) as LeadCaptureRequestBody;
  } catch {
    body = {};
  }

  let supabase;
  try {
    supabase = serviceRoleClient();
  } catch (err) {
    console.error('lead-capture: Supabase misconfigured —', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Supabase misconfigured' },
      { status: 500, headers }
    );
  }

  // No conversationId yet: the widget is opening for the first time in
  // this visit. Starts a new conversation and returns the static opening
  // message + quick replies — no LLM call needed for this turn at all.
  if (!body.conversationId) {
    const conversation = await createLeadConversation(supabase, body.sourceUrl ?? null);
    if (!conversation) {
      return NextResponse.json({ error: 'Could not start conversation' }, { status: 500, headers });
    }
    await insertLeadMessage(supabase, conversation.id, 'agent', OPENING_MESSAGE);

    return NextResponse.json(
      {
        conversationId: conversation.session_token,
        reply: OPENING_MESSAGE,
        quickReplies: QUICK_REPLY_OPTIONS,
        stage: conversation.stage,
        done: false,
      },
      { headers }
    );
  }

  const conversation = await getLeadConversationBySessionToken(supabase, body.conversationId);
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404, headers });
  }

  if (conversation.stage === 'routed' || conversation.status !== 'active') {
    return NextResponse.json(
      { conversationId: conversation.session_token, reply: CLOSING_MESSAGE, stage: conversation.stage, done: true },
      { headers }
    );
  }

  const incoming = (body.quickReply ?? body.message ?? '').trim();
  if (!incoming) {
    return NextResponse.json({ error: 'message is required' }, { status: 400, headers });
  }

  await insertLeadMessage(supabase, conversation.id, 'lead', incoming);

  const stage: LeadConversationStage = conversation.stage;

  // Stage 'opening' -> the incoming message is the topic pick (a tapped
  // quick reply, or free-typed text). Everything else is a reply to the
  // agent's previous question for that stage.
  if (stage === 'opening') {
    const topic = classifyTopic(incoming);
    await updateLeadConversation(supabase, conversation.id, { topic, stage: 'follow_up_1' });
    const history = await listLeadMessages(supabase, conversation.id);
    const reply = await generateFollowUpReply('follow_up_1', topic, history);
    await insertLeadMessage(supabase, conversation.id, 'agent', reply);
    return NextResponse.json(
      { conversationId: conversation.session_token, reply, stage: 'follow_up_1', done: false },
      { headers }
    );
  }

  if (stage === 'follow_up_1' || stage === 'follow_up_2' || stage === 'follow_up_3') {
    const topic = conversation.topic ?? 'general';
    const advancedStage = nextStage(stage);
    await updateLeadConversation(supabase, conversation.id, { stage: advancedStage });
    const history = await listLeadMessages(supabase, conversation.id);

    const reply =
      advancedStage === 'insight_capture'
        ? await generateInsightAndCaptureReply(topic, history)
        : await generateFollowUpReply(
            advancedStage as 'follow_up_2' | 'follow_up_3',
            topic,
            history
          );

    await insertLeadMessage(supabase, conversation.id, 'agent', reply);
    return NextResponse.json(
      { conversationId: conversation.session_token, reply, stage: advancedStage, done: false },
      { headers }
    );
  }

  // stage === 'insight_capture': the incoming message should contain a
  // first name + email in response to the previous turn's ask.
  const { name, email } = extractNameAndEmail(incoming);

  if (!email) {
    if (shouldRetryEmailCapture(conversation.retry_count)) {
      await updateLeadConversation(supabase, conversation.id, { retryCount: conversation.retry_count + 1 });
      await insertLeadMessage(supabase, conversation.id, 'agent', EMAIL_RETRY_MESSAGE);
      return NextResponse.json(
        { conversationId: conversation.session_token, reply: EMAIL_RETRY_MESSAGE, stage: 'insight_capture', done: false },
        { headers }
      );
    }
    // Out of retries: route the lead anyway without a captured email
    // rather than trap them in a loop — a warmer relationship still
    // starts from the routing link itself.
  }

  const topic = conversation.topic ?? 'general';
  const history = await listLeadMessages(supabase, conversation.id);
  const leadMessageContents = history.filter((m) => m.role === 'lead').map((m) => m.content);
  const temperature = determineLeadTemperature(topic, leadMessageContents);
  const routedTo = determineRoutingDestination(temperature);

  if (email) {
    const capturedLead = await insertCapturedLead(supabase, {
      conversationId: conversation.id,
      firstName: name,
      email,
      topic,
      leadTemperature: temperature,
      routedTo,
    });
    if (capturedLead) {
      await notifyCoachesOfNewLead(supabase, {
        firstName: name,
        email,
        topic,
        leadTemperature: temperature,
        capturedLeadId: capturedLead.id,
      });
      await markCapturedLeadNotified(supabase, capturedLead.id);
    }
  }

  await updateLeadConversation(supabase, conversation.id, {
    stage: 'routed',
    status: 'completed',
    leadTemperature: temperature,
    routedTo,
  });

  const reply = buildRoutingMessage(name, routedTo);
  await insertLeadMessage(supabase, conversation.id, 'agent', reply);

  return NextResponse.json(
    {
      conversationId: conversation.session_token,
      reply,
      stage: 'routed',
      done: true,
      routing: { destination: routedTo },
    },
    { headers }
  );
}
