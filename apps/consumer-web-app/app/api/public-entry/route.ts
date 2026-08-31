/**
 * The public entry experience's own API. Unauthenticated by necessity: the
 * visitor this serves has no account, which is the entire point.
 *
 * WHY A ROUTE HANDLER AND NOT SERVER ACTIONS. Two reasons, and both are
 * settled precedent in this codebase. A Server Action re-renders the whole
 * current route on the server and streams the payload back, which on Home
 * was measured as a second full page render for the sake of one analytics
 * row (see lib/analytics/beacon.ts). And a 'use server' module cannot be
 * called by something with no session in the way this needs. A route
 * handler answers and re-renders nothing.
 *
 * WHAT AUTHORISES A WRITE HERE. Not a session, because there is none.
 * Exactly what authorises the lead capture route next door: an origin
 * allowlist plus a per-IP rate limit, and the fact that every write is
 * scoped to the visitor token the caller already holds. A caller cannot
 * name another visitor's session, cannot name a question this experience
 * does not ask, cannot name an option that question does not offer, and
 * cannot write prose anywhere: lib/public-entry/questions.ts's
 * sanitizeAnswers drops everything else, and the database's own regex
 * checks refuse it a second time.
 *
 * THE RATE LIMIT IS ITS OWN, AND THAT WAS A CORRECTION. This route first
 * shared the chat widget's budget of twenty requests per five minutes per
 * IP, which is fine for a chat and completely wrong here: one honest
 * visitor answering nine questions makes about fourteen calls, so a second
 * person behind the same address was refused part way through and simply
 * watched her answers stop saving. See
 * lib/lead-capture/rateLimit.ts's PUBLIC_ENTRY_MAX_REQUESTS_PER_WINDOW.
 */

import { NextResponse } from 'next/server';
import { serviceRoleClient } from '@/lib/supabase/serviceRole';
import { corsHeaders, isOriginAllowed, getSelfOrigin } from '@/lib/lead-capture/cors';
import { checkPublicEntryRateLimit, getClientIp } from '@/lib/lead-capture/rateLimit';
import {
  createLeadConversation,
  insertCapturedLead,
  markCapturedLeadNotified,
  updateLeadConversation,
} from '@/lib/lead-capture/data';
import { notifyCoachesOfNewLead } from '@/lib/lead-capture/notify';
import {
  attachLead,
  getOrCreateSession,
  getSessionByToken,
  hasEvent,
  loadAnswers,
  markSessionCompleted,
  markSessionStarted,
  recordEvent,
  saveAnswers,
} from '@/lib/public-entry/data';
import { sanitizeAnswers } from '@/lib/public-entry/questions';
import { buildEnergyResult, buildThreeDayNotes, canBuildResult } from '@/lib/public-entry/result';
import { normalizeSourceCode, referrerHostOf } from '@/lib/public-entry/sources';
import { isValidEmail } from '@/lib/auth/validation';

export const dynamic = 'force-dynamic';

type Body = {
  action?: string;
  visitorToken?: string;
  sourceRaw?: string | null;
  landingPath?: string | null;
  referrer?: string | null;
  answers?: unknown;
  chapter?: number;
  email?: string;
  target?: string;
};

/** A short slug or nothing. Anything else becomes nothing rather than being written, matching the database's own check on public_entry_events.detail. */
function slugDetail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 32);
  return cleaned || null;
}

