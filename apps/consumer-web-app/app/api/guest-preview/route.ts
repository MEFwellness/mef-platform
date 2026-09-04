/**
 * The Quick Wellness Check's own API. Unauthenticated by necessity: the
 * visitor this serves has no account, which is the entire point.
 *
 * WHY A ROUTE HANDLER AND NOT A SERVER ACTION. Settled precedent here. A
 * Server Action re-renders the whole current route on the server and
 * streams the payload back, which on Home was measured as a second full
 * page render for the sake of one row (see lib/analytics/beacon.ts), and a
 * 'use server' module cannot be called by something with no session in the
 * way this needs. A route handler answers and re-renders nothing. This is
 * the same shape as app/api/public-entry/route.ts next door.
 *
 * WHAT AUTHORISES A WRITE HERE. Not a session, because there is none.
 * Exactly what authorises the public entry route: an origin allowlist, a
 * per-IP rate limit, and the fact that every write is scoped to the visitor
 * token the caller already holds. A caller cannot name another visitor's
 * session, cannot name a question this experience does not ask, and cannot
 * name an option that question does not offer, because
 * lib/guest-preview/questions.ts drops everything else and the database's
 * own regex checks refuse it a second time. There is no free-text field
 * anywhere in this experience, so there is nowhere for a stranger to type a
 * health disclosure.
 *
 * WHAT IT WILL NEVER DO. Not one answer written here is ever copied into
 * daily_checkins, an onboarding submission, an assessment session or a
 * scoring input. That is what this endpoint exists to replace: until
 * 2026-09-04 these answers were written straight into a real check-in on
 * the first page load after signup, with nothing recording where they had
 * come from.
 */

import { NextResponse } from 'next/server';
import { serviceRoleClient } from '@/lib/supabase/serviceRole';
import { corsHeaders, isOriginAllowed, getSelfOrigin } from '@/lib/lead-capture/cors';
import { checkGuestPreviewRateLimit, getClientIp } from '@/lib/lead-capture/rateLimit';
import {
  getOrCreateGuestSession,
  loadGuestAnswers,
  markGuestSessionCompleted,
  markGuestSessionStarted,
  saveGuestAnswers,
} from '@/lib/guest-preview/data';
import { sanitizeGuestAnswers } from '@/lib/guest-preview/questions';

export const dynamic = 'force-dynamic';

type Body = {
  action?: string;
  visitorToken?: string;
  answers?: unknown;
};

function tokenOf(body: Body): string | null {
  const raw = body.visitorToken;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length >= 8 && trimmed.length <= 64 ? trimmed : null;
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin');
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(origin, getSelfOrigin(request)),
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const headers = corsHeaders(origin, getSelfOrigin(request));

  if (origin && !isOriginAllowed(origin, getSelfOrigin(request))) {
    return NextResponse.json({ error: 'Origin not allowed' }, { status: 403, headers });
  }
  if (!checkGuestPreviewRateLimit(getClientIp(request))) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429, headers });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers });
  }

  const visitorToken = tokenOf(body);
  if (!visitorToken) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers });
  }

  const supabase = serviceRoleClient();
  const session = await getOrCreateGuestSession(supabase, visitorToken);
  // A failed write must never stop somebody answering seven questions. The
  // screen keeps its own local copy and carries on.
  if (!session) return NextResponse.json({ ok: false }, { status: 200, headers });

  switch (body.action) {
    case 'arrive': {
      const answers = await loadGuestAnswers(supabase, session.id);
      return NextResponse.json(
        { ok: true, answers, completed: session.completedAt !== null },
        { headers }
      );
    }

    case 'start': {
      await markGuestSessionStarted(supabase, session.id);
      return NextResponse.json({ ok: true }, { headers });
    }

    case 'answer': {
      await markGuestSessionStarted(supabase, session.id);
      await saveGuestAnswers(supabase, session.id, sanitizeGuestAnswers(body.answers));
      return NextResponse.json({ ok: true }, { headers });
    }

    case 'complete': {
      await saveGuestAnswers(supabase, session.id, sanitizeGuestAnswers(body.answers));
      await markGuestSessionCompleted(supabase, session.id);
      return NextResponse.json({ ok: true }, { headers });
    }

    default:
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400, headers });
  }
}
