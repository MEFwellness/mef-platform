/**
 * ONE DOOR IN, AND A PERSON HAS TO OPEN IT (2026-08-27).
 *
 * A PAGE RENDER MUST NOT INSERT A ROW. Every take page in this app used to
 * create the member's draft as a side effect of rendering: opening the URL
 * was the same thing as starting the assessment. That is how a read-only
 * audit crawl created a real `wellness_assessments` draft on a real
 * member's production account, and how a browser Back button, a refresh, a
 * bookmark or a Server Action re-render each looked like "she started
 * this". Once the draft existed, her Questionnaires card changed its own
 * call to action to "Resume assessment, 0 of 91 questions completed".
 *
 * Migration 186 fixed half of it for the four unified-runtime experiences
 * by refusing to restart something already finished. This is the other
 * half, and it covers every flow: the take route only ever READS. Creating
 * a session is a Server Action, reached by pressing a real button, and a
 * Server Action is a POST that Back/Forward cannot replay.
 *
 * The two halves of that split:
 *
 *   beginRuntimeAssessment   The button. Checks the gate, then starts or
 *                            resumes, then hands back where to go. Writes.
 *   loadRuntimeTakeSession   The take page. Checks the gate, then reads.
 *                            Never writes, whatever the outcome.
 *
 * Both take the same routes so a flow cannot answer "where do results
 * live" differently in its two halves.
 */

import { createClient } from '@/lib/supabase/server';
import { checkAssessmentAccess } from '@/lib/assessment-registry/access';
import { startOrResumeSession, type AssessmentSession, type RuntimeEvent } from './index';
import { getCachedUser } from '../supabase/currentUser';

export type RuntimeRoutes = {
  /** The overview screen: where a member goes when there is nothing to take. */
  overview: string;
  /** The take screen. */
  take: string;
  /** Given a completed session id, where its results live. */
  results: (sessionId: string) => string;
};

export type RuntimeEntryResult =
  | { ok: true; session: AssessmentSession; events: RuntimeEvent[]; takeHref: string }
  /** Nothing was written. `redirectTo` is where this member belongs instead. */
  | { ok: false; redirectTo: string };

async function currentMemberId(): Promise<string | null> {
  const user = await getCachedUser();
  return user?.id ?? null;
}

/**
 * The Start / Resume / Retake button. The only path in this codebase that
 * may create a unified-runtime session, and it is only ever reached from a
 * Server Action, never from a render.
 */
export async function beginRuntimeAssessment(
  assessmentKey: string,
  routes: RuntimeRoutes,
  options: { startRetake?: boolean } = {}
): Promise<RuntimeEntryResult> {
  const supabase = createClient();
  const memberId = await currentMemberId();
  if (!memberId) return { ok: false, redirectTo: '/login' };

  // 'start', not 'view'. Her own past completion is not permission to
  // begin a new attempt; see lib/assessment-registry/access.ts.
  const access = await checkAssessmentAccess(supabase, memberId, assessmentKey, {
    intent: 'start',
  });
  if (!access.allowed) return { ok: false, redirectTo: routes.overview };

  const result = await startOrResumeSession(supabase, memberId, assessmentKey, {
    startRetake: options.startRetake === true,
  });

  if (result.status === 'already_completed') {
    return { ok: false, redirectTo: routes.results(result.latestCompletedSessionId) };
  }
  if (result.status === 'not_found' || result.status === 'no_session') {
    return { ok: false, redirectTo: routes.overview };
  }

  return {
    ok: true,
    session: result.session,
    events: result.events,
    takeHref: routes.take,
  };
}

/**
 * The take page's read. Resumes a draft that already exists, sends a
 * finished member to her results, and sends everybody else back to the
 * overview to press the button. Writes nothing in any of those cases.
 */
export async function loadRuntimeTakeSession(
  assessmentKey: string,
  routes: RuntimeRoutes
): Promise<RuntimeEntryResult> {
  const supabase = createClient();
  const memberId = await currentMemberId();
  if (!memberId) return { ok: false, redirectTo: '/login' };

  // 'view', because a member reading her own finished assessment is the
  // case this hands to the results screen a few lines down, and that must
  // work even when her plan no longer includes starting a new one.
  const access = await checkAssessmentAccess(supabase, memberId, assessmentKey, {
    intent: 'view',
  });
  if (!access.allowed) return { ok: false, redirectTo: routes.overview };

  const result = await startOrResumeSession(supabase, memberId, assessmentKey, {
    createIfMissing: false,
  });

  if (result.status === 'resumed') {
    return { ok: true, session: result.session, events: result.events, takeHref: routes.take };
  }
  if (result.status === 'already_completed') {
    return { ok: false, redirectTo: routes.results(result.latestCompletedSessionId) };
  }
  return { ok: false, redirectTo: routes.overview };
}