function tokenOf(body: Body): string | null {
  const raw = body.visitorToken;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length >= 8 && trimmed.length <= 64 ? trimmed : null;
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin');
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin, getSelfOrigin(request)) });
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const headers = corsHeaders(origin, getSelfOrigin(request));

  if (origin && !isOriginAllowed(origin, getSelfOrigin(request))) {
    return NextResponse.json({ error: 'Origin not allowed' }, { status: 403, headers });
  }
  if (!checkPublicEntryRateLimit(getClientIp(request))) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429, headers });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400, headers });
  }

  const visitorToken = tokenOf(body);
  if (!visitorToken) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400, headers });
  }

  const supabase = serviceRoleClient();

  // 'arrive' is the only action allowed to create a session. Every other
  // action must find one, so a caller cannot bring a session into being by
  // claiming to have finished something.
  if (body.action === 'arrive') {
    const session = await getOrCreateSession(supabase, {
      visitorToken,
      sourceRaw: normalizeSourceCode(body.sourceRaw ?? null),
      landingPath: typeof body.landingPath === 'string' ? body.landingPath.slice(0, 200) : null,
      referrerHost: referrerHostOf(body.referrer ?? null, new URL(getSelfOrigin(request)).host),
    });
    if (!session) return NextResponse.json({ error: 'Unavailable' }, { status: 503, headers });

    if (!(await hasEvent(supabase, session.id, 'entry_viewed'))) {
      await recordEvent(supabase, session.id, 'entry_viewed');
    }

    const answers = await loadAnswers(supabase, session.id);
    return NextResponse.json(
      {
        ok: true,
        sourceCode: session.sourceCode,
        answers,
        completed: session.completedAt !== null,
        leadCaptured: session.leadCapturedAt !== null,
      },
      { headers }
    );
  }

  const session = await getSessionByToken(supabase, visitorToken);
  if (!session) return NextResponse.json({ error: 'Unknown session' }, { status: 404, headers });

  switch (body.action) {
    case 'start': {
      await markSessionStarted(supabase, session.id);
      if (!(await hasEvent(supabase, session.id, 'experience_started'))) {
        await recordEvent(supabase, session.id, 'experience_started');
      }
      return NextResponse.json({ ok: true }, { headers });
    }

    case 'answer': {
      const clean = sanitizeAnswers(body.answers);
      await saveAnswers(supabase, session.id, clean);
      if (typeof body.chapter === 'number' && body.chapter >= 1 && body.chapter <= 4) {
        await recordEvent(supabase, session.id, 'chapter_completed', `chapter_${body.chapter}`);
      }
      return NextResponse.json({ ok: true }, { headers });
    }

    case 'complete': {
      const clean = sanitizeAnswers(body.answers);
      await saveAnswers(supabase, session.id, clean);
      // Re-read rather than trusting the request body: the result is built
      // from what is stored, so a caller cannot be shown a result for
      // answers that were never saved.
      const stored = await loadAnswers(supabase, session.id);
      if (!canBuildResult(stored)) {
        return NextResponse.json({ error: 'Not finished' }, { status: 400, headers });
      }
      const result = buildEnergyResult(stored);
      const alreadyCompleted = session.completedAt !== null;
      await markSessionCompleted(supabase, session.id, result.patternKey);
      if (!alreadyCompleted) {
        await recordEvent(supabase, session.id, 'experience_completed', result.patternKey);
      }
      return NextResponse.json({ ok: true, result }, { headers });
    }

    case 'engaged': {
      if (!(await hasEvent(supabase, session.id, 'result_engaged'))) {
        await recordEvent(supabase, session.id, 'result_engaged');
      }
      return NextResponse.json({ ok: true }, { headers });
    }

    case 'clicked': {
      await recordEvent(supabase, session.id, 'app_clicked', slugDetail(body.target));
      return NextResponse.json({ ok: true }, { headers });
    }

    case 'lead': {
      const email = typeof body.email === 'string' ? body.email.trim().slice(0, 254) : '';
      if (!isValidEmail(email)) {
        return NextResponse.json({ error: 'invalid_email' }, { status: 400, headers });
      }
      // The pattern is read back from the session rather than taken from
      // the request, so the notes a visitor unlocks are always the notes
      // for the result they were actually shown.
      const stored = await loadAnswers(supabase, session.id);
      if (!canBuildResult(stored)) {
        return NextResponse.json({ error: 'Not finished' }, { status: 400, headers });
      }
      const result = buildEnergyResult(stored);

      // Already captured on an earlier attempt (a reload, a second tab).
      // The notes open again and no second lead is created: this visitor
      // has already reached a coach once.
      if (session.leadCapturedAt) {
        return NextResponse.json(
          { ok: true, notes: buildThreeDayNotes(result.patternKey) },
          { headers }
        );
      }

      // Reuses the existing lead record rather than inventing a second
      // one, so a lead from this experience lands in the same place a lead
      // from the chat widget lands and reads the same way to a coach.
      // Temperature is 'warm' for everyone here on purpose: leaving an
      // email at the end of a two minute experience is one signal, and it
      // is not enough to call somebody hot. Nothing about their answers is
      // allowed to decide it, because that would be a health fact scoring
      // a sales field.
      let capturedLeadId: string | null = null;
      const conversation = await createLeadConversation(supabase, session.landingPath);
      if (conversation) {
        await updateLeadConversation(supabase, conversation.id, {
          topic: 'energy',
          stage: 'routed',
          leadTemperature: 'warm',
          routedTo: 'quiz_guide',
          patternName: result.patternKey,
          status: 'completed',
        });
        const lead = await insertCapturedLead(supabase, {
          conversationId: conversation.id,
          firstName: null,
          email,
          topic: 'energy',
          leadTemperature: 'warm',
          routedTo: 'quiz_guide',
          patternName: result.patternKey,
        });
        if (lead) {
          capturedLeadId = lead.id;
          await notifyCoachesOfNewLead(supabase, {
            firstName: null,
            email,
            topic: 'energy',
            leadTemperature: 'warm',
            patternName: result.patternKey,
            capturedLeadId: lead.id,
            // A coach picking up the phone needs to know which door this
            // was: nine fixed questions and a result she read, not a
            // conversation she typed into.
            arrivedThrough: 'Where Your Energy Goes',
          });
          // Stamped after the notification, exactly as the chat widget's
          // own route does it, so a coach's screen can tell a lead that has
          // been announced from one that has not, and a retry has something
          // to check.
          await markCapturedLeadNotified(supabase, lead.id);
        }
      }

      await attachLead(supabase, session.id, email, capturedLeadId);
      await recordEvent(supabase, session.id, 'notes_unlocked');

      return NextResponse.json(
        { ok: true, notes: buildThreeDayNotes(result.patternKey) },
        { headers }
      );
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400, headers });
  }
}
