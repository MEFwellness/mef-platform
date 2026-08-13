/**
 * apps/consumer-web-app/app/actions/movement-sessions.ts
 *
 * Root Movement, Level 1 — the server actions the session player calls.
 *
 * Every one of them:
 *   - resolves the member from the session cookie, never from an argument,
 *     so a run can only ever be written for the person holding it;
 *   - validates the session key against movement_session_templates itself
 *     and the exercise id against that session's own slots, so the values
 *     that reach an analytics payload are members of a closed set defined
 *     in the database rather than strings that arrived from a browser;
 *   - records its analytics event through lib/analytics/track.ts, the one
 *     existing write path, and never lets a failed event break the member's
 *     action.
 *
 * PRIVACY: the arguments below are the entire surface. There is no note
 * parameter, no rating, no reason, and no free text anywhere in this file,
 * which is what makes "keys, ids, timestamps and counts only" a property
 * of the code rather than a promise about it.
 *
 * NOT HERE, deliberately: nothing writes to member_daily_priorities,
 * member_coaching_decisions, member_weekly_reviews or the pop-up chain.
 * Movement usage stays out of the coaching loop entirely this build.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import type { SupabaseClient } from '@supabase/supabase-js';
import { trackProductEvent, resolveMemberTimezone } from '@/lib/analytics/track';
import {
  appendSessionRunSkip,
  completeSessionRun,
  getSessionRun,
  getSessionTemplate,
  insertSessionRun,
  listTemplateSlots,
} from '@/lib/movement-sessions/data';

type MemberContext = { supabase: SupabaseClient; memberId: string; timezone: string };

async function memberContext(): Promise<MemberContext | null> {
  const user = await getCachedUser();
  if (!user) return null;
  const supabase = createClient();
  const timezone = await resolveMemberTimezone(supabase, user.id);
  return { supabase, memberId: user.id, timezone };
}

/**
 * True only when this key names one of the live templates. An unknown or
 * retired key is silently ignored everywhere below rather than raised: a
 * stale bookmark is a normal thing for a member to have, not an error to
 * show her.
 */
async function isKnownSessionKey(supabase: SupabaseClient, sessionKey: string): Promise<boolean> {
  const template = await getSessionTemplate(supabase, sessionKey);
  return template !== null;
}

/** True only when this exercise is genuinely one of that session's slots. */
async function isSlotOfSession(
  supabase: SupabaseClient,
  sessionKey: string,
  externalId: string
): Promise<boolean> {
  const template = await getSessionTemplate(supabase, sessionKey);
  if (!template) return false;
  const slots = await listTemplateSlots(supabase, template.id);
  return slots.some((slot) => slot.external_id === externalId);
}

/**
 * She opened a session's screen. Analytics only: opening a session is not
 * starting one, and nothing is written to her history here.
 */
export async function trackMovementSessionViewedAction(
  sessionKey: string,
  exerciseCount: number
): Promise<void> {
  try {
    const ctx = await memberContext();
    if (!ctx) return;
    if (!(await isKnownSessionKey(ctx.supabase, sessionKey))) return;

    await trackProductEvent(ctx.supabase, {
      memberId: ctx.memberId,
      eventType: 'movement_session_viewed',
      timezone: ctx.timezone,
      payload: { sessionKey, exerciseCount: String(Math.max(0, Math.trunc(exerciseCount))) },
    });
  } catch (error) {
    console.error('trackMovementSessionViewedAction failed', error);
  }
}

/**
 * She pressed begin. Returns the run id the rest of the session reports
 * against, or null when the run could not be written, in which case the
 * player still walks the session normally and simply records nothing.
 * A member is never blocked from moving because a database write failed.
 */
export async function startMovementSessionAction(sessionKey: string): Promise<string | null> {
  try {
    const ctx = await memberContext();
    if (!ctx) return null;
    if (!(await isKnownSessionKey(ctx.supabase, sessionKey))) return null;

    const run = await insertSessionRun(ctx.supabase, ctx.memberId, sessionKey);
    if (!run) return null;

    await trackProductEvent(ctx.supabase, {
      memberId: ctx.memberId,
      eventType: 'movement_session_started',
      timezone: ctx.timezone,
      payload: { sessionKey },
    });

    return run.id;
  } catch (error) {
    console.error('startMovementSessionAction failed', error);
    return null;
  }
}

/**
 * She skipped one exercise. The exercise id is checked against the run's
 * OWN session before anything is recorded, so an id that is not part of
 * this session cannot reach either the run row or an event payload.
 */
export async function skipMovementExerciseAction(
  runId: string,
  externalId: string
): Promise<boolean> {
  try {
    const ctx = await memberContext();
    if (!ctx) return false;

    const run = await getSessionRun(ctx.supabase, ctx.memberId, runId);
    if (!run) return false;
    if (!(await isSlotOfSession(ctx.supabase, run.session_key, externalId))) return false;

    const skipped = await appendSessionRunSkip(ctx.supabase, ctx.memberId, runId, externalId);
    if (skipped === null) return false;

    await trackProductEvent(ctx.supabase, {
      memberId: ctx.memberId,
      eventType: 'movement_exercise_skipped',
      timezone: ctx.timezone,
      payload: { sessionKey: run.session_key, exerciseId: externalId },
    });

    return true;
  } catch (error) {
    console.error('skipMovementExerciseAction failed', error);
    return false;
  }
}

/**
 * She reached the end. completeSessionRun only ever claims a run whose
 * completed_at is still null, so a double submit returns null here and
 * the completion event fires exactly once per run.
 */
export async function completeMovementSessionAction(runId: string): Promise<boolean> {
  try {
    const ctx = await memberContext();
    if (!ctx) return false;

    const run = await completeSessionRun(ctx.supabase, ctx.memberId, runId);
    if (!run) return false;

    await trackProductEvent(ctx.supabase, {
      memberId: ctx.memberId,
      eventType: 'movement_session_completed',
      timezone: ctx.timezone,
      payload: {
        sessionKey: run.session_key,
        skipCount: String(run.skipped_exercise_ids.length),
      },
    });

    return true;
  } catch (error) {
    console.error('completeMovementSessionAction failed', error);
    return false;
  }
}
